#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { createInterface } from "node:readline";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  BASE_LOCALE,
  createUiInspectionProjector,
  RENDERED_UI_SNAPSHOT_PROTOCOL_VERSION,
  resolveUiLabel,
  type UiInspectionProjection,
  type UiInspectionProjector,
  type RenderedUiSnapshot,
  type UiLocaleTable,
  type UiViewModel
} from "@ludivra/presentation-protocol";
import { LudivraRuntime, RuntimeFailure, type PresentationEvent, type RuntimeModuleFactory } from "@ludivra/runtime-web";
import { parse, type ParseError } from "jsonc-parser";
import { createContractValidator } from "./contract-validator.js";
import {
  CONTROL_PROTOCOL_VERSION,
  type ControlRequest,
  type ControlResponse
} from "./generated/control-protocol.js";
import { readGameManifest, type GameManifest } from "./project.js";

interface LogicalStateSnapshot {
  tick: string;
  stateHash: string;
  integers: Array<{ id: string; label: string; key: number; value: string }>;
}

interface TimelineEntry {
  sequence: number;
  tick: string;
  stage: "input" | "command" | "event" | "presentation";
  kind: string;
  data: Record<string, unknown>;
}

const projectArgument = process.argv.indexOf("--project");
const engineArgument = process.argv.indexOf("--engine-root");
const projectDirectory = projectArgument >= 0 ? resolve(process.argv[projectArgument + 1] ?? "") : "";
const engineRoot = engineArgument >= 0 ? resolve(process.argv[engineArgument + 1] ?? "") : "";
const expectedToken = process.env.LUDIVRA_CONTROL_TOKEN ?? "";
if (projectDirectory.length === 0 || engineRoot.length === 0 || expectedToken.length < 32) {
  process.stderr.write("CONTROL_WORKER_CONFIGURATION_INVALID\n");
  process.exit(2);
}

const schema = JSON.parse(await readFile(resolve(engineRoot, "contracts/control-protocol.schema.json"), "utf8"));
const validator = createContractValidator().compile(schema);
const manifest = await readGameManifest(projectDirectory);
const manifestText = await readFile(resolve(projectDirectory, "game.jsonc"), "utf8");

function withinProject(path: string): string {
  const resolved = resolve(projectDirectory, path);
  const relation = relative(projectDirectory, resolved);
  if (relation.startsWith("..") || isAbsolute(relation)) throw new Error("CONTROL_PROJECT_PATH_ESCAPE");
  return resolved;
}

const gameplayCandidate = withinProject(manifest.entrypoints.gameplay);
const [actualProject, actualGameplay] = await Promise.all([realpath(projectDirectory), realpath(gameplayCandidate)]);
const gameplayRelation = relative(actualProject, actualGameplay);
if (gameplayRelation.startsWith("..") || isAbsolute(gameplayRelation)) throw new Error("CONTROL_PROJECT_PATH_ESCAPE");
const gameplaySource = await readFile(actualGameplay, "utf8");
// Content arrives as the compiled pack, identified by hash: the worker and the
// BrowserHost either load the same bytes or disagree loudly.
const contentPackBytes = await readFile(resolve(projectDirectory, ".ludivra/content-pack.json")).catch(() => {
  throw new Error("CONTENT_PACK_MISSING");
});
const contentHasher = createHash("sha256").update(manifestText).update("\0").update(gameplaySource);
contentHasher.update("\0").update(contentPackBytes);
const contentHash = contentHasher.digest("hex");
const compiledDocuments = JSON.parse(new TextDecoder().decode(contentPackBytes)).sections.documents.value as Record<string, unknown>;
const moduleUrl = pathToFileURL(resolve(engineRoot, "runtime-wasm/generated/ludivra-runtime.mjs")).href;
const moduleFactory = (await import(moduleUrl)).default as RuntimeModuleFactory;
let runtime: LudivraRuntime | undefined;
let scenarioId: string | undefined;
let actionSequence = 0n;
let timelineSequence = 0;
let actionCount = 0;
let steppedTicks = 0;
let startedAt = performance.now();
let timeline: TimelineEntry[] = [];
let uiProjectors: UiInspectionProjector[] = [];
let latestUiProjections = new Map<string, UiInspectionProjection>();
let gameProjectorId: string | undefined;
let statechartStateNames = new Map<number, string>();

function installDeclaredStatechart(target: LudivraRuntime): void {
  const declaration = manifest.statecharts;
  if (declaration === undefined) return;
  const graph = compiledDocuments["ludivra.statecharts"] as { charts?: Array<Record<string, unknown>> } | undefined;
  const chart = graph?.charts?.[0];
  if (graph?.charts?.length !== 1 || chart === undefined) throw new Error("STATECHART_SCHEMA_INVALID");
  const states = chart.states as Array<{ id: string; parent?: string; history: boolean }>;
  const transitions = chart.transitions as Array<{ id: string; from: string; to: string; event?: string; priority: number; kind: "external" | "internal" }>;
  const stateIds = new Map(states.map(({ id }, index) => [id, index + 1]));
  statechartStateNames = new Map([...stateIds.entries()].map(([id, numeric]) => [numeric, id]));
  const eventIds = new Map(declaration.events.map(({ id, actionId }) => [id, actionId]));
  target.installStatechart(
    states.map((state) => state.parent === undefined
      ? { id: stateIds.get(state.id)!, shallowHistory: state.history }
      : { id: stateIds.get(state.id)!, parentId: stateIds.get(state.parent)!, shallowHistory: state.history }),
    transitions.map((transition, index) => {
      const eventActionId = transition.event === undefined ? undefined : eventIds.get(transition.event);
      if (eventActionId === undefined || stateIds.get(transition.from) === undefined || stateIds.get(transition.to) === undefined) throw new Error("STATECHART_SCHEMA_INVALID");
      return { id: index + 1, fromState: stateIds.get(transition.from)!, eventActionId, toState: stateIds.get(transition.to)!, priority: transition.priority, kind: transition.kind };
    }),
    stateIds.get(chart.initial as string)!
  );
}

function logicalState(): LogicalStateSnapshot {
  if (runtime === undefined) throw new Error("CONTROL_SCENARIO_NOT_LOADED");
  return {
    tick: runtime.tick().toString(),
    stateHash: runtime.stateHash().toString(16).padStart(16, "0"),
    integers: manifest.inspection.integerStates.map((definition) => ({
      ...definition,
      value: runtime?.integerState(definition.key).toString() ?? "0"
    }))
  };
}

function projectAfterCommit(): UiInspectionProjection {
  const committedRuntime = runtime;
  if (committedRuntime === undefined || uiProjectors.length === 0) throw new Error("CONTROL_PROJECTOR_NOT_READY");
  const state = {
    get tick() { return committedRuntime.tick(); },
    integer(key: number) { return committedRuntime.integerState(key); }
  };
  latestUiProjections = new Map(uiProjectors.map((projector) => [projector.declaration.id, projector.project(state)]));
  return currentUiProjection();
}

function currentUiProjection(): UiInspectionProjection {
  if (gameProjectorId === undefined) throw new Error("CONTROL_PROJECTOR_NOT_READY");
  const projection = latestUiProjections.get(gameProjectorId);
  if (projection === undefined) throw new Error("CONTROL_PROJECTOR_NOT_READY");
  return projection;
}

/**
 * Synthetic layout for the headless adapter. It proves composition and semantics
 * only; pixels of the BrowserHost are a separate renderer and a separate gate.
 */
function renderedUiSnapshot(viewModel: UiViewModel, locale: UiLocaleTable): RenderedUiSnapshot {
  let statusIndex = 0;
  let buttonIndex = 0;
  return {
    protocolVersion: RENDERED_UI_SNAPSHOT_PROTOCOL_VERSION,
    renderer: "headless-semantic-v1",
    viewport: { width: 1280, height: 720 },
    textScale: 1,
    locale: BASE_LOCALE,
    nodes: viewModel.nodes.map((node) => {
      const isButton = node.role === "button";
      const index = isButton ? buttonIndex++ : statusIndex++;
      return {
        id: node.id,
        bounds: isButton
          ? { x: 80 + index * 260, y: 600, width: 230, height: 56 }
          : { x: 80, y: 120 + index * 42, width: 520, height: 32 },
        visible: true,
        clipped: false,
        focused: viewModel.focus === node.id,
        text: resolveUiLabel(locale, node.labelKey, node.labelParams),
        accessibleRole: node.role
      };
    })
  };
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function captureSvg(state: LogicalStateSnapshot, rendered: RenderedUiSnapshot): string {
  const nodes = rendered.nodes.map((node) => {
    const { x, y, width, height } = node.bounds;
    if (node.accessibleRole === "button") {
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="#5f46d8"/><text x="${x + 18}" y="${y + 35}" fill="#ffffff" font-size="18">${escapeXml(node.text)}</text>`;
    }
    return `<text x="${x}" y="${y + 24}" fill="#d8f7ef" font-size="20">${escapeXml(node.text)}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#080711"/><text x="80" y="70" fill="#9b7cff" font-size="34" font-weight="700">${escapeXml(manifest.name)}</text><circle cx="900" cy="300" r="${90 + Math.min(Number(state.integers[0]?.value ?? 0), 20) * 3}" fill="#9b7cff"/><circle cx="900" cy="300" r="160" fill="none" stroke="#46e6c4" stroke-width="8"/>${nodes}</svg>\n`;
}

function append(stage: TimelineEntry["stage"], kind: string, data: Record<string, unknown>): void {
  timelineSequence += 1;
  timeline.push({ sequence: timelineSequence, tick: runtime?.tick().toString() ?? "0", stage, kind, data });
}

function recordEvents(events: PresentationEvent[]): void {
  for (const event of events) {
    append("event", event.type, JSON.parse(JSON.stringify(event, (_key, value) => typeof value === "bigint" ? value.toString() : value)) as Record<string, unknown>);
  }
}

function step(count = 1): void {
  if (runtime === undefined) throw new Error("CONTROL_SCENARIO_NOT_LOADED");
  for (let index = 0; index < count; index += 1) {
    const before = logicalState();
    const beforeStatechart = runtime.statechartActive();
    runtime.step(1);
    steppedTicks += 1;
    const after = logicalState();
    const afterStatechart = runtime.statechartActive();
    if (beforeStatechart !== afterStatechart) {
      append("command", "statechart-transition", {
        chart: manifest.statecharts?.charts[0]?.id ?? "unknown",
        previous: statechartStateNames.get(beforeStatechart) ?? String(beforeStatechart),
        active: statechartStateNames.get(afterStatechart) ?? String(afterStatechart)
      });
    }
    for (const next of after.integers) {
      const previous = before.integers.find(({ key }) => key === next.key);
      if (previous?.value !== next.value) {
        append("command", "committed-state-diff", {
          key: next.key,
          before: previous?.value ?? "0",
          after: next.value,
          delta: (BigInt(next.value) - BigInt(previous?.value ?? "0")).toString()
        });
      }
    }
    recordEvents(runtime.drainPresentationEvents());
    const projection = projectAfterCommit();
    append("presentation", "frame-projected", { stateHash: after.stateHash, projector: projection.measurement });
  }
}

function inspect(): Record<string, unknown> {
  const activeRuntime = runtime;
  if (activeRuntime === undefined) throw new Error("CONTROL_SCENARIO_NOT_LOADED");
  const state = logicalState();
  const projection = currentUiProjection();
  return {
    scenarioId,
    logicalState: state,
    uiViewModel: projection.viewModel,
    renderedUiSnapshot: renderedUiSnapshot(projection.viewModel, projection.localeTable),
    timeline,
    replayBase64: Buffer.from(activeRuntime.replay()).toString("base64")
  };
}

function conditionSatisfied(condition: Record<string, unknown>): boolean {
  if (runtime === undefined) return false;
  if (typeof condition.tickAtLeast === "number") return runtime.tick() >= BigInt(condition.tickAtLeast);
  const integer = condition.integer as { key: number; equals: number } | undefined;
  if (integer !== undefined) return runtime.integerState(integer.key) === BigInt(integer.equals);
  const ui = condition.ui as { id: string; visible: boolean } | undefined;
  if (ui !== undefined) {
    const projection = currentUiProjection();
    const snapshot = renderedUiSnapshot(projection.viewModel, projection.localeTable);
    return snapshot.nodes.some((node) => node.id === ui.id && node.visible === ui.visible);
  }
  return false;
}

async function handle(request: ControlRequest): Promise<ControlResponse> {
  const pass = (data: unknown): ControlResponse => ({
    protocolVersion: CONTROL_PROTOCOL_VERSION,
    requestId: request.requestId,
    status: "PASS",
    data
  });
  switch (request.operation) {
    case "health":
      return pass({ host: "headless-wasm", projectId: manifest.id, contentHash, scenarioLoaded: scenarioId !== undefined });
    case "load_scenario": {
      runtime?.destroy();
      const payload = request.payload as { scenarioId: string; seed: number };
      runtime = await LudivraRuntime.create(moduleFactory, { tickRateHz: 60, maxPendingInputs: 4096, seed: BigInt(payload.seed) });
      runtime.loadContentPack(contentPackBytes);
      installDeclaredStatechart(runtime);
      // Same declaration the BrowserHost makes: both hosts resolve the manifest
      // symbols, so a script behaves identically headless and on screen.
      for (const definition of manifest.inspection.integerStates) {
        runtime.declareSymbol("state", definition.id, definition.key);
      }
      for (const definition of manifest.timers ?? []) {
        runtime.declareSymbol("timer", definition.id, definition.key);
      }
      runtime.loadGameplay(gameplaySource);
      scenarioId = payload.scenarioId;
      actionSequence = 0n;
      timelineSequence = 0;
      actionCount = 0;
      steppedTicks = 0;
      startedAt = performance.now();
      timeline = [];
      uiProjectors = manifest.projectors.map((declaration) => createUiInspectionProjector(declaration, {
        states: manifest.inspection.integerStates,
        inputs: manifest.inputs
      }));
      gameProjectorId = uiProjectors.find(({ declaration }) => declaration.screen === "game")?.declaration.id;
      if (gameProjectorId === undefined) throw new Error("UI_PROJECTOR_GAME_MISSING");
      projectAfterCommit();
      return pass(inspect());
    }
    case "act": {
      if (runtime === undefined) throw new Error("CONTROL_SCENARIO_NOT_LOADED");
      const payload = request.payload as { action: string; valueMilli?: number };
      const action = manifest.inputs.find(({ id }) => id === payload.action);
      if (action === undefined) throw new Error("CONTROL_ACTION_UNKNOWN");
      actionSequence += 1n;
      actionCount += 1;
      append("input", "logical-action", { action: action.id, actionId: action.actionId, valueMilli: payload.valueMilli ?? 1000, sequence: actionSequence.toString() });
      runtime.submitInput({ actionId: action.actionId, valueMilli: payload.valueMilli ?? 1000, sequence: actionSequence });
      step();
      return pass(inspect());
    }
    case "wait_for": {
      const payload = request.payload as { condition: Record<string, unknown>; maxTicks: number };
      let waitedTicks = 0;
      while (!conditionSatisfied(payload.condition) && waitedTicks < payload.maxTicks) {
        step();
        waitedTicks += 1;
      }
      if (!conditionSatisfied(payload.condition)) {
        return { protocolVersion: CONTROL_PROTOCOL_VERSION, requestId: request.requestId, status: "FAIL", diagnostic: { code: "CONTROL_WAIT_TIMEOUT", message: `Condition was not met after ${waitedTicks} ticks` }, data: inspect() };
      }
      return pass({ waitedTicks, ...inspect() });
    }
    case "inspect":
      return pass(inspect());
    case "capture": {
      const state = logicalState();
      const projection = currentUiProjection();
      const rendered = renderedUiSnapshot(projection.viewModel, projection.localeTable);
      return pass({ name: (request.payload as { name: string }).name, svg: captureSvg(state, rendered), logicalState: state, uiViewModel: projection.viewModel, renderedUiSnapshot: rendered });
    }
    case "metrics":
      return pass({ actions: actionCount, steppedTicks, timelineEntries: timeline.length, elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)), projectors: uiProjectors.map((projector) => projector.metrics()) });
    case "verify_replay": {
      if (runtime === undefined) throw new Error("CONTROL_SCENARIO_NOT_LOADED");
      const archive = Buffer.from((request.payload as { archiveBase64: string }).archiveBase64, "base64");
      runtime.verifyReplay(archive);
      return pass({ verified: true, bytes: archive.byteLength });
    }
    case "shutdown":
      runtime?.destroy();
      runtime = undefined;
      uiProjectors = [];
      latestUiProjections = new Map();
      gameProjectorId = undefined;
      return pass({ shutdown: true });
  }
}

function failure(requestId: number, error: unknown): ControlResponse {
  const message = error instanceof Error ? error.message : "Control operation failed";
  // A kernel failure carries its own stable code; prefer it over matching prose.
  const kernelCode = error instanceof RuntimeFailure ? error.code : undefined;
  return {
    protocolVersion: CONTROL_PROTOCOL_VERSION,
    requestId: Math.max(1, requestId),
    status: "FAIL",
    diagnostic: {
      code: kernelCode ?? (/^[A-Z][A-Z0-9_]+$/.test(message) ? message : "CONTROL_OPERATION_FAILED"),
      message
    }
  };
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  let response: ControlResponse;
  let requestId = 1;
  let shutdownRequested = false;
  try {
    const request = JSON.parse(line) as ControlRequest;
    requestId = request.requestId;
    if (!validator(request)) throw new Error("CONTROL_REQUEST_INVALID");
    if (request.token !== expectedToken) throw new Error("CONTROL_TOKEN_INVALID");
    shutdownRequested = request.operation === "shutdown";
    response = await handle(request);
  } catch (error) {
    response = failure(requestId, error);
  }
  if (!validator(response)) response = failure(requestId, new Error("CONTROL_RESPONSE_INVALID"));
  process.stdout.write(`${JSON.stringify(response)}\n`);
  if (response.status === "PASS" && shutdownRequested) break;
}
