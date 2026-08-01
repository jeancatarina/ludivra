import { RendererFailure } from "./diagnostics.js";

export type RendererProfile = "web-compatible" | "desktop-compatible" | "desktop-high";
export type RendererMethod = "webgl2" | "webgpu";
export type RendererFeature =
  | "pbr"
  | "shadows"
  | "postprocess"
  | "cpu-particles"
  | "gpu-particles"
  | "instancing"
  | "lod"
  | "culling"
  | "animation"
  | "gamepad"
  | "gpu-timestamps";

export interface RendererProfileRequest {
  profile: RendererProfile;
  requiredFeatures: readonly RendererFeature[];
  optionalFeatures: readonly RendererFeature[];
  fallbackProfiles: readonly RendererProfile[];
}

/** Actual methods implemented by this build, not merely APIs visible on a GPU. */
export interface RendererBackendAvailability {
  webgl2: boolean;
  webgpu: boolean;
  adapter: string | null;
}

export interface RendererProfileSelection {
  requestedProfile: RendererProfile;
  effectiveProfile: RendererProfile;
  requestedMethod: RendererMethod;
  effectiveMethod: RendererMethod;
  adapter: string | null;
  requiredFeatures: RendererFeature[];
  optionalFeatures: RendererFeature[];
  unavailableOptionalFeatures: RendererFeature[];
  fallbackReason?: string;
}

interface ProfileRule {
  method: RendererMethod;
  features: readonly RendererFeature[];
  allowedFallbacks: readonly RendererProfile[];
}

const rules: Readonly<Record<RendererProfile, ProfileRule>> = {
  "web-compatible": {
    method: "webgl2",
    features: ["pbr", "shadows", "postprocess", "cpu-particles", "instancing", "lod", "culling", "animation", "gamepad"],
    allowedFallbacks: []
  },
  "desktop-compatible": {
    method: "webgl2",
    features: ["pbr", "shadows", "postprocess", "cpu-particles", "instancing", "lod", "culling", "animation", "gamepad"],
    allowedFallbacks: []
  },
  "desktop-high": {
    method: "webgpu",
    features: ["pbr", "shadows", "postprocess", "cpu-particles", "gpu-particles", "instancing", "lod", "culling", "animation", "gamepad", "gpu-timestamps"],
    allowedFallbacks: ["desktop-compatible"]
  }
};

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

function failure(
  code: "RENDER_PROFILE_UNDECLARED" | "RENDER_PROFILE_UNSUPPORTED" | "RENDER_FEATURE_REQUIRED_UNAVAILABLE",
  message: string
): RendererFailure {
  return new RendererFailure(code, message, "renderer-three:profile");
}

function backendAvailable(method: RendererMethod, backends: RendererBackendAvailability): boolean {
  return method === "webgl2" ? backends.webgl2 : backends.webgpu;
}

/** Resolves declared graphics intent before renderer construction. A fallback is
 * selected only from the manifest's explicit list and only if every required
 * feature is still available. */
export function selectRendererProfile(
  request: RendererProfileRequest,
  backends: RendererBackendAvailability
): RendererProfileSelection {
  const requested = rules[request.profile];
  if (requested === undefined) throw failure("RENDER_PROFILE_UNDECLARED", "requested graphics profile is unknown");
  const fallbacks = unique(request.fallbackProfiles);
  if (fallbacks.some((profile) => !requested.allowedFallbacks.includes(profile))) {
    throw failure("RENDER_PROFILE_UNDECLARED", `profile ${request.profile} does not declare the requested fallback`);
  }
  const requiredFeatures = unique(request.requiredFeatures);
  const optionalFeatures = unique(request.optionalFeatures).filter((feature) => !requiredFeatures.includes(feature));
  const candidates = [request.profile, ...fallbacks];
  let sawFeatureCompatibleCandidate = false;
  for (const profile of candidates) {
    const rule = rules[profile];
    if (rule === undefined) throw failure("RENDER_PROFILE_UNDECLARED", `fallback profile ${profile} is unknown`);
    const missingRequired = requiredFeatures.filter((feature) => !rule.features.includes(feature));
    if (missingRequired.length > 0) continue;
    sawFeatureCompatibleCandidate = true;
    if (!backendAvailable(rule.method, backends)) continue;
    return {
      requestedProfile: request.profile,
      effectiveProfile: profile,
      requestedMethod: requested.method,
      effectiveMethod: rule.method,
      adapter: backends.adapter,
      requiredFeatures,
      optionalFeatures,
      unavailableOptionalFeatures: optionalFeatures.filter((feature) => !rule.features.includes(feature)),
      ...(profile === request.profile
        ? {}
        : { fallbackReason: `${requested.method} is unavailable; selected declared ${profile}/${rule.method}` })
    };
  }
  if (!sawFeatureCompatibleCandidate) {
    throw failure("RENDER_FEATURE_REQUIRED_UNAVAILABLE", "no declared profile supplies every required graphics feature");
  }
  throw failure("RENDER_PROFILE_UNSUPPORTED", "no feature-compatible declared renderer backend is available");
}
