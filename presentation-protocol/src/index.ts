export type VisualShape = "box" | "sphere" | "ring";

export interface VisualDefinition {
  id: string;
  shape: VisualShape;
  color: number;
  scale?: readonly [number, number, number];
}

export interface VisualTransform {
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  scale?: readonly [number, number, number];
}

export interface PresentationRenderer {
  createVisual(definition: VisualDefinition): void;
  setTransform(id: string, transform: VisualTransform): void;
  setColor(id: string, color: number): void;
  render(): void;
  resize(width: number, height: number, pixelRatio: number): void;
  destroy(): void;
}

export interface PresentationState {
  tick: bigint;
  integer(key: number): bigint;
}

export interface GamePresenter {
  present(state: PresentationState): void;
  destroy(): void;
}

export type CreateGamePresenter = (renderer: PresentationRenderer) => GamePresenter;
