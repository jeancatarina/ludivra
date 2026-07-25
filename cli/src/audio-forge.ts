import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import {
  audioCacheKey,
  AUDIO_GENERATOR_VERSION,
  inspect,
  renderAudioRecipe,
  type AudioAnalysis,
  type AudioRecipe
} from "@ludivra/audio-authoring";
import { parse, type ParseError } from "jsonc-parser";
import { optionValue } from "./arguments.js";
import { hashArtifactPath } from "./artifact-hash.js";
import { createContractValidator } from "./contract-validator.js";
import type { Artifact, Diagnostic } from "./generated/cli-result.js";
import { resolveProjectDirectory } from "./project.js";
import { findEngineRoot } from "./repository.js";
import type { CommandContext, CommandOutcome } from "./result.js";

const recipeSuffix = ".audio.jsonc";
const recipeDirectory = "audio";

export interface RenderedRecipeRecord {
  id: string;
  recipe: string;
  output: string;
  cacheKey: string;
  reused: boolean;
  sha256: string;
  analysis: AudioAnalysis;
}

async function collectRecipeFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectRecipeFiles(path)));
    else if (entry.name.endsWith(recipeSuffix)) files.push(path);
  }
  return files;
}

function parseRecipe(source: string, path: string): AudioRecipe {
  const errors: ParseError[] = [];
  const parsed = parse(source, errors) as AudioRecipe;
  if (errors.length > 0) throw new Error(`AUDIO_RECIPE_INVALID: ${path} is not valid JSONC`);
  return parsed;
}

/**
 * Renders every recipe of a project through the cache. The recipe is the source of
 * truth; the WAV is derived and lives in the ignored cache, identified by recipe,
 * generator version and seed.
 */
export async function runAudioCommand(
  context: CommandContext,
  arguments_: string[]
): Promise<CommandOutcome> {
  const action = arguments_[1] ?? "render";
  if (!["render", "preview", "inspect"].includes(action)) {
    return {
      diagnostics: [{
        code: "AUDIO_ACTION_UNKNOWN",
        severity: "error",
        message: `Unknown audio action: ${action}`
      }],
      nextActions: ["Use game audio render, preview or inspect"]
    };
  }

  const engineRoot = await findEngineRoot();
  const project = await resolveProjectDirectory(arguments_);
  const requestedId = optionValue(arguments_, "--id");
  const schema = JSON.parse(await readFile(resolve(engineRoot, "schemas/audio-recipe.schema.json"), "utf8"));
  const validate = createContractValidator().compile(schema);

  const files = await collectRecipeFiles(resolve(project, recipeDirectory));
  const diagnostics: Diagnostic[] = [];
  const rendered: RenderedRecipeRecord[] = [];
  const cacheDirectory = resolve(project, ".ludivra/cache/audio");
  await mkdir(cacheDirectory, { recursive: true });

  for (const file of files) {
    const displayPath = relative(project, file);
    let recipe: AudioRecipe;
    try {
      recipe = parseRecipe(await readFile(file, "utf8"), displayPath);
    } catch (error) {
      diagnostics.push({
        code: "AUDIO_RECIPE_INVALID",
        severity: "error",
        message: error instanceof Error ? error.message : "unreadable recipe",
        file: displayPath
      });
      continue;
    }
    if (!validate(recipe)) {
      diagnostics.push({
        code: "AUDIO_RECIPE_INVALID",
        severity: "error",
        message: `${displayPath} violates schemas/audio-recipe.schema.json`,
        file: displayPath,
        details: { errors: (validate.errors ?? []).map((error) => `${error.instancePath} ${error.message ?? ""}`.trim()) }
      });
      continue;
    }
    if (requestedId !== undefined && recipe.id !== requestedId) continue;

    const cacheKey = audioCacheKey(recipe);
    const output = resolve(cacheDirectory, `${cacheKey}.wav`);
    const existing = await hashArtifactPath(output).catch(() => null);

    // A rendered file whose key matches is the same audio by construction, so the
    // cache is consulted unless the caller asked for a fresh preview.
    const stored = existing === null || action === "preview"
      ? null
      : (JSON.parse(await readFile(`${output}.json`, "utf8").catch(() => "null")) as
          | { sha256: string; analysis: AudioAnalysis }
          | null);

    let sha256: string;
    let analysis: AudioAnalysis;
    const reused = stored !== null;
    if (stored !== null) {
      sha256 = stored.sha256;
      analysis = stored.analysis;
    } else {
      const result = renderAudioRecipe(recipe);
      await Promise.all([
        writeFile(output, result.wav),
        writeFile(
          `${output}.json`,
          `${JSON.stringify({ sha256: result.sha256, analysis: result.analysis }, null, 2)}\n`,
          "utf8"
        )
      ]);
      sha256 = result.sha256;
      analysis = result.analysis;
    }
    // Reused audio reports the same failures as freshly rendered audio; a cached
    // clipping defect must not become invisible.
    for (const issue of inspect(analysis)) {
      diagnostics.push({
        code: issue.code,
        severity: "error",
        message: `${recipe.id}: ${issue.message}`,
        file: displayPath
      });
    }

    rendered.push({
      id: recipe.id,
      recipe: displayPath,
      output: relative(project, output),
      cacheKey,
      reused,
      sha256,
      analysis
    });
  }

  if (requestedId !== undefined && rendered.length === 0 && diagnostics.length === 0) {
    diagnostics.push({
      code: "AUDIO_RECIPE_NOT_FOUND",
      severity: "error",
      message: `No recipe declares the id ${requestedId}`
    });
  }

  const artifacts: Artifact[] = [];
  if (action !== "inspect") {
    const runDirectory = resolve(project, "reports/runs", context.runId);
    await mkdir(runDirectory, { recursive: true });
    const reportPath = resolve(runDirectory, "audio-render.json");
    await writeFile(reportPath, `${JSON.stringify({
      generatorVersion: AUDIO_GENERATOR_VERSION,
      rendered
    }, null, 2)}\n`, "utf8");
    artifacts.push({ kind: "audio-render", path: reportPath, sha256: await hashArtifactPath(reportPath) });
    for (const record of rendered) {
      artifacts.push({
        kind: "audio-asset",
        path: resolve(project, record.output),
        sha256: record.sha256
      });
    }
  }

  return {
    diagnostics,
    artifacts,
    data: {
      project,
      action,
      generatorVersion: AUDIO_GENERATOR_VERSION,
      recipes: files.length,
      rendered: rendered.map((record) => ({
        id: record.id,
        recipe: record.recipe,
        output: record.output,
        reused: record.reused,
        durationMs: record.analysis.durationMs,
        sampleRate: record.analysis.sampleRate,
        peakDb: record.analysis.peakDb,
        rmsDb: record.analysis.rmsDb,
        sha256: record.sha256
      }))
    },
    nextActions: files.length === 0
      ? [`Create a recipe in ${recipeDirectory}/<name>${recipeSuffix} and run game audio render`]
      : ["Reference the recipe from game.jsonc with the recipe field"]
  };
}
