#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { createInterface } from "node:readline";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { composeGameplaySource, createGameplayManifestDocument, LudivraRuntime, type GameplayContentDocument, type PresentationEvent, type RuntimeModuleFactory } from "@ludivra/runtime-web";
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

interface UiNode {
  id: string;
  role: "button" | "status";
  label: string;
  enabled: boolean;
  actions: string[];
}

interface UiViewModel {
  screen: "game";
  focus: string | null;
  nodes: UiNode[];
}

interface RenderedUiNode extends UiNode {
  bounds: { x: number; y: number; width: number; height: number };
  visible: boolean;
  clipped: boolean;
  focused: boolean;
}

interface RenderedUiSnapshot {
  renderer: "headless-semantic-v1";
  viewport: { width: 1280; height: 720 };
  nodes: RenderedUiNode[];
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
const contentDocuments: GameplayContentDocument[] = [];
const contentSources: string[] = [];
for (const descriptor of manifest.content ?? []) {
  const candidate = withinProject(descriptor.source);
  const actualContent = await realpath(candidate);
  const contentRelation = relative(actualProject, actualContent);
  if (contentRelation.startsWith("..") || isAbsolute(contentRelation)) throw new Error("CONTROL_PROJECT_PATH_ESCAPE");
  const source = await readFile(actualContent, "utf8");
  const errors: ParseError[] = [];
  const value = parse(source, errors);
  if (errors.length > 0) throw new Error("CONTROL_CONTENT_JSONC_INVALID");
  contentDocuments.push({ id: descriptor.id, value });
  contentSources.push(source);
}
const composedGameplaySource = composeGameplaySource(gameplaySource, [createGameplayManifestDocument(manifest), ...contentDocuments]);
const contentHasher = createHash("sha256").update(manifestText).update("\0").update(gameplaySource);
for (const source of contentSources) contentHasher.update("\0").update(source);
const contentHash = contentHasher.digest("hex");
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

function uiViewModel(state: LogicalStateSnapshot): UiViewModel {
  return {
    screen: "game",
    focus: null,
    nodes: [
      { id: "runtime.status", role: "status", label: `Tick ${state.tick}`, enabled: true, actions: [] },
      ...state.integers.map((integer) => ({
        id: `state.${integer.id}`,
        role: "status" as const,
        label: `${integer.label}: ${integer.value}`,
        enabled: true,
        actions: []
      })),
      ...manifest.inputs.map((input) => ({
        id: `action.${input.id}`,
        role: "button" as const,
        label: input.label,
        enabled: true,
        actions: ["act"]
      }))
    ]
  };
}

function renderedUiSnapshot(viewModel: UiViewModel): RenderedUiSnapshot {
  let statusIndex = 0;
  let buttonIndex = 0;
  return {
    renderer: "headless-semantic-v1",
    viewport: { width: 1280, height: 720 },
    nodes: viewModel.nodes.map((node) => {
      const isButton = node.role === "button";
      const index = isButton ? buttonIndex++ : statusIndex++;
      return {
        ...node,
        bounds: isButton
          ? { x: 80 + index * 260, y: 600, width: 230, height: 56 }
          : { x: 80, y: 120 + index * 42, width: 520, height: 32 },
        visible: true,
        clipped: false,
        focused: viewModel.focus === node.id
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
    if (node.role === "button") {
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="#5f46d8"/><text x="${x + 18}" y="${y + 35}" fill="#ffffff" font-size="18">${escapeXml(node.label)}</text>`;
    }
    return `<text x="${x}" y="${y + 24}" fill="#d8f7ef" font-size="20">${escapeXml(node.label)}</text>`;
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
    runtime.step(1);
    steppedTicks += 1;
    const after = logicalState();
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
    append("presentation", "frame-projected", { stateHash: after.stateHash });
  }
}

function inspect(): Record<string, unknown> {
  const activeRuntime = runtime;
  if (activeRuntime === undefined) throw new Error("CONTROL_SCENARIO_NOT_LOADED");
  const state = logicalState();
  const ui = uiViewModel(state);
  return {
    scenarioId,
    logicalState: state,
    uiViewModel: ui,
    renderedUiSnapshot: renderedUiSnapshot(ui),
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
    const snapshot = renderedUiSnapshot(uiViewModel(logicalState()));
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
      runtime.loadGameplay(composedGameplaySource);
      scenarioId = payload.scenarioId;
      actionSequence = 0n;
      timelineSequence = 0;
      actionCount = 0;
      steppedTicks = 0;
      startedAt = performance.now();
      timeline = [];
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
      const ui = uiViewModel(state);
      const rendered = renderedUiSnapshot(ui);
      return pass({ name: (request.payload as { name: string }).name, svg: captureSvg(state, rendered), logicalState: state, uiViewModel: ui, renderedUiSnapshot: rendered });
    }
    case "metrics":
      return pass({ actions: actionCount, steppedTicks, timelineEntries: timeline.length, elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)) });
    case "verify_replay": {
      if (runtime === undefined) throw new Error("CONTROL_SCENARIO_NOT_LOADED");
      const archive = Buffer.from((request.payload as { archiveBase64: string }).archiveBase64, "base64");
      runtime.verifyReplay(archive);
      return pass({ verified: true, bytes: archive.byteLength });
    }
    case "shutdown":
      runtime?.destroy();
      runtime = undefined;
      return pass({ shutdown: true });
  }
}

function failure(requestId: number, error: unknown): ControlResponse {
  const message = error instanceof Error ? error.message : "Control operation failed";
  return {
    protocolVersion: CONTROL_PROTOCOL_VERSION,
    requestId: Math.max(1, requestId),
    status: "FAIL",
    diagnostic: {
      code: /^[A-Z][A-Z0-9_]+$/.test(message) ? message : "CONTROL_OPERATION_FAILED",
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
