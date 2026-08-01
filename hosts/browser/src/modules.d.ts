declare module "virtual:ludivra-game" {
  export const manifest: {
    name: string;
    inspection: {
      integerStates: Array<{ id: string; label: string; key: number }>;
    };
    projectors: Array<{
      projectorVersion: 1;
      id: string;
      kind: "ui-inspection";
      screen: string;
      states: string[];
      inputs: string[];
    }>;
    statecharts?: {
      charts: Array<{ id: string; source: string }>;
      events: Array<{ id: string; actionId: number }>;
      guards: Array<{ id: string }>;
      actions: Array<{ id: string }>;
    };
    timers?: Array<{ id: string; key: number }>;
    inputs: Array<{
      id: string;
      label: string;
      actionId: number;
      keys: string[];
    }>;
    audio?: Array<{
      id: string;
      eventId: number;
      bus: "music" | "ambience" | "effects";
      loop: boolean;
      autoplay: boolean;
      volume: number;
      origin: string;
      license: string;
      source?: string;
      synth?: {
        waveform: OscillatorType;
        frequency: number;
        durationMs: number;
      };
    }>;
    effects?: Array<{
      id: string;
      eventId: number;
      type: "particle-burst";
      color: number;
      count: number;
      size: number;
      speed: number;
      lifetimeMs: number;
      gravity: number;
    }>;
  };
  export const gameplaySource: string;
  export const contentPackSource: string;
  export const audioSources: Record<number, string>;
}

declare module "@ludivra/runtime-module" {
  import type { RuntimeModuleFactory } from "@ludivra/runtime-web";
  const factory: RuntimeModuleFactory;
  export default factory;
}

declare module "@game/presentation" {
  import type { CreateGamePresenter } from "@ludivra/presentation-protocol";
  export const createGamePresenter: CreateGamePresenter;
}

/** Inspection surface consumed by the raster capture adapter. Read-only by contract. */
interface LudivraUiInspection {
  ready: boolean;
  tick: string;
  stateHash: string;
  viewModel(): import("@ludivra/presentation-protocol").UiViewModel;
  snapshot(): import("@ludivra/presentation-protocol").RenderedUiSnapshot;
  projection(): import("@ludivra/presentation-protocol").ProjectionTrace;
  projectors(): Array<import("@ludivra/presentation-protocol").UiInspectionProjectorMetrics>;
  diagnostics(): Array<{ code: string; message: string; tick: string | null; source: string }>;
}

interface Window {
  ludivraDesktop?: import("@ludivra/platform-contracts").DesktopBridge;
  ludivraUi?: LudivraUiInspection;
}
