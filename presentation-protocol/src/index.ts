export type VisualShape =
  | "box"
  | "cone"
  | "cylinder"
  | "octahedron"
  | "ring"
  | "sphere"
  | "torus";

export type VisualSurface = "emissive" | "glass" | "matte" | "metal";

export interface VisualDefinition {
  id: string;
  shape: VisualShape;
  color: number;
  scale?: readonly [number, number, number];
  surface?: VisualSurface;
  opacity?: number;
}

export interface VisualTransform {
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  scale?: readonly [number, number, number];
}

export interface CameraView {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  fieldOfView?: number;
}

export interface SceneAtmosphere {
  fogColor: number;
  fogDensity: number;
  ambientColor: number;
  ambientIntensity: number;
  keyColor: number;
  keyIntensity: number;
  fillColor: number;
  fillIntensity: number;
}

export interface ParticleBurst {
  position: readonly [number, number, number];
  color: number;
  count: number;
  size: number;
  speed: number;
  lifetimeMs: number;
  gravity: number;
  seed: bigint;
}

export interface PresentationRenderer {
  createVisual(definition: VisualDefinition): void;
  setTransform(id: string, transform: VisualTransform): void;
  setColor(id: string, color: number): void;
  setVisible(id: string, visible: boolean): void;
  setCamera(view: CameraView): void;
  setAtmosphere(atmosphere: SceneAtmosphere): void;
  spawnParticles(burst: ParticleBurst): void;
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
