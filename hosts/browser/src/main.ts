import {
  createUiInspectionProjector,
  createRecordingRenderer,
  type PresentationState,
  type UiInspectionProjection
} from "@ludivra/presentation-protocol";
import { createThreeRenderer } from "@ludivra/renderer-three";
import { installCompiledStatechart, LudivraRuntime, type CompiledStatechartDocument } from "@ludivra/runtime-web";
import { createGamePresenter } from "@game/presentation";
import createLudivraModule from "@ludivra/runtime-module";
import { audioSources, contentPackSource, gameplaySource, manifest } from "virtual:ludivra-game";
import { createAudioFeedback } from "./audio-feedback";
import { createDesktopCheckpointManager } from "./desktop-checkpoint";
import { presentEffect } from "./effect-feedback";
import { createHostDiagnostics } from "./host-diagnostics";
import { createDomUiRenderer } from "./ui-renderer";
export { WebRtcDataChannelTransport, decodeNetworkPacket, decodeSignalingDescription, encodeNetworkPacket, encodeSignalingDescription } from "./network/webrtc-transport";
export { SteamP2PTransport } from "./network/steam-transport";
export {
  HostedChunkSync,
  NetworkChunkSyncFailure,
  RemoteChunkSync,
  createNetworkChunkDelta,
  encodeNetworkChunkDelta,
  networkChunkDeltaFromRuntime,
  networkChunkContentHash
} from "./network/chunk-sync";
export {
  HostedRoomBridge,
  HostedRoomBridgeFailure,
  RemoteRoomClientBridge,
  decodeNetworkHashReport,
  decodeNetworkHello,
  decodeNetworkInput,
  decodeNetworkSnapshot,
  encodeNetworkHello,
  encodeNetworkHashReport,
  encodeNetworkInput,
  encodeNetworkSnapshot
} from "./network/room-bridge";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
const title = document.querySelector<HTMLElement>("#game-title");
const hostStatus = document.querySelector<HTMLElement>("#host-status");
const gameStatus = document.querySelector<HTMLElement>("#game-status");
const actions = document.querySelector<HTMLElement>("#game-actions");
const app = document.querySelector<HTMLElement>("#app");
if (canvas === null || title === null || hostStatus === null || gameStatus === null || actions === null || app === null) {
  throw new Error("browser host document is incomplete");
}
// Values captured by async callbacks need non-null aliases; DOM readiness was
// asserted above and these nodes are not replaced for the host lifetime.
const gameCanvas: HTMLCanvasElement = canvas;
const applicationRoot: HTMLElement = app;

/**
 * Deterministic capture mode. `?ludivra-capture=<ticks>` replaces the animation
 * loop with an exact number of logical ticks, so a raster baseline compares a
 * declared quiescent frame instead of whatever the scheduler produced.
 */
const captureParameter = new URLSearchParams(window.location.search).get("ludivra-capture");
const captureTicks = captureParameter === null ? null : Number(captureParameter);
if (captureTicks !== null && (!Number.isInteger(captureTicks) || captureTicks < 0)) {
  throw new Error("CAPTURE_TICKS_INVALID");
}
const textScaleParameter = new URLSearchParams(window.location.search).get("ludivra-text-scale");
if (textScaleParameter !== null) {
  const textScale = Number(textScaleParameter);
  if (!Number.isFinite(textScale) || textScale <= 0) throw new Error("CAPTURE_TEXT_SCALE_INVALID");
  document.documentElement.style.fontSize = `${16 * textScale}px`;
}
const requestedLocale = new URLSearchParams(window.location.search).get("ludivra-locale");
if (
  requestedLocale !== null &&
  requestedLocale !== "base" &&
  !manifest.ui.locales.some(({ locale }) => locale === requestedLocale)
) {
  throw new Error(`UI_LOCALE_UNDECLARED: ${requestedLocale}`);
}

title.textContent = manifest.name;
document.title = manifest.name;
document.documentElement.style.setProperty("--ui-min-touch-target", `${manifest.ui.minimumTouchTargetPx}px`);

let runtimeStarted = false;
const hostDiagnostics = createHostDiagnostics(() => (runtimeStarted ? runtime.tick().toString() : null));

const runtime = await LudivraRuntime.create(
  createLudivraModule,
  { tickRateHz: 60, maxPendingInputs: 4096, seed: 42n }
);
runtimeStarted = true;
const packDocuments = (JSON.parse(contentPackSource) as {
  sections: { documents: { value: Record<string, unknown> } };
}).sections.documents.value;
// The manifest owns the numeric keys; declaring them here is what lets gameplay
// read state by name.
for (const definition of manifest.inspection.integerStates) {
  runtime.declareSymbol("state", definition.id, definition.key);
}
for (const definition of manifest.timers ?? []) {
  runtime.declareSymbol("timer", definition.id, definition.key);
}
// Content comes from the compiled pack, never from the script chunk.
const contentPackBytes = new TextEncoder().encode(contentPackSource);
runtime.loadContentPack(contentPackBytes);
installCompiledStatechart(
  runtime,
  manifest.statecharts,
  packDocuments["ludivra.statecharts"] as CompiledStatechartDocument | undefined
);
runtime.loadGameplay(gameplaySource);
const presentationState: PresentationState = {
  get tick() { return runtime.tick(); },
  integer(key) { return runtime.integerState(key); }
};
const uiProjectors = manifest.projectors.map((declaration) => createUiInspectionProjector(declaration, {
  states: manifest.inspection.integerStates,
  inputs: manifest.inputs,
  locale: { catalog: manifest.ui, requestedLocale }
}));
const selectedUiProjector = uiProjectors.find(({ declaration }) => declaration.screen === "game");
if (selectedUiProjector === undefined) throw new Error("UI_PROJECTOR_GAME_MISSING");
const gameUiProjector: NonNullable<typeof selectedUiProjector> = selectedUiProjector;
// Gameplay is loaded and its initial state is now committed. Every subsequent
// invocation happens immediately after runtime.step, before presentation reads it.
let uiProjections = new Map<string, UiInspectionProjection>(
  uiProjectors.map((projector) => [projector.declaration.id, projector.project(presentationState)])
);
const initialUiProjection = uiProjections.get(gameUiProjector.declaration.id);
if (initialUiProjection === undefined) throw new Error("UI_PROJECTOR_GAME_MISSING");
let uiProjection: UiInspectionProjection = initialUiProjection;
const desktop = await createDesktopCheckpointManager(runtime);
// Host diagnostics stay outside the UI contract: they describe the host, not the game.
hostStatus.textContent = `Kernel WASM${desktop === null ? "" : " · autosave desktop"}`;

const recording = createRecordingRenderer(createThreeRenderer(gameCanvas, {
  reportDiagnostic: hostDiagnostics.report
}));
const renderer = recording.renderer;
const contentById = new Map(Object.entries(packDocuments));
const presenter = createGamePresenter(renderer, {
  content<T>(id: string): T {
    if (!contentById.has(id)) throw new Error(`presentation content does not exist: ${id}`);
    return contentById.get(id) as T;
  }
});
const audio = createAudioFeedback(manifest.audio ?? [], audioSources, hostDiagnostics.report);
const effects = new Map((manifest.effects ?? []).map((definition) => [definition.eventId, definition]));
const audioVisibility = (): void => {
  if (document.visibilityState === "hidden") audio.suspend();
  else audio.resume();
};
document.addEventListener("visibilitychange", audioVisibility);
let sequence = 0n;
let previousTime = performance.now();
let accumulator = 0;
let running = true;
let animationFrame = 0;
const tickDuration = 1000 / 60;

function submit(actionId: number): void {
  audio.unlock();
  sequence += 1n;
  runtime.submitInput({ actionId, valueMilli: 1000, sequence });
  desktop?.schedule();
}

const ui = createDomUiRenderer({
  status: gameStatus,
  actions,
  onIntent: (intent) => submit(intent.actionId),
  breakpoint: () => currentBreakpoint(document.documentElement.clientWidth)
});

function renderUi(): void {
  ui.render(uiProjection.viewModel, uiProjection.localeTable);
}
renderUi();

window.ludivraUi = {
  ready: false,
  tick: runtime.tick().toString(),
  stateHash: runtime.stateHash().toString(16).padStart(16, "0"),
  viewModel: () => uiProjection.viewModel,
  snapshot: () => ui.snapshot(),
  projection: () => recording.trace(runtime.tick().toString()),
  projectors: () => uiProjectors.map((projector) => projector.metrics()),
  diagnostics: () => hostDiagnostics.list()
};

window.addEventListener("keydown", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.closest("button, input, select, textarea, [contenteditable='true']") !== null) {
    return;
  }
  const input = manifest.inputs.find((candidate) => candidate.keys.includes(event.code));
  if (input !== undefined && !event.repeat) {
    event.preventDefault();
    submit(input.actionId);
  }
});

function currentBreakpoint(width: number): string {
  const breakpoint = manifest.ui.breakpoints.find(({ minWidth, maxWidth }) =>
    width >= minWidth && (maxWidth === undefined || width <= maxWidth)
  );
  if (breakpoint === undefined) throw new Error(`UI_BREAKPOINT_UNDECLARED: ${width}`);
  return breakpoint.id;
}

function resize(): void {
  const bounds = gameCanvas.getBoundingClientRect();
  renderer.resize(bounds.width, bounds.height, window.devicePixelRatio);
  applicationRoot.dataset.uiBreakpoint = currentBreakpoint(document.documentElement.clientWidth);
}
window.addEventListener("resize", resize);
resize();

function projectAfterCommit(): void {
  try {
    const nextProjections = new Map(
      uiProjectors.map((projector) => [projector.declaration.id, projector.project(presentationState)])
    );
    const projection = nextProjections.get(gameUiProjector.declaration.id);
    if (projection === undefined) throw new Error("UI_PROJECTOR_GAME_MISSING");
    uiProjections = nextProjections;
    uiProjection = projection;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = message.match(/^[A-Z][A-Z0-9_]+/)?.[0] ?? "UI_PROJECTOR_FAILED";
    // The tick is already confirmed. Keep the last valid projection and record
    // the failure instead of letting presentation become a rollback channel.
    hostDiagnostics.report(code, message, "ui-projector");
  }
}

function stepAndProject(count: number): void {
  for (let index = 0; index < count; index += 1) {
    runtime.step(1);
    projectAfterCommit();
  }
}

function drainEvents(): void {
  for (const event of runtime.drainPresentationEvents()) {
    if (event.type === "effect-spawn") presentEffect(renderer, effects, event);
    else audio.handle(event);
  }
}

function publishInspection(ready: boolean): void {
  const inspection = window.ludivraUi;
  if (inspection === undefined) return;
  inspection.tick = runtime.tick().toString();
  inspection.stateHash = runtime.stateHash().toString(16).padStart(16, "0");
  inspection.ready = ready;
}

function present(): void {
  recording.beginFrame();
  presenter.present(presentationState);
  renderer.render();
  renderUi();
}

function frame(time: number): void {
  if (!running) {
    return;
  }
  accumulator += Math.min(time - previousTime, 100);
  previousTime = time;
  const ticks = Math.min(Math.floor(accumulator / tickDuration), 5);
  if (ticks > 0) {
    stepAndProject(ticks);
    accumulator -= ticks * tickDuration;
    drainEvents();
  }
  present();
  publishInspection(true);
  animationFrame = requestAnimationFrame(frame);
}

if (captureTicks === null) {
  animationFrame = requestAnimationFrame(frame);
} else {
  if (captureTicks > 0) {
    stepAndProject(captureTicks);
    drainEvents();
  }
  present();
  publishInspection(true);
}

window.addEventListener("beforeunload", () => {
  running = false;
  cancelAnimationFrame(animationFrame);
  desktop?.dispose();
  document.removeEventListener("visibilitychange", audioVisibility);
  audio.destroy();
  hostDiagnostics.dispose();
  ui.destroy();
  presenter.destroy();
  renderer.destroy();
  runtime.destroy();
});
