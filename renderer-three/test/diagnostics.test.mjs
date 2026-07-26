import assert from "node:assert/strict";
import test from "node:test";
import {
  RendererFailure,
  rendererFailure,
  reportShaderFailure
} from "../dist/diagnostics.js";

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
