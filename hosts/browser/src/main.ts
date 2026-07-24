import {
  createRecordingRenderer,
  createUiLocaleTable,
  createUiViewModel,
  type PresentationState,
  type UiProjectionInput
} from "@ludivra/presentation-protocol";
import { createThreeRenderer } from "@ludivra/renderer-three";
import { composeGameplaySource, createGameplayManifestDocument, LudivraRuntime } from "@ludivra/runtime-web";
import { createGamePresenter } from "@game/presentation";
import createLudivraModule from "@ludivra/runtime-module";
import { audioSources, contentDocuments, gameplaySource, manifest } from "virtual:ludivra-game";
import { createAudioFeedback } from "./audio-feedback";
import { createDesktopCheckpointManager } from "./desktop-checkpoint";
import { presentEffect } from "./effect-feedback";
import { createHostDiagnostics } from "./host-diagnostics";
import { createDomUiRenderer } from "./ui-renderer";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
const title = document.querySelector<HTMLElement>("#game-title");
const hostStatus = document.querySelector<HTMLElement>("#host-status");
const gameStatus = document.querySelector<HTMLElement>("#game-status");
const actions = document.querySelector<HTMLElement>("#game-actions");
if (canvas === null || title === null || hostStatus === null || gameStatus === null || actions === null) {
  throw new Error("browser host document is incomplete");
}

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

title.textContent = manifest.name;
document.title = manifest.name;

let runtimeStarted = false;
const hostDiagnostics = createHostDiagnostics(() => (runtimeStarted ? runtime.tick().toString() : null));

const runtime = await LudivraRuntime.create(
  createLudivraModule,
  { tickRateHz: 60, maxPendingInputs: 4096, seed: 42n }
);
runtimeStarted = true;
const boundContentDocuments = [createGameplayManifestDocument(manifest), ...contentDocuments];
runtime.loadGameplay(composeGameplaySource(gameplaySource, boundContentDocuments));
const desktop = await createDesktopCheckpointManager(runtime);
// Host diagnostics stay outside the UI contract: they describe the host, not the game.
hostStatus.textContent = `Kernel WASM${desktop === null ? "" : " · autosave desktop"}`;

const recording = createRecordingRenderer(createThreeRenderer(canvas));
const renderer = recording.renderer;
const contentById = new Map(boundContentDocuments.map((document) => [document.id, document.value]));
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

function projection(): UiProjectionInput {
  return {
    screen: "game",
    tick: runtime.tick().toString(),
    integers: manifest.inspection.integerStates.map((definition) => ({
      id: definition.id,
      label: definition.label,
      value: runtime.integerState(definition.key).toString()
    })),
    inputs: manifest.inputs.map(({ id, label, actionId }) => ({ id, label, actionId }))
  };
}

const localeTable = createUiLocaleTable(projection());
const ui = createDomUiRenderer({
  status: gameStatus,
  actions,
  onIntent: (intent) => submit(intent.actionId)
});

function renderUi(): void {
  ui.render(createUiViewModel(projection()), localeTable);
}
renderUi();

window.ludivraUi = {
  ready: false,
  tick: runtime.tick().toString(),
  stateHash: runtime.stateHash().toString(16).padStart(16, "0"),
  viewModel: () => createUiViewModel(projection()),
  snapshot: () => ui.snapshot(),
  projection: () => recording.trace(runtime.tick().toString()),
  diagnostics: () => hostDiagnostics.list()
};

window.addEventListener("keydown", (event) => {
  const input = manifest.inputs.find((candidate) => candidate.keys.includes(event.code));
  if (input !== undefined && !event.repeat) {
    event.preventDefault();
    submit(input.actionId);
  }
});

function resize(): void {
  const bounds = canvas.getBoundingClientRect();
  renderer.resize(bounds.width, bounds.height, window.devicePixelRatio);
}
window.addEventListener("resize", resize);
resize();

const presentationState: PresentationState = {
  get tick() { return runtime.tick(); },
  integer(key) { return runtime.integerState(key); }
};

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
    runtime.step(ticks);
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
    runtime.step(captureTicks);
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
