import { appendFile, mkdir, watch, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { hashArtifactPath } from "./artifact-hash.js";
import {
  cacheFamilyIds,
  dependentFamilies,
  describeDecisions,
  ensureFamilies,
  familyDefinition,
  owningFamily,
  type CacheDecision,
  type CacheFamilyId
} from "./artifact-cache.js";
import { optionValue } from "./arguments.js";
import type { Artifact, Diagnostic } from "./generated/cli-result.js";
import { setInterruptHandler } from "./process-runner.js";

export interface BuildRunRequest {
  runId: string;
  root: string;
  /** Evidence root: the project when there is one, otherwise the engine. */
  evidenceRoot: string;
  /** Game project whose content participates in the bundle key. */
  project?: string;
  families: CacheFamilyId[];
  environment: NodeJS.ProcessEnv;
  watch: boolean;
  force: boolean;
  debounceMs: number;
}

export interface BuildRunResult {
  decisions: CacheDecision[];
  rebuilds: number;
  diagnostics: Diagnostic[];
  artifacts: Artifact[];
}

export function parseBuildOptions(arguments_: string[]): { watch: boolean; force: boolean; debounceMs: number } {
  const debounce = Number(optionValue(arguments_, "--debounce") ?? "150");
  if (!Number.isInteger(debounce) || debounce < 0) {
    throw new Error("RUNNER_DEBOUNCE_INVALID");
  }
  return {
    watch: arguments_.includes("--watch"),
    force: arguments_.includes("--no-cache"),
    debounceMs: debounce
  };
}

async function artifact(kind: string, path: string): Promise<Artifact> {
  return { kind, path, sha256: await hashArtifactPath(path) };
}

/**
 * Writes the cache decisions of one execution into its run bundle. Every operation
 * that reuses artifacts records why, which is what the operability gate demands.
 */
export async function writeCacheDecisions(
  root: string,
  evidenceRoot: string,
  runId: string,
  decisions: CacheDecision[],
  rebuilds = 0
): Promise<Artifact> {
  const runDirectory = resolve(evidenceRoot, "reports/runs", runId);
  await mkdir(runDirectory, { recursive: true });
  const path = resolve(runDirectory, "cache-decisions.json");
  await writeFile(path, `${JSON.stringify({ ...describeDecisions(root, decisions), rebuilds }, null, 2)}\n`, "utf8");
  return artifact("cache-decisions", path);
}

function watchRoots(families: CacheFamilyId[]): string[] {
  const roots = new Set<string>();
  for (const id of families) {
    for (const input of familyDefinition(id).inputs) roots.add(input);
  }
  return [...roots];
}

/**
 * Runs the requested families through the cache and, in watch mode, keeps
 * rebuilding only the family that owns a changed file plus its declared
 * dependents. The whole session is one invocation and therefore one run manifest;
 * each rebuild appends a line to `rebuilds.jsonl` inside the run bundle.
 */
export async function runFamilies(request: BuildRunRequest): Promise<BuildRunResult> {
  const runDirectory = resolve(request.evidenceRoot, "reports/runs", request.runId);
  await mkdir(runDirectory, { recursive: true });
  const rebuildsPath = resolve(runDirectory, "rebuilds.jsonl");
  const diagnostics: Diagnostic[] = [];

  const cacheOptions = {
    root: request.root,
    environment: request.environment,
    ...(request.project === undefined ? {} : { project: request.project })
  };
  const initial = await ensureFamilies(request.families, { ...cacheOptions, force: request.force });
  const decisions = [...initial.decisions];
  if (initial.failure !== null) {
    diagnostics.push({
      code: "BUILD_TOOL_FAILED",
      severity: "error",
      message: `${initial.failure.family}: ${initial.failure.message}`
    });
  }

  let rebuilds = 0;
  if (request.watch && initial.failure === null) {
    const controller = new AbortController();
    let sequence = 0;
    let pending = new Set<string>();
    let timer: NodeJS.Timeout | undefined;
    let stopped = false;
    const stop = (): void => {
      if (stopped) return;
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      controller.abort();
    };
    setInterruptHandler(stop);

    const flush = async (): Promise<void> => {
      const triggers = [...pending];
      pending = new Set();
      if (triggers.length === 0) return;
      const owners = new Set<CacheFamilyId>();
      for (const trigger of triggers) {
        const owner = owningFamily(trigger);
        if (owner !== null) owners.add(owner);
      }
      if (owners.size === 0) return;
      const affected = new Set<CacheFamilyId>();
      for (const owner of owners) {
        for (const family of dependentFamilies(owner)) {
          if (request.families.includes(family)) affected.add(family);
        }
      }
      sequence += 1;
      const started = performance.now();
      const result = await ensureFamilies([...affected], cacheOptions);
      decisions.push(...result.decisions);
      rebuilds += 1;
      await appendFile(rebuildsPath, `${JSON.stringify({
        sequence,
        triggers: triggers.slice(0, 10),
        triggerTotal: triggers.length,
        families: result.decisions.map(({ family, status, reason }) => ({ family, status, ...(reason === undefined ? {} : { reason }) })),
        durationMs: Math.round(performance.now() - started),
        status: result.failure === null ? "passed" : "failed"
      })}\n`, "utf8");
      if (result.failure !== null) {
        diagnostics.push({
          code: "BUILD_TOOL_FAILED",
          severity: "warning",
          message: `${result.failure.family}: ${result.failure.message}`
        });
      }
    };

    const watchers = watchRoots(request.families).map(async (root) => {
      try {
        for await (const event of watch(resolve(request.root, root), {
          recursive: true,
          signal: controller.signal
        })) {
          const changed = event.filename === null ? root : `${root}/${event.filename}`;
          pending.add(changed.replaceAll("\\", "/"));
          if (timer !== undefined) clearTimeout(timer);
          timer = setTimeout(() => void flush(), request.debounceMs);
        }
      } catch (error) {
        const aborted = error instanceof Error && error.name === "AbortError";
        if (!aborted && !stopped) {
          diagnostics.push({
            code: "RUNNER_WATCH_UNAVAILABLE",
            severity: "warning",
            message: `Watch stopped for ${root}: ${error instanceof Error ? error.message : "unknown failure"}`
          });
        }
      }
    });
    await Promise.all(watchers);
    setInterruptHandler(null);
  }

  const artifacts = [
    await writeCacheDecisions(request.root, request.evidenceRoot, request.runId, decisions, rebuilds)
  ];
  if (rebuilds > 0) artifacts.push(await artifact("watch-rebuilds", rebuildsPath));
  return { decisions, rebuilds, diagnostics, artifacts };
}

export function summarizeDecisions(decisions: CacheDecision[]): Record<string, unknown> {
  const hits = decisions.filter(({ status }) => status === "hit");
  return {
    families: cacheFamilyIds().length,
    evaluated: decisions.length,
    hits: hits.length,
    misses: decisions.length - hits.length,
    decisions: decisions.map(({ family, status, reason, changed, changedTotal, durationMs }) => ({
      family,
      status,
      ...(reason === undefined ? {} : { reason }),
      ...(changed === undefined ? {} : { changed, changedTotal }),
      durationMs
    }))
  };
}
