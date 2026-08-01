import assert from "node:assert/strict";
import test from "node:test";
import {
  RendererFailure,
  rendererFailure,
  reportShaderFailure
} from "../dist/diagnostics.js";
import { selectRendererProfile } from "../dist/profiles.js";
import { createGpuTimingSampler } from "../dist/gpu-timing.js";

test("renderer failures preserve their stable renderer code and source", () => {
  const original = new RendererFailure("RENDER_FRAME_FAILED", "frame unavailable", "renderer-three:frame");
  assert.equal(rendererFailure("RENDER_OPERATION_FAILED", "renderer-three:operation", original), original);

  const wrapped = rendererFailure("RENDER_RESIZE_FAILED", "renderer-three:resize", new Error("canvas unavailable"));
  assert.equal(wrapped.code, "RENDER_RESIZE_FAILED");
  assert.equal(wrapped.source, "renderer-three:resize");
  assert.equal(wrapped.message, "canvas unavailable");
});

test("shader failures report compiler logs through the structured renderer channel", () => {
  const reported = [];
  const vertex = {};
  const fragment = {};
  const program = {};
  const gl = {
    getShaderInfoLog(shader) {
      return shader === vertex ? "vertex compile failed" : "fragment compile failed";
    },
    getProgramInfoLog() {
      return "program link failed";
    }
  };

  reportShaderFailure(
    (code, message, source) => reported.push({ code, message, source }),
    gl,
    program,
    vertex,
    fragment
  );

  assert.deepEqual(reported, [{
    code: "SHADER_COMPILE_FAILED",
    message: "vertex: vertex compile failed | fragment: fragment compile failed | program: program link failed",
    source: "renderer-three:shader"
  }]);
});

test("desktop-high falls back only when declared and preserves required-feature checks", () => {
  const fallback = selectRendererProfile({
    profile: "desktop-high",
    requiredFeatures: ["pbr", "shadows", "instancing"],
    optionalFeatures: ["gpu-particles"],
    fallbackProfiles: ["desktop-compatible"]
  }, { webgl2: true, webgpu: false, adapter: "WebGL2 test adapter" });
  assert.equal(fallback.effectiveProfile, "desktop-compatible");
  assert.equal(fallback.effectiveMethod, "webgl2");
  assert.match(fallback.fallbackReason, /webgpu is unavailable/);
  assert.deepEqual(fallback.unavailableOptionalFeatures, ["gpu-particles"]);

  assert.throws(() => selectRendererProfile({
    profile: "desktop-high",
    requiredFeatures: ["gpu-particles"],
    optionalFeatures: [],
    fallbackProfiles: ["desktop-compatible"]
  }, { webgl2: true, webgpu: false, adapter: null }), { code: "RENDER_PROFILE_UNSUPPORTED" });

  assert.throws(() => selectRendererProfile({
    profile: "desktop-compatible",
    requiredFeatures: ["gpu-particles"],
    optionalFeatures: [],
    fallbackProfiles: []
  }, { webgl2: true, webgpu: false, adapter: null }), { code: "RENDER_FEATURE_REQUIRED_UNAVAILABLE" });
});

test("GPU timing benchmark is bounded, ignores unresolved samples and reports its budget", () => {
  const unavailable = createGpuTimingSampler(false).record(12);
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.sampleCount, 0);

  const sampler = createGpuTimingSampler(true, 10);
  assert.equal(sampler.record(0).status, "warming");
  for (let index = 0; index < 120; index += 1) sampler.record(index < 113 ? 8 : 14);
  const metrics = sampler.snapshot();
  assert.equal(metrics.sampleCount, 120);
  assert.equal(metrics.medianMs, 8);
  assert.equal(metrics.p95Ms, 14);
  assert.equal(metrics.status, "over-budget");

  for (let index = 0; index < 120; index += 1) sampler.record(6);
  assert.equal(sampler.snapshot().sampleCount, 120);
  assert.equal(sampler.snapshot().status, "within-budget");
});
