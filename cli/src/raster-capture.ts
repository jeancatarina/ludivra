import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { optionValue } from "./arguments.js";
import { ensureFamilies, type CacheDecision } from "./artifact-cache.js";
import { ensureProjectAudio } from "./audio-forge.js";
import { writeCacheDecisions } from "./build-runner.js";
import { hashArtifactPath } from "./artifact-hash.js";
import { createContractValidator } from "./contract-validator.js";
import type { Artifact, Diagnostic } from "./generated/cli-result.js";
import { runProcess } from "./process-runner.js";
import { resolveProjectDirectory } from "./project.js";
import {
  compareRasterImages,
  decodePng,
  type RasterComparison,
  type RasterTolerance
} from "./raster-image.js";
import { findEngineRoot } from "./repository.js";
import type { CommandContext, CommandOutcome } from "./result.js";

const CAPTURE_BACKEND = "electron-offscreen";

/**
 * Declared default tolerance. GPU driver, font rasterization and antialiasing move
 * pixels without any defect in the game, so equality is not the criterion. A
 * profile may override it with `tolerance.json` next to its baseline.
 */
const DEFAULT_TOLERANCE: RasterTolerance = { maxChangedFraction: 0.002, maxChannelDelta: 24 };

interface CaptureRequest {
  name: string;
  profile: string;
  width: number;
  height: number;
  ticks: number;
  updateBaseline: boolean;
}

function parseRequest(arguments_: string[]): CaptureRequest {
  const viewport = optionValue(arguments_, "--viewport") ?? "1280x800";
  const match = /^(\d+)x(\d+)$/.exec(viewport);
  if (match === null) throw new Error("CAPTURE_PROFILE_UNDECLARED: --viewport expects <width>x<height>");
  const ticks = Number(optionValue(arguments_, "--ticks") ?? "0");
  if (!Number.isInteger(ticks) || ticks < 0) throw new Error("CAPTURE_PROFILE_UNDECLARED: --ticks expects an integer");
  return {
    name: optionValue(arguments_, "--name") ?? "default",
    profile: optionValue(arguments_, "--profile") ?? "desktop",
    width: Number(match[1]),
    height: Number(match[2]),
    ticks,
    updateBaseline: arguments_.includes("--update-baseline")
  };
}

function baselineDirectory(project: string, request: CaptureRequest): string {
  return resolve(project, "tests/baselines", request.name, CAPTURE_BACKEND, request.profile);
}

async function readTolerance(directory: string): Promise<RasterTolerance> {
  const path = resolve(directory, "tolerance.json");
  const source = await readFile(path, "utf8").catch(() => null);
  if (source === null) return DEFAULT_TOLERANCE;
  const declared = JSON.parse(source) as Partial<RasterTolerance>;
  const fraction = declared.maxChangedFraction;
  const delta = declared.maxChannelDelta;
  if (typeof fraction !== "number" || typeof delta !== "number" || fraction < 0 || delta < 0) {
    throw new Error("CAPTURE_PROFILE_UNDECLARED: tolerance.json must declare maxChangedFraction and maxChannelDelta");
  }
  return { maxChangedFraction: fraction, maxChannelDelta: delta };
}

function resolveElectronBinary(engineRoot: string): string | null {
  try {
    const requireFrom = createRequire(pathToFileURL(resolve(engineRoot, "hosts/electron/package.json")));
    const binary = requireFrom("electron") as unknown;
    return typeof binary === "string" && binary.length > 0 ? binary : null;
  } catch {
    return null;
  }
}

/**
 * Builds through the artifact cache. `LUDIVRA_BASE=./` is required because the
 * capture loads the bundle over file://, the same rule the desktop package enforces.
 */
async function buildBundle(engineRoot: string, project: string): Promise<{
  failure: string | null;
  decisions: CacheDecision[];
}> {
  const audio = await ensureProjectAudio(engineRoot, project);
  const prepared = await ensureFamilies(["contracts", "packages", "wasm", "web-bundle"], {
    root: engineRoot,
    project,
    environment: { ...process.env, LUDIVRA_GAME_DIR: project, LUDIVRA_BASE: "./" }
  });
  if (audio.diagnostics.some(({ severity }) => severity === "error")) {
    return { failure: audio.diagnostics.map(({ message }) => message).join("; "), decisions: prepared.decisions };
  }
  return {
    failure: prepared.failure === null ? null : `${prepared.failure.family}: ${prepared.failure.message}`,
    decisions: prepared.decisions
  };
}

async function artifact(kind: string, path: string): Promise<Artifact> {
  return { kind, path, sha256: await hashArtifactPath(path) };
}

/**
 * Captures a raster frame of the real web bundle through the ElectronHost adapter
 * and compares it with the approved baseline for the declared profile.
 */
export async function runRasterCapture(
  context: CommandContext,
  arguments_: string[]
): Promise<CommandOutcome> {
  const request = parseRequest(arguments_);
  const engineRoot = await findEngineRoot();
  const project = await resolveProjectDirectory(arguments_);
  const binary = resolveElectronBinary(engineRoot);
  if (binary === null) {
    return {
      diagnostics: [{
        code: "CAPTURE_RASTER_UNAVAILABLE",
        severity: "error",
        message: "Electron is not installed, so no raster backend exists in this environment"
      }],
      data: { classification: "NOT_AVAILABLE", backend: CAPTURE_BACKEND },
      nextActions: ["Install workspace dependencies and retry game capture --raster"]
    };
  }

  const build = await buildBundle(engineRoot, project);
  if (build.failure !== null) {
    return {
      diagnostics: [{ code: "WEB_BUILD_FAILED", severity: "error", message: build.failure }],
      data: { cache: build.decisions },
      nextActions: ["Run game doctor and inspect the failed build tool"]
    };
  }

  const runDirectory = resolve(project, "reports/runs", context.runId);
  const output = resolve(runDirectory, "captures", request.name);
  await mkdir(output, { recursive: true });
  const execution = await runProcess(binary, [resolve(engineRoot, "hosts/electron/src/main.cjs")], {
    cwd: engineRoot,
    id: "capture-electron",
    timeoutMs: 120_000,
    env: {
      ...process.env,
      LUDIVRA_CAPTURE: "1",
      LUDIVRA_CAPTURE_BUNDLE: resolve(engineRoot, "hosts/browser/dist/index.html"),
      LUDIVRA_CAPTURE_OUTPUT: output,
      LUDIVRA_CAPTURE_TICKS: String(request.ticks),
      LUDIVRA_CAPTURE_WIDTH: String(request.width),
      LUDIVRA_CAPTURE_HEIGHT: String(request.height),
      // Keep host state inside the run bundle: a capture must not touch the
      // developer's real save directory.
      LUDIVRA_USER_DATA: resolve(runDirectory, "host-user-data")
    }
  });
  if (execution.exitCode !== 0 || !execution.output.includes("ludivra_capture=ok")) {
    const reported = /CAPTURE_[A-Z_]+/.exec(execution.output)?.[0];
    return {
      diagnostics: [{
        code: reported ?? "CAPTURE_RASTER_UNAVAILABLE",
        severity: "error",
        message: execution.output.trim() || "Capture adapter exited without producing a frame"
      }],
      data: { backend: CAPTURE_BACKEND, viewport: { width: request.width, height: request.height } },
      nextActions: ["Inspect the capture adapter output and retry"]
    };
  }

  const diagnostics: Diagnostic[] = [];
  const capturePath = resolve(output, "capture.png");
  const snapshotPath = resolve(output, "rendered-ui-snapshot.json");
  const viewModelPath = resolve(output, "ui-view-model.json");
  const metadataPath = resolve(output, "capture.json");
  const projectionPath = resolve(output, "projection-trace.json");
  const hostDiagnosticsPath = resolve(output, "host-diagnostics.json");
  const [snapshot, viewModel, projection, hostDiagnostics] = await Promise.all([
    readFile(snapshotPath, "utf8").then((source) => JSON.parse(source) as Record<string, unknown>),
    readFile(viewModelPath, "utf8").then((source) => JSON.parse(source) as Record<string, unknown>),
    readFile(projectionPath, "utf8").then((source) => JSON.parse(source) as {
      visuals: unknown[];
      operations: Record<string, number>;
    }),
    readFile(hostDiagnosticsPath, "utf8").then((source) => JSON.parse(source) as Array<{
      code: string;
      message: string;
      tick: string | null;
      source: string;
    }>)
  ]);

  const ajv = createContractValidator();
  for (const [file, payload, kind] of [
    ["contracts/rendered-ui-snapshot.schema.json", snapshot, "renderedUiSnapshot"],
    ["contracts/ui-view-model.schema.json", viewModel, "uiViewModel"]
  ] as const) {
    const schema = JSON.parse(await readFile(resolve(engineRoot, file), "utf8"));
    const validate = ajv.compile(schema);
    if (!validate(payload)) {
      diagnostics.push({
        code: "UI_CONTRACT_INVALID",
        severity: "error",
        message: `${kind} produced by the capture violates ${file}`,
        details: { errors: (validate.errors ?? []).map((error) => `${error.instancePath} ${error.message ?? ""}`.trim()) }
      });
    }
  }
  // A frame that looks right while the host logged a failure is not evidence of a
  // working game; the recorded cause travels with the run.
  for (const entry of hostDiagnostics.slice(0, 10)) {
    diagnostics.push({
      code: entry.code,
      severity: "error",
      message: `${entry.message} (${entry.source}${entry.tick === null ? "" : `, tick ${entry.tick}`})`
    });
  }
  // Pixels with no projector work behind them mean the projector never ran.
  if (projection.operations.render === 0 || projection.visuals.length === 0) {
    diagnostics.push({
      code: "CAPTURE_PROJECTION_EMPTY",
      severity: "error",
      message: `The projector produced ${projection.visuals.length} visuals and ${projection.operations.render} render calls for this frame`
    });
  }
  if (snapshot.renderer !== "browser-dom-v1") {
    diagnostics.push({
      code: "CAPTURE_RENDERER_UNEXPECTED",
      severity: "error",
      message: `Raster evidence must come from browser-dom-v1, got ${String(snapshot.renderer)}`
    });
  }

  // The device scale factor belongs to the baseline key: a frame captured at 2x is
  // not comparable with one captured at 1x, and silently comparing them would
  // report a defect that does not exist.
  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as {
    imageSize: { width: number; height: number };
    requestedViewport: { width: number; height: number };
  };
  const deviceScale = Number((metadata.imageSize.width / metadata.requestedViewport.width).toFixed(2));
  const baselineDirectoryPath = baselineDirectory(project, request);
  const baselinePath = resolve(baselineDirectoryPath, `${request.width}x${request.height}@${deviceScale}x.png`);
  const tolerance = await readTolerance(baselineDirectoryPath);
  const captured = await readFile(capturePath);
  const baseline = await readFile(baselinePath).catch(() => null);
  let comparison: RasterComparison | null = null;

  if (baseline === null) {
    if (request.updateBaseline) {
      await mkdir(baselineDirectoryPath, { recursive: true });
      await writeFile(baselinePath, captured);
    } else {
      diagnostics.push({
        code: "CAPTURE_BASELINE_MISSING",
        severity: "warning",
        message: `No approved baseline for ${request.name}/${CAPTURE_BACKEND}/${request.profile}/${request.width}x${request.height}`,
        file: relative(project, baselinePath)
      });
    }
  } else {
    try {
      comparison = compareRasterImages(decodePng(baseline), decodePng(captured), tolerance);
    } catch (error) {
      diagnostics.push({
        code: error instanceof Error && /^CAPTURE_[A-Z_]+/.test(error.message)
          ? (/^CAPTURE_[A-Z_]+/.exec(error.message)?.[0] ?? "CAPTURE_BASELINE_MISMATCH")
          : "CAPTURE_BASELINE_MISMATCH",
        severity: "error",
        message: error instanceof Error ? error.message : "Baseline comparison failed",
        file: relative(project, baselinePath)
      });
    }
    if (comparison !== null && !comparison.withinTolerance) {
      diagnostics.push({
        code: "CAPTURE_BASELINE_MISMATCH",
        severity: request.updateBaseline ? "warning" : "error",
        message: `Frame differs from baseline: ${comparison.changedPixels} pixels changed, max channel delta ${comparison.maxChannelDelta}`,
        file: relative(project, baselinePath),
        details: { tolerance: { ...tolerance }, regions: comparison.regions.length }
      });
      if (request.updateBaseline) await writeFile(baselinePath, captured);
    }
  }

  const diffPath = resolve(output, "capture-diff.json");
  await writeFile(diffPath, `${JSON.stringify({
    baseline: relative(project, baselinePath),
    baselinePresent: baseline !== null,
    tolerance,
    comparison,
    updatedBaseline: request.updateBaseline
  }, null, 2)}\n`, "utf8");

  const artifacts = await Promise.all([
    writeCacheDecisions(engineRoot, project, context.runId, build.decisions),
    artifact("raster-capture", capturePath),
    artifact("rendered-ui-snapshot", snapshotPath),
    artifact("ui-view-model", viewModelPath),
    artifact("capture-metadata", metadataPath),
    artifact("projection-trace", projectionPath),
    artifact("host-diagnostics", hostDiagnosticsPath),
    artifact("capture-diff", diffPath)
  ]);
  return {
    diagnostics,
    artifacts,
    data: {
      backend: CAPTURE_BACKEND,
      renderer: snapshot.renderer,
      profile: request.profile,
      viewport: { width: request.width, height: request.height },
      ticks: request.ticks,
      baselinePresent: baseline !== null,
      projection: { visuals: projection.visuals.length, operations: projection.operations },
      hostDiagnostics: hostDiagnostics.length,
      cache: build.decisions.map(({ family, status, reason }) => ({ family, status, ...(reason === undefined ? {} : { reason }) })),
      ...(comparison === null ? {} : { comparison }),
      ...(baseline === null && !request.updateBaseline ? { classification: "NOT_AVAILABLE" } : {})
    },
    nextActions: baseline === null && !request.updateBaseline
      ? ["Review the captured frame and approve it with game capture --raster --update-baseline"]
      : ["Inspect reports/runs for the capture bundle"]
  };
}
