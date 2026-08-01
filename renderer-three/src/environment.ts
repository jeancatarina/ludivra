export type RendererFeatureTier = "core" | "enhanced";
export type RendererShadowProfile = "basic" | "soft";

export interface RendererEnvironment {
  id: string;
  tier: RendererFeatureTier;
  skyColor: number;
  exposure: number;
  fog: {
    color: number;
    density: number;
  };
  lighting: {
    ambientColor: number;
    ambientIntensity: number;
    keyColor: number;
    keyIntensity: number;
    fillColor: number;
    fillIntensity: number;
  };
  shadows: RendererShadowProfile;
}

export const DEFAULT_RENDERER_ENVIRONMENT: RendererEnvironment = {
  id: "renderer.default",
  tier: "core",
  skyColor: 0x05090e,
  exposure: 1.12,
  fog: { color: 0x05090e, density: 0.035 },
  lighting: {
    ambientColor: 0x6ba3b3,
    ambientIntensity: 1.2,
    keyColor: 0xffffff,
    keyIntensity: 4,
    fillColor: 0x58e0c2,
    fillIntensity: 28
  },
  shadows: "basic"
};
