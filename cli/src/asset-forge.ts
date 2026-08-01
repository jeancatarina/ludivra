import { copyFile, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { parse, type ParseError } from "jsonc-parser";
import { optionValue } from "./arguments.js";
import { hashArtifactPath } from "./artifact-hash.js";
import type { Artifact, Diagnostic } from "./generated/cli-result.js";
import { resolveProjectDirectory, type AssetDeclaration } from "./project.js";
import { findEngineRoot } from "./repository.js";
import type { CommandContext, CommandOutcome } from "./result.js";

export const ASSET_COOKER_VERSION = 2;
export const ASSET_INDEX_FILE = ".ludivra/assets-index.json";

interface GltfDocument {
  asset?: { version?: unknown };
  buffers?: Array<{ uri?: unknown; byteLength?: unknown }>;
  images?: Array<{ uri?: unknown; bufferView?: unknown }>;
  meshes?: Array<{ primitives?: Array<{ indices?: unknown; mode?: unknown }> }>;
  nodes?: unknown[];
  materials?: unknown[];
  textures?: unknown[];
  animations?: unknown[];
  skins?: unknown[];
  accessors?: Array<{ count?: unknown }>;
}

export interface AssetMetrics {
  bytes: number;
  dependencies: number;
  meshes: number;
  primitives: number;
  triangles: number | null;
  nodes: number;
  materials: number;
  textures: number;
  animations: number;
  skins: number;
}

export interface CookedAssetDependency {
  uri: string;
  source: string;
  sha256: string;
  bytes: number;
}

export interface CookedAssetRecord {
  id: string;
  kind: "model";
  format: "gltf" | "glb";
  source: string;
  output: string;
  manifest: string;
  sha256: string;
  cacheKey: string;
  reused: boolean;
  targets: AssetDeclaration["targets"];
  residency: AssetDeclaration["residency"];
  metrics: AssetMetrics;
  dependencies: CookedAssetDependency[];
}

interface CookedAssetManifest extends Omit<CookedAssetRecord, "reused"> {
  schemaVersion: 1;
  cookerVersion: number;
  import: AssetDeclaration["import"];
  origin: string;
  license: string;
  payload: { normalized: false; compression: "none"; reason: string };
}

interface AssetIndex {
  schemaVersion: 1;
  cookerVersion: number;
  entries: Array<Omit<CookedAssetRecord, "reused">>;
}

interface ParsedAsset {
  document: GltfDocument;
  dependencyReferences: string[];
}

function diagnostic(code: string, message: string, file: string): Diagnostic {
  return { code, severity: "error", message, file };
}

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function parseGltfDocument(bytes: Uint8Array, source: string): GltfDocument {
  let document: GltfDocument;
  try {
    document = JSON.parse(new TextDecoder().decode(bytes)) as GltfDocument;
  } catch {
    throw new Error(`ASSET_FORMAT_UNSUPPORTED: ${source} is not valid glTF JSON`);
  }
  if (!document.asset || typeof document.asset.version !== "string" || !document.asset.version.startsWith("2.")) {
    throw new Error(`ASSET_FORMAT_UNSUPPORTED: ${source} does not declare glTF 2.x`);
  }
  return document;
}

function parseGlbDocument(bytes: Uint8Array, source: string): GltfDocument {
  if (bytes.byteLength < 20) throw new Error(`ASSET_FORMAT_UNSUPPORTED: ${source} is too short for GLB`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const declaredLength = view.getUint32(8, true);
  const jsonLength = view.getUint32(12, true);
  const jsonType = view.getUint32(16, true);
  if (magic !== 0x46546c67 || version !== 2 || declaredLength !== bytes.byteLength || jsonType !== 0x4e4f534a) {
    throw new Error(`ASSET_FORMAT_UNSUPPORTED: ${source} has an invalid GLB 2 header`);
  }
  if (20 + jsonLength > bytes.byteLength) throw new Error(`ASSET_FORMAT_UNSUPPORTED: ${source} JSON chunk exceeds GLB length`);
  return parseGltfDocument(bytes.subarray(20, 20 + jsonLength), source);
}

function externalReference(uri: unknown, source: string): string | null {
  if (uri === undefined) return null;
  if (typeof uri !== "string" || uri.length === 0) throw new Error(`ASSET_FORMAT_UNSUPPORTED: ${source} has an invalid resource URI`);
  if (uri.startsWith("data:")) return null;
  if (
    uri.startsWith("/") ||
    uri.startsWith("\\") ||
    uri.includes("\\") ||
    uri.includes("?") ||
    uri.includes("#") ||
    /^[a-z][a-z0-9+.-]*:/i.test(uri)
  ) {
    throw new Error(`ASSET_SOURCE_UNDECLARED: ${source} references a non-project resource URI`);
  }
  return uri;
}

function parseAsset(format: AssetDeclaration["format"], bytes: Uint8Array, source: string): ParsedAsset {
  const document = format === "gltf" ? parseGltfDocument(bytes, source) : parseGlbDocument(bytes, source);
  const references = [
    ...(document.buffers ?? []).map(({ uri }) => externalReference(uri, source)),
    ...(document.images ?? []).map(({ uri, bufferView }) => bufferView === undefined ? externalReference(uri, source) : null)
  ].filter((value): value is string => value !== null);
  return { document, dependencyReferences: Array.from(new Set(references)).sort() };
}

function triangleCount(document: GltfDocument): number | null {
  let total = 0;
  for (const mesh of document.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const mode = primitive.mode === undefined ? 4 : primitive.mode;
      if (typeof mode !== "number" || !Number.isInteger(mode) || ![4, 5, 6].includes(mode)) return null;
      if (typeof primitive.indices !== "number" || !Number.isInteger(primitive.indices)) return null;
      const accessor = document.accessors?.[primitive.indices];
      if (accessor === undefined || typeof accessor.count !== "number" || !Number.isInteger(accessor.count)) return null;
      const count = accessor.count;
      total += mode === 4 ? Math.floor(count / 3) : Math.max(0, count - 2);
    }
  }
  return total;
}

function metrics(document: GltfDocument, sourceBytes: number, dependencies: number): AssetMetrics {
  const primitives = (document.meshes ?? []).reduce((total, mesh) => total + arrayLength(mesh.primitives), 0);
  return {
    bytes: sourceBytes,
    dependencies,
    meshes: arrayLength(document.meshes),
    primitives,
    triangles: triangleCount(document),
    nodes: arrayLength(document.nodes),
    materials: arrayLength(document.materials),
    textures: arrayLength(document.textures),
    animations: arrayLength(document.animations),
    skins: arrayLength(document.skins)
  };
}

async function containedFile(project: string, candidate: string, source: string): Promise<string> {
  const resolved = resolve(candidate);
  const lexicalRelation = relative(project, resolved);
  if (lexicalRelation.startsWith("..") || isAbsolute(lexicalRelation)) {
    throw new Error(`ASSET_SOURCE_UNDECLARED: ${source} escapes the game project`);
  }
  const [actualProject, actualFile] = await Promise.all([realpath(project), realpath(resolved)]);
  const actualRelation = relative(actualProject, actualFile);
  if (actualRelation.startsWith("..") || isAbsolute(actualRelation)) {
    throw new Error(`ASSET_SOURCE_UNDECLARED: ${source} symlink escapes the game project`);
  }
  return actualFile;
}

async function copyIntoCookCache(project: string, cacheRoot: string, source: string): Promise<string> {
  const destination = resolve(cacheRoot, relative(project, source));
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  return destination;
}

function cacheKey(declaration: AssetDeclaration, files: Array<{ source: string; sha256: string }>): string {
  return hash(new TextEncoder().encode(JSON.stringify({ version: ASSET_COOKER_VERSION, declaration, files })));
}

async function cookAsset(project: string, declaration: AssetDeclaration, force: boolean): Promise<CookedAssetRecord> {
  const source = await containedFile(project, resolve(project, declaration.source), declaration.source);
  const declaredExtension = extname(declaration.source).slice(1).toLowerCase();
  if (declaredExtension !== declaration.format) {
    throw new Error(`ASSET_FORMAT_UNSUPPORTED: ${declaration.id} declares ${declaration.format} but source extension is .${declaredExtension || "none"}`);
  }
  const sourceBytes = await readFile(source);
  const parsed = parseAsset(declaration.format, sourceBytes, declaration.source);
  const dependencies = await Promise.all(parsed.dependencyReferences.map(async (reference) => {
    const path = await containedFile(project, resolve(dirname(source), reference), `${declaration.source}:${reference}`);
    const bytes = await readFile(path);
    return { uri: reference, path, source: relative(project, path), sha256: hash(bytes), bytes: bytes.byteLength };
  }));
  const inputs = [{ source: relative(project, source), sha256: hash(sourceBytes) }, ...dependencies.map(({ source: path, sha256 }) => ({ source: path, sha256 }))]
    .sort((left, right) => left.source.localeCompare(right.source));
  const key = cacheKey(declaration, inputs);
  const cacheRoot = resolve(project, ".ludivra/cache/assets", key, "source");
  const manifestPath = resolve(project, ".ludivra/cache/assets", key, "asset-manifest.json");
  const cached = JSON.parse(await readFile(manifestPath, "utf8").catch(() => "null")) as CookedAssetManifest | null;
  const cachedOutputExists = cached === null
    ? false
    : await readFile(resolve(project, cached.output)).then(() => true).catch(() => false);
  if (!force && cached?.cacheKey === key && cachedOutputExists) {
    return { ...cached, reused: true };
  }
  const output = relative(project, await copyIntoCookCache(project, cacheRoot, source));
  await Promise.all(dependencies.map(({ path }) => copyIntoCookCache(project, cacheRoot, path)));
  const cooked: CookedAssetManifest = {
    schemaVersion: 1,
    cookerVersion: ASSET_COOKER_VERSION,
    id: declaration.id,
    kind: declaration.kind,
    format: declaration.format,
    source: relative(project, source),
    output,
    manifest: relative(project, manifestPath),
    sha256: hash(sourceBytes),
    cacheKey: key,
    targets: declaration.targets,
    residency: declaration.residency,
    import: declaration.import,
    origin: declaration.origin,
    license: declaration.license,
    metrics: metrics(parsed.document, sourceBytes.byteLength, dependencies.length),
    dependencies: dependencies.map(({ uri, source: dependencySource, sha256, bytes }) => ({ uri, source: dependencySource, sha256, bytes })),
    payload: {
      normalized: false,
      compression: "none",
      reason: "The v2 cooker validates provenance, glTF/GLB structure and dependent resources, then preserves source payloads until a licensed optimizer is adopted."
    }
  };
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(cooked, null, 2)}\n`, "utf8");
  return { ...cooked, reused: false };
}

export async function ensureProjectAssets(
  project: string,
  options: { force?: boolean; onlyId?: string } = {}
): Promise<{ rendered: CookedAssetRecord[]; diagnostics: Diagnostic[] }> {
  const projectRoot = await realpath(project);
  const parseErrors: ParseError[] = [];
  const manifest = parse(await readFile(resolve(projectRoot, "game.jsonc"), "utf8"), parseErrors) as { assets?: AssetDeclaration[] };
  if (parseErrors.length > 0) throw new Error("GAME_MANIFEST_INVALID_JSONC");
  const allRendered: CookedAssetRecord[] = [];
  const diagnostics: Diagnostic[] = [];
  const ids = new Set<string>();
  for (const declaration of manifest.assets ?? []) {
    if (ids.has(declaration.id)) {
      diagnostics.push(diagnostic("ASSET_ID_DUPLICATE", `Asset ID is duplicated: ${declaration.id}`, declaration.source));
      continue;
    }
    ids.add(declaration.id);
    try {
      allRendered.push(await cookAsset(projectRoot, declaration, options.force === true));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Asset cook failed";
      const code = message.match(/^[A-Z][A-Z0-9_]+/)?.[0] ?? "ASSET_IMPORT_NORMALIZATION_FAILED";
      diagnostics.push(diagnostic(code, message, declaration.source));
    }
  }
  const index: AssetIndex = {
    schemaVersion: 1,
    cookerVersion: ASSET_COOKER_VERSION,
    entries: allRendered.map(({ reused: _reused, ...entry }) => entry)
  };
  await mkdir(resolve(projectRoot, ".ludivra"), { recursive: true });
  await writeFile(resolve(projectRoot, ASSET_INDEX_FILE), `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return {
    rendered: options.onlyId === undefined ? allRendered : allRendered.filter(({ id }) => id === options.onlyId),
    diagnostics
  };
}

export async function runAssetCommand(context: CommandContext, arguments_: string[]): Promise<CommandOutcome> {
  const action = arguments_[1] ?? "cook";
  if (!new Set(["cook", "inspect"]).has(action)) {
    return {
      diagnostics: [{ code: "ASSET_ACTION_UNKNOWN", severity: "error", message: `Unknown asset action: ${action}` }],
      nextActions: ["Use game asset cook or inspect"]
    };
  }
  await findEngineRoot();
  const project = await resolveProjectDirectory(arguments_);
  const onlyId = optionValue(arguments_, "--id");
  const result = await ensureProjectAssets(project, { force: arguments_.includes("--force"), ...(onlyId === undefined ? {} : { onlyId }) });
  if (onlyId !== undefined && result.rendered.length === 0 && result.diagnostics.length === 0) {
    result.diagnostics.push({ code: "ASSET_ID_UNKNOWN", severity: "error", message: `No asset declares id ${onlyId}` });
  }
  const artifacts: Artifact[] = [];
  if (action === "cook" && !result.diagnostics.some(({ severity }) => severity === "error")) {
    const reportPath = resolve(project, "reports/runs", context.runId, "asset-cook.json");
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify({ cookerVersion: ASSET_COOKER_VERSION, assets: result.rendered }, null, 2)}\n`, "utf8");
    artifacts.push({ kind: "asset-cook", path: reportPath, sha256: await hashArtifactPath(reportPath) });
  }
  return {
    diagnostics: result.diagnostics,
    artifacts,
    data: {
      project,
      action,
      cookerVersion: ASSET_COOKER_VERSION,
      index: ASSET_INDEX_FILE,
      rendered: result.rendered
    },
    nextActions: result.diagnostics.some(({ severity }) => severity === "error")
      ? ["Correct the asset declaration or source and run game asset cook again"]
      : ["Reference cooked assets through the target asset index"]
  };
}
