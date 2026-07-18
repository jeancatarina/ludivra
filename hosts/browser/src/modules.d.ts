declare module "virtual:ludivra-game" {
  export const manifest: {
    name: string;
    inputs: Array<{
      id: string;
      label: string;
      actionId: number;
      keys: string[];
    }>;
  };
  export const gameplaySource: string;
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
