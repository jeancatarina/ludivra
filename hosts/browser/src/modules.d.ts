declare module "virtual:ludivra-game" {
  export const manifest: {
    name: string;
    inspection: {
      integerStates: Array<{ id: string; label: string; key: number }>;
    };
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
  export const contentDocuments: Array<{ id: string; value: unknown }>;
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

interface Window {
  ludivraDesktop?: import("@ludivra/platform-contracts").DesktopBridge;
}
