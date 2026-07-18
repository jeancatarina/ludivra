import type { PresentationState } from "@ludivra/presentation-protocol";
import { createThreeRenderer } from "@ludivra/renderer-three";
import { LudivraRuntime } from "@ludivra/runtime-web";
import { createGamePresenter } from "@game/presentation";
import createLudivraModule from "@ludivra/runtime-module";
import { audioSources, gameplaySource, manifest } from "virtual:ludivra-game";
import { createAudioFeedback } from "./audio-feedback";
import { createDesktopCheckpointManager } from "./desktop-checkpoint";
import { presentEffect } from "./effect-feedback";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
const title = document.querySelector<HTMLElement>("#game-title");
const status = document.querySelector<HTMLElement>("#runtime-status");
const actions = document.querySelector<HTMLElement>("#game-actions");
if (canvas === null || title === null || status === null || actions === null) {
  throw new Error("browser host document is incomplete");
}

title.textContent = manifest.name;
document.title = manifest.name;

const runtime = await LudivraRuntime.create(
  createLudivraModule,
  { tickRateHz: 60, maxPendingInputs: 4096, seed: 42n }
);
runtime.loadGameplay(gameplaySource);
const desktop = await createDesktopCheckpointManager(runtime);
status.textContent = `Kernel WASM · tick ${runtime.tick()}${desktop === null ? "" : " · autosave desktop"}`;

const renderer = createThreeRenderer(canvas);
const presenter = createGamePresenter(renderer);
const audio = createAudioFeedback(manifest.audio ?? [], audioSources);
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

for (const input of manifest.inputs) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = `${input.label} · ${input.keys.join(" / ")}`;
  button.addEventListener("click", () => submit(input.actionId));
  actions.append(button);
}

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
    for (const event of runtime.drainPresentationEvents()) {
      if (event.type === "effect-spawn") presentEffect(renderer, effects, event);
      else audio.handle(event);
    }
  }
  presenter.present(presentationState);
  renderer.render();
  status.textContent = `Kernel WASM · tick ${runtime.tick()}${desktop === null ? "" : " · autosave desktop"}`;
  animationFrame = requestAnimationFrame(frame);
}
animationFrame = requestAnimationFrame(frame);

window.addEventListener("beforeunload", () => {
  running = false;
  cancelAnimationFrame(animationFrame);
  desktop?.dispose();
  document.removeEventListener("visibilitychange", audioVisibility);
  audio.destroy();
  presenter.destroy();
  renderer.destroy();
  runtime.destroy();
});
