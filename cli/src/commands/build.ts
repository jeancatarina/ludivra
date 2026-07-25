import { resolve } from "node:path";
import type { CacheFamilyId } from "../artifact-cache.js";
import { ensureProjectAudio } from "../audio-forge.js";
import { optionValue } from "../arguments.js";
import { parseBuildOptions, runFamilies, summarizeDecisions } from "../build-runner.js";
import { resolveProjectDirectory } from "../project.js";
import { findEngineRoot } from "../repository.js";
import type { CommandContext, CommandOutcome } from "../result.js";

const supportedTargets = new Set(["web", "steam-macos", "steam-windows", "steam-linux"]);
const webFamilies: CacheFamilyId[] = ["contracts", "packages", "wasm", "web-bundle"];

export async function runBuild(context: CommandContext, arguments_: string[]): Promise<CommandOutcome> {
  const target = optionValue(arguments_, "--target") ?? "web";
  if (!supportedTargets.has(target)) {
    return {
      diagnostics: [{ code: "BUILD_TARGET_UNSUPPORTED", severity: "error", message: `Unsupported target: ${target}` }],
      nextActions: ["Use web, steam-macos, steam-windows, or steam-linux"]
    };
  }
  const options = parseBuildOptions(arguments_);
  const root = await findEngineRoot();
  const project = await resolveProjectDirectory(arguments_);
  // Recipes are cooked before the bundle: the host consumes the index, never a recipe.
  const audio = await ensureProjectAudio(root, project);
  const result = await runFamilies({
    runId: context.runId,
    root,
    evidenceRoot: project,
    project,
    families: webFamilies,
    environment: {
      ...process.env,
      LUDIVRA_GAME_DIR: project,
      LUDIVRA_BASE: target === "web" ? "/" : "./"
    },
    ...options
  });
  const diagnostics = [...audio.diagnostics, ...result.diagnostics];
  const failed = diagnostics.some(({ severity }) => severity === "error");
  return {
    diagnostics,
    artifacts: failed
      ? result.artifacts
      : [...result.artifacts, { kind: "web-build", path: resolve(root, "hosts/browser/dist") }],
    data: {
      project,
      target,
      watch: options.watch,
      rebuilds: result.rebuilds,
      audio: audio.rendered.map(({ id, output, reused }) => ({ id, output, reused })),
      cache: summarizeDecisions(result.decisions)
    },
    nextActions: failed
      ? ["Run game doctor and inspect the failed build tool"]
      : target === "web" ? ["Run game run to inspect the build"] : ["Run game package with the same target"]
  };
}
