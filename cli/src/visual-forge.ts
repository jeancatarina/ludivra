import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import {
  compileCharacter,
  compileGeneratedRaster,
  compileTexture,
  parseStyleBible,
  productionCacheKey,
  productionCharacterRecipe,
  renderCharacterPreview,
  texturePrompt,
  validateGeneratedModel,
  visualCacheKey,
  VISUAL_GENERATOR_VERSION,
  type CharacterSpec,
  type ProductionCharacterSpec,
  type ProductionValidationReport,
  type TextureRequest,
  type VisualStyleBible,
  type VisualValidationReport
} from "@ludivra/visual-authoring";
import { optionValue } from "./arguments.js";
import { hashArtifactPath, sha256 } from "./artifact-hash.js";
import { createContractValidator } from "./contract-validator.js";
import type { Artifact, Diagnostic } from "./generated/cli-result.js";
import { resolveProjectDirectory } from "./project.js";
import { findEngineRoot } from "./repository.js";
import type { CommandContext, CommandOutcome } from "./result.js";

const characterSuffix = ".character.json";
const characterDirectory = "visuals";
const jobDirectory = ".ludivra/visual-jobs";
const visualCacheDirectory = ".ludivra/cache/visual";

export const VISUAL_INDEX_FILE = ".ludivra/visual-index.json";

export type VisualJobState =
  | "PLANNED"
  | "WAITING_FOR_TEXTURES"
  | "TEXTURES_IMPORTED"
  | "COMPILING"
  | "VALIDATING"
  | "NEEDS_REVISION"
  | "APPROVED";

interface VisualJob {
  schemaVersion: 1;
  id: string;
  description: string;
  spec: string;
  style: string;
  state: VisualJobState;
  textureRequests: Array<{ id: string; file: string; imported: boolean }>;
  cacheKey?: string;
  validation?: "passed" | "failed";
}

export interface RenderedVisualRecord {
  id: string;
  recipe: string;
  style: string;
  output: string;
  manifest: string;
  preview: string;
  validation: string;
  cacheKey: string;
  sha256: string;
  reused: boolean;
  animations: number;
  outputs?: Array<{
    id: string;
    mode: string;
    profile: string;
    artifact: string;
    preview: string;
    sha256: string;
    artifacts: Array<{ kind: string; path: string; sha256: string }>;
  }>;
  report: VisualValidationReport | ProductionValidationReport;
}

export interface VisualCompileResult {
  rendered: RenderedVisualRecord[];
  diagnostics: Diagnostic[];
  specs: number;
}

function jobPath(project: string, id: string): string {
  return resolve(project, jobDirectory, id, "job.json");
}

async function readJob(project: string, id: string): Promise<VisualJob | null> {
  const source = await readFile(jobPath(project, id), "utf8").catch(() => null);
  return source === null ? null : JSON.parse(source) as VisualJob;
}

async function writeJob(project: string, job: VisualJob): Promise<void> {
  const path = jobPath(project, job.id);
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(job, null, 2)}\n`, "utf8");
}

async function collectFiles(directory: string, suffix: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path, suffix));
    else if (entry.name.endsWith(suffix)) files.push(path);
  }
  return files;
}

function parseCharacter(source: string, path: string): CharacterSpec | ProductionCharacterSpec {
  try {
    return JSON.parse(source) as CharacterSpec | ProductionCharacterSpec;
  } catch {
    throw new Error(`VISUAL_SPEC_INVALID: ${path} is not valid JSON`);
  }
}

async function createVisualValidators(engineRoot: string): Promise<{
  character: ReturnType<ReturnType<typeof createContractValidator>["compile"]>;
  characterV2: ReturnType<ReturnType<typeof createContractValidator>["compile"]>;
  style: ReturnType<ReturnType<typeof createContractValidator>["compile"]>;
  manifest: ReturnType<ReturnType<typeof createContractValidator>["compile"]>;
  manifestV2: ReturnType<ReturnType<typeof createContractValidator>["compile"]>;
}> {
  const validator = createContractValidator();
  const [textureSchema, characterSchema, characterSchemaV2, styleSchema, manifestSchema, manifestSchemaV2] = await Promise.all([
    readFile(resolve(engineRoot, "schemas/texture-request.schema.json"), "utf8").then(JSON.parse),
    readFile(resolve(engineRoot, "schemas/character-spec.schema.json"), "utf8").then(JSON.parse),
    readFile(resolve(engineRoot, "schemas/character-spec-v2.schema.json"), "utf8").then(JSON.parse),
    readFile(resolve(engineRoot, "schemas/visual-style.schema.json"), "utf8").then(JSON.parse),
    readFile(resolve(engineRoot, "schemas/visual-forge-manifest.schema.json"), "utf8").then(JSON.parse),
    readFile(resolve(engineRoot, "schemas/visual-forge-manifest-v2.schema.json"), "utf8").then(JSON.parse)
  ]);
  validator.addSchema(textureSchema);
  return {
    character: validator.compile(characterSchema),
    characterV2: validator.compile(characterSchemaV2),
    style: validator.compile(styleSchema),
    manifest: validator.compile(manifestSchema),
    manifestV2: validator.compile(manifestSchemaV2)
  };
}

async function loadStyle(
  project: string,
  styleId: string,
  validate: ReturnType<ReturnType<typeof createContractValidator>["compile"]>
): Promise<{ style: VisualStyleBible; path: string; source: string }> {
  const path = resolve(project, "styles", styleId, "style.yaml");
  const source = await readFile(path, "utf8").catch(() => {
    throw new Error(`VISUAL_STYLE_MISSING: styles/${styleId}/style.yaml`);
  });
  const style = parseStyleBible(source);
  const ranges = [style.proportions?.heightM, style.proportions?.headScale, style.proportions?.shoulderScale];
  const rangesValid = ranges.every((range) => range !== undefined && range.min <= range.max);
  const budgetValid = style.geometry?.triangleBudget !== undefined &&
    style.geometry.triangleBudget.min <= style.geometry.triangleBudget.max;
  if (!validate(style) || style.id !== styleId || !rangesValid || !budgetValid) {
    throw new Error(`VISUAL_STYLE_MISSING: styles/${styleId}/style.yaml violates schemas/visual-style.schema.json`);
  }
  return { style, path, source };
}

function schemaDiagnostic(
  code: "VISUAL_SPEC_INVALID" | "VISUAL_STYLE_MISSING",
  file: string,
  errors: ReadonlyArray<{ instancePath: string; message?: string }> | null | undefined
): Diagnostic {
  return {
    code,
    severity: "error",
    message: `${file} violates its Visual Forge schema`,
    file,
    details: { errors: (errors ?? []).map((error) => `${error.instancePath} ${error.message ?? ""}`.trim()) }
  };
}

function slug(value: string): string {
  const normalized = value.normalize("NFKD").replaceAll(/[\u0300-\u036f]/g, "").toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
  return normalized || "character";
}

function seedFrom(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function includesAny(source: string, values: string[]): boolean {
  return values.some((value) => source.includes(value));
}

function planSpec(description: string, id: string, style: VisualStyleBible, seed: number): CharacterSpec {
  const source = description.normalize("NFKD").replaceAll(/[\u0300-\u036f]/g, "").toLowerCase();
  const head = includesAny(source, ["goblin"]) ? "goblin"
    : includesAny(source, ["orc", "orque"]) ? "orc"
      : includesAny(source, ["skeleton", "esqueleto"]) ? "skeleton"
        : includesAny(source, ["demon", "demonio"]) ? "simple-demon"
          : "human";
  const equipmentType = includesAny(source, ["staff", "cajado"]) ? "staff"
    : includesAny(source, ["axe", "machado"]) ? "axe"
      : includesAny(source, ["shield", "escudo"]) ? "shield"
        : includesAny(source, ["bow", "arco"]) ? "bow"
          : includesAny(source, ["sword", "espada"]) ? "sword"
            : null;
  const clothingType = includesAny(source, ["robe"]) ? "robe"
    : includesAny(source, ["cape", "capa"]) ? "cape"
      : includesAny(source, ["armor", "armadura"]) ? "light-armor"
        : includesAny(source, ["wrap", "faixa"]) ? "wraps"
          : "tunic";
  const accessoryTypes = [
    ["horn", "chifre", "horns"],
    ["bone", "osso", "bones"],
    ["mask", "mascara", "mask"],
    ["pouch", "bolsa", "pouch"],
    ["necklace", "colar", "necklace"],
    ["crystal", "cristal", "crystal"]
  ] as const;
  const surfaces: TextureRequest[] = includesAny(source, ["texture", "textura", "surface", "superficie", "decal"])
    ? [{
        id: "surface.primary",
        kind: includesAny(source, ["decal"]) ? "decal" : "swatch",
        material: clothingType === "light-armor" ? "metal" : "cloth",
        projection: includesAny(source, ["decal"]) ? "decal" : "triplanar",
        resolution: 512,
        origin: "generated",
        license: "project_owned",
        requirements: { tileable: !includesAny(source, ["decal"]) },
        artDirection: description,
        negative: ["normal-map", "roughness-map", "full-character-uv", "transparent-background", "photorealism"]
      }]
    : [];
  const small = includesAny(source, ["small", "pequeno", "goblin"]);
  const heightMid = (style.proportions.heightM.min + style.proportions.heightM.max) * 0.5;
  return {
    schemaVersion: 1,
    id,
    style: style.id,
    seed,
    archetype: { body: small ? "small-humanoid" : "medium-humanoid", head },
    anatomy: {
      heightM: Math.min(style.proportions.heightM.max, Math.max(style.proportions.heightM.min, small ? heightMid * 0.78 : heightMid)),
      headScale: (style.proportions.headScale.min + style.proportions.headScale.max) * 0.5,
      shoulderScale: (style.proportions.shoulderScale.min + style.proportions.shoulderScale.max) * 0.5,
      armScale: 1,
      legScale: small ? 0.88 : 1,
      posture: includesAny(source, ["hunched", "corcunda"]) ? 0.75 : 0
    },
    face: {
      generator: head,
      eyes: head === "goblin" ? 0.75 : 0.5,
      jaw: head === "orc" ? 0.82 : 0.5,
      nose: head === "skeleton" ? 0.1 : 0.5
    },
    skin: head === "skeleton" ? "bone" : "skin",
    clothing: [{
      type: clothingType,
      material: clothingType === "light-armor" ? "metal" : "cloth",
      colorRole: "cloth",
      fit: clothingType === "robe" ? 0.35 : 0.65,
      asymmetry: style.geometry.asymmetry
    }],
    equipment: equipmentType === null ? [] : [{
      type: equipmentType,
      material: equipmentType === "shield" || equipmentType === "sword" || equipmentType === "axe" ? "metal" : "wood",
      hand: equipmentType === "bow" ? "both" : "right",
      scale: 1
    }],
    accessories: accessoryTypes
      .filter(([left, middle]) => includesAny(source, [left, middle]))
      .map(([, , type]) => ({
        type,
        material: type === "crystal" ? "crystal" as const : type === "mask" || type === "pouch" ? "wood" as const : "bone" as const,
        anchor: type === "pouch" ? "waist" as const : type === "crystal" ? "chest" as const : "head" as const,
        scale: 1
      })),
    animations: ["idle", "walk", "run", "attack", "cast", "hit", "death"],
    effects: includesAny(source, ["magic", "magia"])
      ? [{ id: "effect.magic", colorRole: "accent", anchor: "right-hand" }]
      : [],
    surfaces
  };
}

async function runPlan(
  project: string,
  engineRoot: string,
  arguments_: string[]
): Promise<CommandOutcome> {
  const description = arguments_[2];
  if (description === undefined || description.startsWith("--")) {
    return {
      diagnostics: [{ code: "VISUAL_SPEC_INVALID", severity: "error", message: "Visual plan requires a description" }],
      nextActions: ['Run game visual plan "<description>" --style <style-id>']
    };
  }
  const styleId = optionValue(arguments_, "--style") ?? "default";
  const validators = await createVisualValidators(engineRoot);
  let loaded: { style: VisualStyleBible; path: string; source: string };
  try {
    loaded = await loadStyle(project, styleId, validators.style);
  } catch (error) {
    return {
      diagnostics: [{
        code: "VISUAL_STYLE_MISSING",
        severity: "error",
        message: error instanceof Error ? error.message : `Style ${styleId} is unavailable`
      }],
      nextActions: [`Create styles/${styleId}/style.yaml before planning a visual`]
    };
  }
  const requestedId = optionValue(arguments_, "--id");
  const id = requestedId ?? `visual.${slug(description).split("-").slice(0, 5).join(".")}`;
  const seedOption = optionValue(arguments_, "--seed");
  const seed = seedOption === undefined ? seedFrom(`${id}\0${description}`) : Number.parseInt(seedOption, 10);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    return {
      diagnostics: [{ code: "VISUAL_SPEC_INVALID", severity: "error", message: "Visual seed must be an unsigned 32-bit integer" }],
      nextActions: ["Use --seed between 0 and 4294967295"]
    };
  }
  const spec = planSpec(description, id, loaded.style, seed);
  if (!validators.character(spec)) {
    return {
      diagnostics: [schemaDiagnostic("VISUAL_SPEC_INVALID", `${id}${characterSuffix}`, validators.character.errors)],
      nextActions: ["Use a semantic lowercase --id and supported humanoid parameters"]
    };
  }
  const specPath = resolve(project, characterDirectory, `${id.replaceAll(".", "-")}${characterSuffix}`);
  const existing = await readFile(specPath).catch(() => null);
  if (existing !== null) {
    return {
      diagnostics: [{ code: "VISUAL_SPEC_INVALID", severity: "error", message: `CharacterSpec already exists: ${relative(project, specPath)}` }],
      nextActions: ["Edit the existing textual spec or choose another --id"]
    };
  }
  await mkdir(resolve(specPath, ".."), { recursive: true });
  await writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
  const job: VisualJob = {
    schemaVersion: 1,
    id,
    description,
    spec: relative(project, specPath),
    style: relative(project, loaded.path),
    state: spec.surfaces.length === 0 ? "PLANNED" : "WAITING_FOR_TEXTURES",
    textureRequests: spec.surfaces.map((request) => ({ id: request.id, file: `${request.id}.png`, imported: false }))
  };
  const requestsPath = resolve(project, jobDirectory, id, "requests");
  await mkdir(requestsPath, { recursive: true });
  for (const request of spec.surfaces) {
    await Promise.all([
      writeFile(resolve(requestsPath, `${request.id}.request.json`), `${JSON.stringify(request, null, 2)}\n`, "utf8"),
      writeFile(resolve(requestsPath, `${request.id}.prompt.txt`), `${texturePrompt(loaded.style, request)}\n`, "utf8")
    ]);
  }
  await writeJob(project, job);
  return {
    diagnostics: [],
    artifacts: [
      { kind: "visual-spec", path: specPath, sha256: await hashArtifactPath(specPath) },
      { kind: "visual-job", path: jobPath(project, id), sha256: await hashArtifactPath(jobPath(project, id)) }
    ],
    data: {
      project,
      action: "plan",
      id,
      spec: relative(project, specPath),
      style: styleId,
      seed,
      state: job.state,
      textureRequests: spec.surfaces.map(({ id: requestId }) => ({
        id: requestId,
        prompt: relative(project, resolve(requestsPath, `${requestId}.prompt.txt`)),
        expected: `${requestId}.png`
      }))
    },
    nextActions: spec.surfaces.length === 0
      ? [`Run game visual compile ${id} --project ${project}`]
      : [`Place requested PNGs in an inbox and run game visual import <inbox> --id ${id}`]
  };
}

async function runImport(project: string, arguments_: string[]): Promise<CommandOutcome> {
  const inboxArgument = arguments_[2];
  if (inboxArgument === undefined || inboxArgument.startsWith("--")) {
    return {
      diagnostics: [{ code: "VISUAL_TEXTURE_REQUEST_UNFULFILLED", severity: "error", message: "Visual import requires an inbox path" }],
      nextActions: ["Run game visual import <inbox> --id <visual-id>"]
    };
  }
  const requestedId = optionValue(arguments_, "--id");
  const jobFiles = requestedId === undefined
    ? await collectFiles(resolve(project, jobDirectory), "job.json")
    : [jobPath(project, requestedId)];
  const inbox = resolve(inboxArgument);
  const diagnostics: Diagnostic[] = [];
  const artifacts: Artifact[] = [];
  const imported: Array<{ id: string; files: string[]; state: VisualJobState }> = [];
  for (const file of jobFiles) {
    const source = await readFile(file, "utf8").catch(() => null);
    if (source === null) continue;
    const job = JSON.parse(source) as VisualJob;
    const targetDirectory = resolve(project, jobDirectory, job.id, "imported");
    await mkdir(targetDirectory, { recursive: true });
    const copied: string[] = [];
    for (const request of job.textureRequests) {
      const sourcePath = resolve(inbox, request.file);
      const relation = relative(inbox, sourcePath);
      if (relation.startsWith("..") || isAbsolute(relation)) {
        diagnostics.push({
          code: "VISUAL_TEXTURE_REQUEST_UNFULFILLED",
          severity: "error",
          message: `Texture request escapes the inbox: ${request.file}`
        });
        continue;
      }
      const target = resolve(targetDirectory, request.file);
      try {
        await copyFile(sourcePath, target);
        request.imported = true;
        copied.push(relative(project, target));
        artifacts.push({ kind: "visual-texture-input", path: target, sha256: await hashArtifactPath(target) });
      } catch {
        diagnostics.push({
          code: "VISUAL_TEXTURE_REQUEST_UNFULFILLED",
          severity: "error",
          message: `${job.id} expects ${request.file} in ${inbox}`
        });
      }
    }
    job.state = job.textureRequests.every(({ imported: available }) => available)
      ? "TEXTURES_IMPORTED"
      : "WAITING_FOR_TEXTURES";
    await writeJob(project, job);
    imported.push({ id: job.id, files: copied, state: job.state });
  }
  if (imported.length === 0 && diagnostics.length === 0) {
    diagnostics.push({
      code: "VISUAL_SPEC_INVALID",
      severity: "error",
      message: requestedId === undefined ? "No visual jobs are available" : `Visual job not found: ${requestedId}`
    });
  }
  return {
    diagnostics,
    artifacts,
    data: { project, action: "import", imported },
    nextActions: diagnostics.length === 0
      ? imported.map(({ id }) => `Run game visual compile ${id} --project ${project}`)
      : ["Fulfil every declared texture request and import again"]
  };
}

function outputDiagnostics(
  id: string,
  recipe: string,
  report: Pick<VisualValidationReport | ProductionValidationReport, "checks">
): Diagnostic[] {
  return report.checks
    .filter(({ status }) => status === "failed")
    .map((check) => ({
      code: check.code ?? "VISUAL_JOB_NEEDS_REVISION",
      severity: "error" as const,
      message: `${id}: ${check.message}`,
      file: recipe
    }));
}

async function writeIndex(
  project: string,
  entries: RenderedVisualRecord[],
  onlyId: string | undefined
): Promise<void> {
  const current = onlyId === undefined
    ? []
    : (JSON.parse(await readFile(resolve(project, VISUAL_INDEX_FILE), "utf8").catch(() => '{"entries":[]}')) as {
        entries?: Array<{
          id: string;
          recipe: string;
          output: string;
          manifest: string;
          preview: string;
          sha256: string;
          outputs?: Array<{
            id: string;
            mode: string;
            profile: string;
            artifact: string;
            preview: string;
            sha256: string;
            artifacts: Array<{ kind: string; path: string; sha256: string }>;
          }>;
        }>;
      }).entries ?? [];
  const replacementIds = new Set(entries.map(({ id }) => id));
  const merged = [
    ...current.filter(({ id }) => !replacementIds.has(id)),
    ...entries.map(({ id, recipe, output, manifest, preview, sha256, outputs }) => ({
      id, recipe, output, manifest, preview, sha256, ...(outputs === undefined ? {} : { outputs })
    }))
  ].sort((left, right) => left.id.localeCompare(right.id));
  await mkdir(resolve(project, ".ludivra"), { recursive: true });
  await writeFile(resolve(project, VISUAL_INDEX_FILE), `${JSON.stringify({
    generatorVersion: VISUAL_GENERATOR_VERSION,
    entries: merged
  }, null, 2)}\n`, "utf8");
}

async function compileProductionSpec(
  project: string,
  file: string,
  displayPath: string,
  spec: ProductionCharacterSpec,
  loaded: { style: VisualStyleBible; path: string; source: string },
  validateManifest: ReturnType<ReturnType<typeof createContractValidator>["compile"]>,
  forceCompile: boolean,
  diagnostics: Diagnostic[]
): Promise<RenderedVisualRecord | null> {
  const recipeBytes = await readFile(file);
  const recipeSha256 = sha256(recipeBytes);
  const cacheKey = productionCacheKey(spec, loaded.source);
  const outputDirectory = resolve(project, visualCacheDirectory, cacheKey);
  const manifestPath = resolve(outputDirectory, "manifest.json");
  const stored = forceCompile
    ? null
    : JSON.parse(await readFile(manifestPath, "utf8").catch(() => "null")) as {
        source?: { cacheKey?: string };
        outputs?: Array<{
          id: string;
          mode: string;
          profile: string;
          artifacts: Array<{ kind: string; path: string; sha256: string }>;
          metrics?: Record<string, unknown>;
        }>;
        validation?: { report?: string };
      } | null;
  const reused = stored?.source?.cacheKey === cacheKey;
  const existingJob = await readJob(project, spec.id);
  const job: VisualJob = existingJob ?? {
    schemaVersion: 1,
    id: spec.id,
    description: spec.identity.description,
    spec: displayPath,
    style: relative(project, loaded.path),
    state: "PLANNED",
    textureRequests: []
  };
  const preserveApproval = reused && job.state === "APPROVED";
  job.state = preserveApproval ? "APPROVED" : "COMPILING";
  job.cacheKey = cacheKey;
  await writeJob(project, job);

  let aggregate: ProductionValidationReport;
  let manifestOutputs: NonNullable<typeof stored>["outputs"] = [];
  if (!reused) {
    await mkdir(outputDirectory, { recursive: true });
    const reports: Array<{ id: string; report: ProductionValidationReport }> = [];
    const outputs: Array<{
      id: string;
      mode: string;
      profile: string;
      quality: string;
      generatedFrom: { kind: "canonical-character"; canonicalId: string; recipeSha256: string };
      artifacts: Array<{ kind: string; path: string; sha256: string }>;
      metrics: ProductionValidationReport["metrics"];
      validation: { status: "passed" | "failed"; report: string };
    }> = [];
    try {
      const compiled = compileCharacter(productionCharacterRecipe(spec), loaded.style);
      for (const output of spec.outputs) {
        const targetDirectory = resolve(outputDirectory, "outputs", output.id);
        await mkdir(targetDirectory, { recursive: true });
        let report: ProductionValidationReport;
        let artifactNames: Array<[string, string]>;
        if (output.mode === "3d") {
          report = validateGeneratedModel(compiled, spec, output);
          const previewOutput = spec.outputs.find((candidate) => candidate.mode === "2d");
          const generatedPreview = compileGeneratedRaster(
            compiled,
            spec,
            loaded.style,
            previewOutput?.mode === "2d"
              ? previewOutput
              : {
                  id: `${output.id}.preview`,
                  mode: "2d",
                  profile: "illustrated-character-2d",
                  quality: "production",
                  resolution: 768,
                  camera: { yaw: 25, pitch: 10 },
                  pixelsPerMeter: 512,
                  padding: 16,
                  edgeExtrusion: 4,
                  animations: ["idle"]
                }
          );
          await Promise.all([
            writeFile(resolve(targetDirectory, "model.gltf"), compiled.model.gltf, "utf8"),
            writeFile(resolve(targetDirectory, "model.bin"), compiled.model.binary),
            writeFile(resolve(targetDirectory, "albedo.png"), compiled.model.textures.albedo),
            writeFile(resolve(targetDirectory, "normal.png"), compiled.model.textures.normal),
            writeFile(resolve(targetDirectory, "metallic-roughness.png"), compiled.model.textures.roughness),
            writeFile(resolve(targetDirectory, "preview.png"), generatedPreview.atlas)
          ]);
          artifactNames = [
            ["model", "model.gltf"],
            ["mesh-buffer", "model.bin"],
            ["albedo", "albedo.png"],
            ["normal", "normal.png"],
            ["metallic-roughness", "metallic-roughness.png"],
            ["preview", "preview.png"]
          ];
        } else {
          const raster = compileGeneratedRaster(compiled, spec, loaded.style, output);
          report = raster.report;
          await Promise.all([
            writeFile(resolve(targetDirectory, "atlas.png"), raster.atlas),
            writeFile(resolve(targetDirectory, "atlas.json"), `${JSON.stringify(raster.metadata, null, 2)}\n`, "utf8"),
            writeFile(resolve(targetDirectory, "preview.png"), raster.atlas)
          ]);
          artifactNames = [["atlas", "atlas.png"], ["atlas-metadata", "atlas.json"], ["preview", "preview.png"]];
        }
        await writeFile(resolve(targetDirectory, "validation.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
        artifactNames.push(["validation", "validation.json"]);
        const artifacts = await Promise.all(artifactNames.map(async ([kind, name]) => ({
          kind,
          path: relative(outputDirectory, resolve(targetDirectory, name)),
          sha256: await hashArtifactPath(resolve(targetDirectory, name))
        })));
        outputs.push({
          id: output.id,
          mode: output.mode,
          profile: output.profile,
          quality: output.quality,
          generatedFrom: { kind: "canonical-character", canonicalId: spec.id, recipeSha256 },
          artifacts,
          metrics: report.metrics,
          validation: {
            status: report.status,
            report: relative(outputDirectory, resolve(targetDirectory, "validation.json"))
          }
        });
        reports.push({ id: output.id, report });
      }
    } catch (error) {
      diagnostics.push({
        code: "VISUAL_QUALITY_PROFILE_FAILED",
        severity: "error",
        message: error instanceof Error ? `${spec.id}: ${error.message}` : `${spec.id}: production compilation failed`,
        file: displayPath
      });
      job.state = "NEEDS_REVISION";
      job.validation = "failed";
      await writeJob(project, job);
      return null;
    }
    const failedOutputs = reports.filter(({ report }) => report.status === "failed").length;
    aggregate = {
      schemaVersion: 1,
      profile: "multi-render-production",
      quality: "production",
      status: failedOutputs === 0 ? "passed" : "failed",
      checks: reports.flatMap(({ id, report }) => report.checks.map((check) => ({
        ...check,
        id: `${id}.${check.id}`,
        message: `${id}: ${check.message}`
      }))),
      metrics: {
        outputs: reports.length,
        failedOutputs,
        modes: spec.outputs.map(({ mode }) => mode)
      }
    };
    await writeFile(resolve(outputDirectory, "validation.json"), `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");
    const manifest = {
      schemaVersion: 2,
      family: "visual",
      id: spec.id,
      generator: {
        name: "@ludivra/visual-authoring",
        version: VISUAL_GENERATOR_VERSION,
        pipeline: "canonical-character-local"
      },
      source: {
        kind: "forge-recipe",
        recipe: displayPath,
        recipeSha256,
        style: relative(project, loaded.path),
        styleSha256: sha256(loaded.source),
        seed: spec.seed,
        cacheKey
      },
      outputs,
      validation: { status: aggregate.status, report: "validation.json" },
      regeneration: `game visual compile ${spec.id} --project .`
    };
    if (!validateManifest(manifest)) {
      diagnostics.push({
        code: "FORGE_MANIFEST_MISSING",
        severity: "error",
        message: validateManifest.errors?.map((error) => `${error.instancePath} ${error.message}`).join("; ") ??
          "Visual production manifest is invalid",
        file: relative(project, manifestPath)
      });
      return null;
    }
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    manifestOutputs = outputs;
  } else {
    aggregate = JSON.parse(
      await readFile(resolve(outputDirectory, stored.validation?.report ?? "validation.json"), "utf8")
    ) as ProductionValidationReport;
    manifestOutputs = stored.outputs ?? [];
  }

  diagnostics.push(...outputDiagnostics(spec.id, displayPath, aggregate));
  job.validation = aggregate.status;
  job.state = preserveApproval && aggregate.status === "passed"
    ? "APPROVED"
    : aggregate.status === "passed" ? "VALIDATING" : "NEEDS_REVISION";
  await writeJob(project, job);

  const outputRecords = (manifestOutputs ?? []).map((output) => {
    const primary = output.artifacts.find(({ kind }) => kind === "model" || kind === "atlas") ?? output.artifacts[0]!;
    const preview = output.artifacts.find(({ kind }) => kind === "preview") ?? primary;
    return {
      id: output.id,
      mode: output.mode,
      profile: output.profile,
      artifact: relative(project, resolve(outputDirectory, primary.path)),
      preview: relative(project, resolve(outputDirectory, preview.path)),
      sha256: primary.sha256,
      artifacts: output.artifacts.map((artifact) => ({
        ...artifact,
        path: relative(project, resolve(outputDirectory, artifact.path))
      }))
    };
  });
  const primary = outputRecords[0];
  if (primary === undefined) return null;
  const animationCount = spec.outputs.reduce((sum, output) => {
    if (output.mode !== "3d") return sum + output.animations.length;
    const value = manifestOutputs?.find(({ id }) => id === output.id)?.metrics?.animations;
    return sum + (Array.isArray(value) ? value.length : 0);
  }, 0);
  return {
    id: spec.id,
    recipe: displayPath,
    style: relative(project, loaded.path),
    output: primary.artifact,
    manifest: relative(project, manifestPath),
    preview: primary.preview,
    validation: relative(project, resolve(outputDirectory, "validation.json")),
    cacheKey,
    sha256: primary.sha256,
    reused,
    animations: animationCount,
    outputs: outputRecords,
    report: aggregate
  };
}

export async function ensureProjectVisuals(
  engineRoot: string,
  project: string,
  options: { forceCompile?: boolean; onlyId?: string } = {}
): Promise<VisualCompileResult> {
  const validators = await createVisualValidators(engineRoot);
  const files = await collectFiles(resolve(project, characterDirectory), characterSuffix);
  const diagnostics: Diagnostic[] = [];
  const rendered: RenderedVisualRecord[] = [];

  for (const file of files) {
    const displayPath = relative(project, file);
    let spec: CharacterSpec | ProductionCharacterSpec;
    try {
      spec = parseCharacter(await readFile(file, "utf8"), displayPath);
    } catch (error) {
      diagnostics.push({
        code: "VISUAL_SPEC_INVALID",
        severity: "error",
        message: error instanceof Error ? error.message : `Unable to read ${displayPath}`,
        file: displayPath
      });
      continue;
    }
    if (options.onlyId !== undefined && spec.id !== options.onlyId) continue;
    const characterValidator = spec.schemaVersion === 2 ? validators.characterV2 : validators.character;
    if (!characterValidator(spec)) {
      diagnostics.push(schemaDiagnostic("VISUAL_SPEC_INVALID", displayPath, characterValidator.errors));
      continue;
    }
    let loaded: { style: VisualStyleBible; path: string; source: string };
    try {
      loaded = await loadStyle(project, spec.style, validators.style);
    } catch (error) {
      diagnostics.push({
        code: "VISUAL_STYLE_MISSING",
        severity: "error",
        message: error instanceof Error ? error.message : `Style ${spec.style} is unavailable`,
        file: displayPath
      });
      continue;
    }
    if (spec.schemaVersion === 2) {
      const record = await compileProductionSpec(
        project,
        file,
        displayPath,
        spec,
        loaded,
        validators.manifestV2,
        options.forceCompile === true,
        diagnostics
      );
      if (record !== null) rendered.push(record);
      continue;
    }
    const existingJob = await readJob(project, spec.id);
    const job: VisualJob = existingJob ?? {
      schemaVersion: 1,
      id: spec.id,
      description: "authored CharacterSpec",
      spec: displayPath,
      style: relative(project, loaded.path),
      state: spec.surfaces.length === 0 ? "PLANNED" : "WAITING_FOR_TEXTURES",
      textureRequests: spec.surfaces.map((request) => ({ id: request.id, file: `${request.id}.png`, imported: false }))
    };
    const textureHashes: Record<string, string> = {};
    const textureInputs = new Map<string, Uint8Array>();
    let missingTexture = false;
    for (const request of spec.surfaces) {
      const path = resolve(project, jobDirectory, spec.id, "imported", `${request.id}.png`);
      try {
        const bytes = await readFile(path);
        textureInputs.set(request.id, bytes);
        textureHashes[request.id] = sha256(bytes);
        const record = job.textureRequests.find(({ id }) => id === request.id);
        if (record !== undefined) record.imported = true;
      } catch {
        diagnostics.push({
          code: "VISUAL_TEXTURE_REQUEST_UNFULFILLED",
          severity: "error",
          message: `${spec.id} requires ${request.id}.png before compilation`,
          file: displayPath
        });
        missingTexture = true;
      }
    }
    if (missingTexture) {
      job.state = "WAITING_FOR_TEXTURES";
      await writeJob(project, job);
      continue;
    }
    const cacheKey = visualCacheKey(spec, loaded.style, textureHashes);
    const outputDirectory = resolve(project, visualCacheDirectory, cacheKey);
    const manifestPath = resolve(outputDirectory, "manifest.json");
    const stored = options.forceCompile === true
      ? null
      : JSON.parse(await readFile(manifestPath, "utf8").catch(() => "null")) as {
          source?: { cacheKey?: string };
          validation?: { report?: string };
        } | null;
    let report: VisualValidationReport;
    const reused = stored?.source?.cacheKey === cacheKey;
    const preserveApproval = reused && job.state === "APPROVED";
    job.state = preserveApproval ? "APPROVED" : "COMPILING";
    job.cacheKey = cacheKey;
    await writeJob(project, job);
    if (!reused) {
      await mkdir(resolve(outputDirectory, "textures"), { recursive: true });
      const compiled = compileCharacter(spec, loaded.style);
      report = compiled.validation;
      let textureCompilationFailed = false;
      for (const request of spec.surfaces) {
        const input = textureInputs.get(request.id);
        if (input === undefined) continue;
        if (request.kind === "concept") {
          await writeFile(resolve(outputDirectory, "textures", `${request.id}-concept.png`), input);
          continue;
        }
        try {
          const texture = compileTexture(input, request, loaded.style);
          for (const issue of texture.issues) {
            diagnostics.push({ code: issue.code, severity: "error", message: `${spec.id}: ${issue.message}`, file: displayPath });
            report.checks.push({
              id: `texture-${request.id}`,
              status: "failed",
              code: issue.code,
              message: issue.message
            });
            report.status = "failed";
          }
          await Promise.all(Object.entries(texture.maps).map(([kind, map]) =>
            writeFile(resolve(outputDirectory, "textures", `${request.id}-${kind}.png`), map.bytes)
          ));
        } catch (error) {
          textureCompilationFailed = true;
          diagnostics.push({
            code: "VISUAL_TEXTURE_REQUEST_UNFULFILLED",
            severity: "error",
            message: error instanceof Error ? `${spec.id}: ${error.message}` : `${spec.id}: texture compilation failed`,
            file: displayPath
          });
        }
      }
      if (textureCompilationFailed) {
        job.state = "NEEDS_REVISION";
        job.validation = "failed";
        await writeJob(project, job);
        continue;
      }
      await Promise.all([
        writeFile(resolve(outputDirectory, "model.gltf"), compiled.model.gltf, "utf8"),
        writeFile(resolve(outputDirectory, "model.bin"), compiled.model.binary),
        writeFile(
          resolve(outputDirectory, "preview.svg"),
          renderCharacterPreview(spec, loaded.style, compiled.geometry, report),
          "utf8"
        ),
        writeFile(resolve(outputDirectory, "validation.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
        writeFile(resolve(outputDirectory, "material.json"), `${JSON.stringify(compiled.material, null, 2)}\n`, "utf8")
      ]);
      const baseArtifacts = await Promise.all(([
        ["model", "model.gltf"],
        ["mesh-buffer", "model.bin"],
        ["material", "material.json"],
        ["preview", "preview.svg"],
        ["validation", "validation.json"]
      ] as const).map(async ([kind, name]) => ({
        kind,
        path: name,
        sha256: await hashArtifactPath(resolve(outputDirectory, name))
      })));
      const textureArtifacts = await Promise.all(
        (await collectFiles(resolve(outputDirectory, "textures"), ".png")).map(async (path) => ({
          kind: "texture",
          path: relative(outputDirectory, path),
          sha256: await hashArtifactPath(path)
        }))
      );
      const manifest = {
        schemaVersion: 1,
        family: "visual",
        id: spec.id,
        generator: { name: "@ludivra/visual-authoring", version: VISUAL_GENERATOR_VERSION },
        source: {
          recipe: displayPath,
          recipeSha256: sha256(await readFile(file)),
          style: relative(project, loaded.path),
          styleSha256: sha256(loaded.source),
          seed: spec.seed,
          cacheKey
        },
        inputs: [...textureInputs.entries()].map(([id, bytes]) => {
          const request = spec.surfaces.find((candidate) => candidate.id === id);
          return {
            id,
            origin: request?.origin ?? "unknown",
            license: request?.license ?? "unknown",
            sha256: sha256(bytes)
          };
        }),
        artifacts: [...baseArtifacts, ...textureArtifacts],
        metrics: {
          triangles: report.metrics.triangles,
          vertices: report.metrics.vertices,
          bones: report.metrics.bones,
          materials: 1,
          animations: spec.animations.length,
          bounds: report.metrics.bounds
        },
        validation: { status: report.status, report: "validation.json" },
        regeneration: `game visual compile ${spec.id} --project .`
      };
      if (!validators.manifest(manifest)) {
        diagnostics.push({
          code: "FORGE_MANIFEST_MISSING",
          severity: "error",
          message: validators.manifest.errors?.map((error) => `${error.instancePath} ${error.message}`).join("; ") ?? "Visual manifest is invalid",
          file: relative(project, manifestPath)
        });
        continue;
      }
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    } else {
      report = JSON.parse(await readFile(resolve(outputDirectory, stored.validation?.report ?? "validation.json"), "utf8")) as VisualValidationReport;
    }
    diagnostics.push(...outputDiagnostics(spec.id, displayPath, report));
    job.validation = report.status;
    job.state = preserveApproval && report.status === "passed"
      ? "APPROVED"
      : report.status === "passed" ? "VALIDATING" : "NEEDS_REVISION";
    await writeJob(project, job);
    rendered.push({
      id: spec.id,
      recipe: displayPath,
      style: relative(project, loaded.path),
      output: relative(project, resolve(outputDirectory, "model.gltf")),
      manifest: relative(project, manifestPath),
      preview: relative(project, resolve(outputDirectory, "preview.svg")),
      validation: relative(project, resolve(outputDirectory, "validation.json")),
      cacheKey,
      sha256: await hashArtifactPath(resolve(outputDirectory, "model.gltf")),
      reused,
      animations: spec.animations.length,
      report
    });
  }
  await writeIndex(project, rendered, options.onlyId);
  return { rendered, diagnostics, specs: files.length };
}

async function readCompiledRecord(project: string, id: string): Promise<{
  entry: { id: string; output: string; manifest: string; preview: string; sha256: string };
  report: VisualValidationReport | ProductionValidationReport;
} | null> {
  const index = JSON.parse(await readFile(resolve(project, VISUAL_INDEX_FILE), "utf8").catch(() => '{"entries":[]}')) as {
    entries: Array<{ id: string; output: string; manifest: string; preview: string; sha256: string }>;
  };
  const entry = index.entries.find((candidate) => candidate.id === id);
  if (entry === undefined) return null;
  const manifest = JSON.parse(await readFile(resolve(project, entry.manifest), "utf8")) as {
    validation: { report: string };
  };
  const report = JSON.parse(
    await readFile(resolve(resolve(project, entry.manifest), "..", manifest.validation.report), "utf8")
  ) as VisualValidationReport | ProductionValidationReport;
  return { entry, report };
}

async function runValidateOrFinalize(
  project: string,
  action: "validate" | "finalize",
  id: string
): Promise<CommandOutcome> {
  const compiled = await readCompiledRecord(project, id);
  if (compiled === null) {
    return {
      diagnostics: [{
        code: "VISUAL_PREVIEW_UNAVAILABLE",
        severity: "error",
        message: `Visual ${id} has no compiled artifact`
      }],
      nextActions: [`Run game visual compile ${id} --project ${project}`]
    };
  }
  const diagnostics = outputDiagnostics(id, compiled.entry.output, compiled.report);
  const job = await readJob(project, id);
  if (job === null) {
    return {
      diagnostics: [{ code: "VISUAL_JOB_NEEDS_REVISION", severity: "error", message: `Visual job not found: ${id}` }],
      nextActions: [`Run game visual compile ${id} to reconstruct the job`]
    };
  }
  if (action === "finalize" && (compiled.report.status !== "passed" || job.state !== "VALIDATING")) {
    diagnostics.push({
      code: "VISUAL_JOB_NEEDS_REVISION",
      severity: "error",
      message: `${id} must pass validation before finalization`
    });
  } else {
    job.state = action === "finalize" ? "APPROVED" : compiled.report.status === "passed" ? "VALIDATING" : "NEEDS_REVISION";
    job.validation = compiled.report.status;
    await writeJob(project, job);
  }
  return {
    diagnostics,
    artifacts: [
      { kind: "visual-validation", path: resolve(resolve(project, compiled.entry.manifest), "..", "validation.json"), sha256: await hashArtifactPath(resolve(resolve(project, compiled.entry.manifest), "..", "validation.json")) },
      { kind: "visual-preview", path: resolve(project, compiled.entry.preview), sha256: await hashArtifactPath(resolve(project, compiled.entry.preview)) }
    ],
    data: {
      project,
      action,
      id,
      state: job.state,
      validation: compiled.report.status,
      metrics: compiled.report.metrics,
      preview: compiled.entry.preview
    },
    nextActions: diagnostics.length > 0
      ? ["Revise the CharacterSpec and compile again"]
      : action === "validate" ? [`Run game visual finalize ${id} --project ${project}`] : ["Reference the approved semantic visual ID from presentation content"]
  };
}

export async function runVisualCommand(
  context: CommandContext,
  arguments_: string[]
): Promise<CommandOutcome> {
  const action = arguments_[1] ?? "compile";
  if (!["plan", "import", "compile", "preview", "validate", "finalize", "inspect"].includes(action)) {
    return {
      diagnostics: [{ code: "VISUAL_ACTION_UNKNOWN", severity: "error", message: `Unknown visual action: ${action}` }],
      nextActions: ["Use game visual plan, import, compile, preview, validate, finalize or inspect"]
    };
  }
  const engineRoot = await findEngineRoot();
  const project = await resolveProjectDirectory(arguments_);
  if (action === "plan") return runPlan(project, engineRoot, arguments_);
  if (action === "import") return runImport(project, arguments_);
  const id = arguments_[2] ?? optionValue(arguments_, "--id");
  if (id === undefined || id.startsWith("--")) {
    return {
      diagnostics: [{ code: "VISUAL_SPEC_INVALID", severity: "error", message: `Visual ${action} requires a visual ID` }],
      nextActions: [`Run game visual ${action} <visual-id> --project ${project}`]
    };
  }
  if (action === "validate" || action === "finalize") {
    return runValidateOrFinalize(project, action, id);
  }
  const result = await ensureProjectVisuals(engineRoot, project, {
    forceCompile: action === "preview",
    onlyId: id
  });
  const diagnostics = [...result.diagnostics];
  if (result.rendered.length === 0 && diagnostics.length === 0) {
    diagnostics.push({ code: "VISUAL_SPEC_INVALID", severity: "error", message: `No CharacterSpec declares ${id}` });
  }
  const artifacts: Artifact[] = [];
  if (action !== "inspect") {
    const runDirectory = resolve(project, "reports/runs", context.runId);
    await mkdir(runDirectory, { recursive: true });
    const reportPath = resolve(runDirectory, "visual-compile.json");
    await writeFile(reportPath, `${JSON.stringify({
      generatorVersion: VISUAL_GENERATOR_VERSION,
      rendered: result.rendered
    }, null, 2)}\n`, "utf8");
    artifacts.push({ kind: "visual-compile", path: reportPath, sha256: await hashArtifactPath(reportPath) });
    for (const record of result.rendered) {
      artifacts.push(
        { kind: "visual-model", path: resolve(project, record.output), sha256: record.sha256 },
        { kind: "visual-manifest", path: resolve(project, record.manifest), sha256: await hashArtifactPath(resolve(project, record.manifest)) },
        { kind: "visual-preview", path: resolve(project, record.preview), sha256: await hashArtifactPath(resolve(project, record.preview)) }
      );
    }
  }
  return {
    diagnostics,
    artifacts,
    data: {
      project,
      action,
      generatorVersion: VISUAL_GENERATOR_VERSION,
      specs: result.specs,
      index: VISUAL_INDEX_FILE,
      rendered: result.rendered.map((record) => ({
        id: record.id,
        recipe: record.recipe,
        output: record.output,
        manifest: record.manifest,
        preview: record.preview,
        reused: record.reused,
        validation: record.report.status,
        triangles: record.report.metrics.triangles,
        vertices: record.report.metrics.vertices,
        bones: record.report.metrics.bones,
        animations: record.animations,
        sha256: record.sha256
      }))
    },
    nextActions: diagnostics.length > 0
      ? ["Revise the CharacterSpec or texture inputs and compile again"]
      : [`Run game visual validate ${id} --project ${project}`]
  };
}
