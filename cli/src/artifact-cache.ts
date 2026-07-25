import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { hashArtifactPath, sha256 } from "./artifact-hash.js";
import { runProcess } from "./process-runner.js";

/**
 * Incremental build cache keyed by artifact family. The unit is deliberately the
 * family, not the file or the command: a family declares its inputs, outputs and
 * dependencies, which is what makes an invalidation explainable.
 *
 * Timestamps are never an invalidation signal. `mtime` changes on checkout and copy
 * without the content changing, and stays put on edits that preserve it.
 */
export const CACHE_FORMAT_VERSION = 1;

export type CacheFamilyId = "contracts" | "packages" | "wasm" | "native" | "web-bundle";

export type CacheMissReason =
  | "NO_ENTRY"
  | "INPUT_CHANGED"
  | "TOOLCHAIN_CHANGED"
  | "CONTRACT_CHANGED"
  | "CACHE_FORMAT_CHANGED"
  | "OUTPUT_MISSING"
  | "FORCED";

export interface CacheDecision {
  family: CacheFamilyId;
  status: "hit" | "miss";
  reason?: CacheMissReason;
  changed?: string[];
  changedTotal?: number;
  key: string;
  durationMs: number;
}

interface FamilyDefinition {
  id: CacheFamilyId;
  /** Repo-relative paths whose content enters the key. */
  inputs: string[];
  /** Repo-relative paths that must exist and match after a build. */
  outputs: string[];
  dependsOn: CacheFamilyId[];
  /** Environment variables that enter the key, by name. */
  environment: string[];
  /** Whether the game project content participates in the key. */
  usesProject?: boolean;
  command: readonly [string, ...string[]];
}

const families: FamilyDefinition[] = [
  {
    id: "contracts",
    inputs: [
      "contracts",
      "tools/contracts",
      "tools/program-status",
      "capabilities",
      "docs/adr",
      "docs/program-status.json",
      "contracts/capability-catalog.source.json"
    ],
    outputs: [
      "cli/src/generated",
      "runtime-web/src/generated",
      "presentation-protocol/src/generated",
      "hosts/electron/src/generated",
      "CAPABILITIES.json",
      "BACKLOG.md",
      "DECISIONS.md",
      "ROADMAP.md"
    ],
    dependsOn: [],
    environment: [],
    command: ["pnpm", "contracts"]
  },
  {
    id: "packages",
    inputs: [
      "presentation-protocol/src",
      "platform-contracts/src",
      "audio-authoring/src",
      "runtime-web/src",
      "renderer-three/src",
      "pnpm-lock.yaml"
    ],
    outputs: [
      "presentation-protocol/dist",
      "platform-contracts/dist",
      "audio-authoring/dist",
      "runtime-web/dist",
      "renderer-three/dist"
    ],
    dependsOn: ["contracts"],
    environment: [],
    command: ["pnpm", "build:packages"]
  },
  {
    id: "wasm",
    inputs: ["kernel", "runtime-c-api", "runtime-wasm", "cmake", "CMakeLists.txt", "tools/build/build-wasm.sh", "toolchain.lock"],
    outputs: ["runtime-wasm/generated"],
    dependsOn: ["contracts"],
    environment: [],
    command: ["pnpm", "build:wasm"]
  },
  {
    id: "native",
    inputs: ["kernel", "runtime-c-api", "cmake", "CMakeLists.txt", "CMakePresets.json", "tests/runtime", "toolchain.lock"],
    outputs: ["build"],
    dependsOn: ["contracts"],
    environment: [],
    command: ["pnpm", "build:native"]
  },
  {
    id: "web-bundle",
    inputs: ["hosts/browser/src", "hosts/browser/index.html", "hosts/browser/vite.config.ts", "hosts/browser/package.json"],
    outputs: ["hosts/browser/dist"],
    dependsOn: ["packages", "wasm"],
    environment: ["LUDIVRA_GAME_DIR", "LUDIVRA_BASE"],
    usesProject: true,
    command: ["pnpm", "--filter", "@ludivra/browser-host", "build"]
  }
];

const familyById = new Map(families.map((family) => [family.id, family]));
const buildTimeoutMs = 900_000;

export function cacheFamilyIds(): CacheFamilyId[] {
  return families.map(({ id }) => id);
}

export function familyDefinition(id: CacheFamilyId): FamilyDefinition {
  const family = familyById.get(id);
  if (family === undefined) throw new Error(`CACHE_FAMILY_UNKNOWN: ${id}`);
  return family;
}

/** Families that must rebuild when `changed` was rebuilt, in dependency order. */
export function dependentFamilies(changed: CacheFamilyId): CacheFamilyId[] {
  const ordered: CacheFamilyId[] = [];
  for (const family of families) {
    if (family.id === changed || family.dependsOn.some((id) => ordered.includes(id) || id === changed)) {
      ordered.push(family.id);
    }
  }
  return ordered;
}

/** Family that owns a repository path, or null when no family declares it. */
export function owningFamily(repositoryRelativePath: string): CacheFamilyId | null {
  const normalized = repositoryRelativePath.replaceAll("\\", "/");
  for (const family of families) {
    for (const input of family.inputs) {
      if (normalized === input || normalized.startsWith(`${input}/`)) return family.id;
    }
  }
  return null;
}

async function hashPaths(root: string, paths: string[]): Promise<Record<string, string>> {
  const entries: Record<string, string> = {};
  for (const path of [...paths].sort()) {
    entries[path] = await hashArtifactPath(resolve(root, path)).catch(() => "absent");
  }
  return entries;
}

interface CacheEntry {
  cacheFormatVersion: number;
  family: CacheFamilyId;
  key: string;
  inputs: Record<string, string>;
  outputs: Record<string, string>;
  environment: Record<string, string>;
  projectInputs: Record<string, string>;
  dependencies: Record<string, string>;
  toolchain: string;
}

function entryDirectory(root: string, family: CacheFamilyId, key: string): string {
  return resolve(root, ".ludivra/cache", family, key);
}

function latestPath(root: string, family: CacheFamilyId): string {
  return resolve(root, ".ludivra/cache", family, "latest.json");
}

async function readJson<T>(path: string): Promise<T | null> {
  const source = await readFile(path, "utf8").catch(() => null);
  return source === null ? null : (JSON.parse(source) as T);
}

function changedKeys(before: Record<string, string>, after: Record<string, string>): string[] {
  const changed: string[] = [];
  for (const [key, value] of Object.entries(after)) {
    if (before[key] !== value) changed.push(key);
  }
  for (const key of Object.keys(before)) {
    if (!(key in after)) changed.push(key);
  }
  return changed.sort();
}

export interface CacheRunOptions {
  root: string;
  environment: NodeJS.ProcessEnv;
  /**
   * Absolute path of the game project. Families that bundle project content declare
   * `usesProject`, and without this the bundle would keep a stale hit after the game
   * changed.
   */
  project?: string;
  /** Skip every entry and rebuild, recorded as reason FORCED. */
  force?: boolean;
  maxChangedReported?: number;
}

export interface FamilyBuildResult {
  decision: CacheDecision;
  failure: string | null;
}

/**
 * Ensures a family is built, reusing its cache entry when the key matches. Every
 * reuse and every rebuild carries a reason; a hit without a recorded cause is not
 * allowed, because the operability gate is about explaining invalidation.
 */
export async function ensureFamily(
  id: CacheFamilyId,
  options: CacheRunOptions,
  resolvedKeys: Map<CacheFamilyId, string>
): Promise<FamilyBuildResult> {
  const family = familyDefinition(id);
  const startedAt = performance.now();
  const [inputs, outputs] = await Promise.all([
    hashPaths(options.root, family.inputs),
    hashPaths(options.root, family.outputs)
  ]);
  const environment: Record<string, string> = {};
  for (const name of family.environment) environment[name] = options.environment[name] ?? "";
  const projectInputs: Record<string, string> = {};
  if (family.usesProject === true && options.project !== undefined) {
    for (const entry of ["game.jsonc", "scripts", "presentation", "content", "audio", ".ludivra/audio-index.json"]) {
      projectInputs[entry] = await hashArtifactPath(resolve(options.project, entry)).catch(() => "absent");
    }
  }
  const dependencies: Record<string, string> = {};
  for (const dependency of family.dependsOn) dependencies[dependency] = resolvedKeys.get(dependency) ?? "unresolved";
  const toolchain = await hashArtifactPath(resolve(options.root, "toolchain.lock")).catch(() => "absent");

  const key = sha256(JSON.stringify({
    cacheFormatVersion: CACHE_FORMAT_VERSION,
    family: family.id,
    inputs,
    projectInputs,
    environment,
    dependencies,
    toolchain
  }));
  resolvedKeys.set(family.id, key);

  const directory = entryDirectory(options.root, family.id, key);
  const entry = options.force === true ? null : await readJson<CacheEntry>(resolve(directory, "entry.json"));
  const previous = await readJson<CacheEntry>(latestPath(options.root, family.id));

  let reason: CacheMissReason | null = null;
  let changed: string[] = [];
  if (options.force === true) {
    reason = "FORCED";
  } else if (entry === null) {
    if (previous === null) reason = "NO_ENTRY";
    else if (previous.cacheFormatVersion !== CACHE_FORMAT_VERSION) reason = "CACHE_FORMAT_CHANGED";
    else if (previous.toolchain !== toolchain) reason = "TOOLCHAIN_CHANGED";
    else {
      const dependencyChanges = changedKeys(previous.dependencies, dependencies);
      const inputChanges = [
        ...changedKeys(previous.inputs, inputs),
        ...changedKeys(previous.projectInputs ?? {}, projectInputs).map((entry) => `project:${entry}`)
      ];
      const environmentChanges = changedKeys(previous.environment, environment);
      if (dependencyChanges.includes("contracts")) {
        reason = "CONTRACT_CHANGED";
        changed = dependencyChanges;
      } else if (inputChanges.length > 0 || environmentChanges.length > 0 || dependencyChanges.length > 0) {
        reason = "INPUT_CHANGED";
        changed = [...inputChanges, ...environmentChanges, ...dependencyChanges];
      } else {
        reason = "NO_ENTRY";
      }
    }
  } else if (changedKeys(entry.outputs, outputs).length > 0) {
    reason = "OUTPUT_MISSING";
    changed = changedKeys(entry.outputs, outputs);
  }

  if (reason === null) {
    return {
      decision: { family: family.id, status: "hit", key, durationMs: Math.round(performance.now() - startedAt) },
      failure: null
    };
  }

  const [command, ...arguments_] = family.command;
  const execution = await runProcess(command, arguments_, {
    id: `build:${family.id}`,
    cwd: options.root,
    timeoutMs: buildTimeoutMs,
    env: { ...options.environment }
  });
  const limit = options.maxChangedReported ?? 10;
  const decision: CacheDecision = {
    family: family.id,
    status: "miss",
    reason,
    ...(changed.length === 0 ? {} : { changed: changed.slice(0, limit), changedTotal: changed.length }),
    key,
    durationMs: Math.round(performance.now() - startedAt)
  };
  if (execution.exitCode !== 0) {
    return { decision, failure: execution.output.trim() || `build:${family.id} failed` };
  }

  const producedOutputs = await hashPaths(options.root, family.outputs);
  const missing = Object.entries(producedOutputs).filter(([, hash]) => hash === "absent").map(([path]) => path);
  if (missing.length > 0) {
    return { decision, failure: `${family.id} did not produce ${missing.join(", ")}` };
  }
  const record: CacheEntry = {
    cacheFormatVersion: CACHE_FORMAT_VERSION,
    family: family.id,
    key,
    inputs,
    outputs: producedOutputs,
    environment,
    projectInputs,
    dependencies,
    toolchain
  };
  await mkdir(directory, { recursive: true });
  const serialized = `${JSON.stringify(record, null, 2)}\n`;
  await Promise.all([
    writeFile(resolve(directory, "entry.json"), serialized, "utf8"),
    writeFile(latestPath(options.root, family.id), serialized, "utf8")
  ]);
  return { decision, failure: null };
}

export interface FamiliesResult {
  decisions: CacheDecision[];
  failure: { family: CacheFamilyId; message: string } | null;
}

/** Builds the requested families in declaration order, stopping at the first failure. */
export async function ensureFamilies(
  requested: CacheFamilyId[],
  options: CacheRunOptions
): Promise<FamiliesResult> {
  const ordered = families.map(({ id }) => id).filter((id) => requested.includes(id));
  const resolvedKeys = new Map<CacheFamilyId, string>();
  const decisions: CacheDecision[] = [];
  for (const id of ordered) {
    // Dependency keys must be resolved even when the dependency was not requested,
    // otherwise a dependent family would key against "unresolved" and never hit.
    for (const dependency of familyDefinition(id).dependsOn) {
      if (!resolvedKeys.has(dependency) && !ordered.includes(dependency)) {
        const latest = await readJson<CacheEntry>(latestPath(options.root, dependency));
        resolvedKeys.set(dependency, latest?.key ?? "unresolved");
      }
    }
    const result = await ensureFamily(id, options, resolvedKeys);
    decisions.push(result.decision);
    if (result.failure !== null) {
      return { decisions, failure: { family: id, message: result.failure } };
    }
  }
  return { decisions, failure: null };
}

export function describeDecisions(root: string, decisions: CacheDecision[]): Record<string, unknown> {
  return {
    cacheFormatVersion: CACHE_FORMAT_VERSION,
    cacheDirectory: relative(root, resolve(root, ".ludivra/cache")),
    families: decisions
  };
}
