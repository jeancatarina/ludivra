import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { analyze, audioCacheKey, createStream, inspect, renderAudioRecipe } from "../dist/index.js";
import { cosineTurns, exp2, log2, power, sineTurns } from "../dist/deterministic-math.js";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function impact(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "audio.goblin.staff-impact",
    kind: "sfx",
    seed: 48192,
    render: { sampleRate: 48000, channels: 1, durationMs: 320 },
    layers: [
      {
        type: "noise",
        noise: "brown",
        gain: 0.5,
        envelope: { attackMs: 1, decayMs: 180, sustain: 0, releaseMs: 0 },
        filter: { type: "lowpass", frequency: 850, resonance: 0.8 }
      },
      {
        type: "oscillator",
        waveform: "triangle",
        frequency: { from: 420, to: 110, curve: "exponential" },
        gain: 0.35,
        envelope: { attackMs: 1, decayMs: 300, sustain: 0, releaseMs: 0 }
      },
      { type: "resonator", frequencies: [327, 693, 1172], decayMs: 260, gain: 0.2 }
    ],
    effects: [{ type: "distortion", amount: 0.12 }],
    master: { fadeOutMs: 30, peakDb: -1 },
    ...overrides
  };
}

test("deterministic math matches the standard library within audio precision", () => {
  for (const turns of [0, 0.05, 0.125, 0.25, 0.4, 0.5, 0.75, 0.99, 3.33, -1.2]) {
    assert.ok(Math.abs(sineTurns(turns) - Math.sin(turns * 2 * Math.PI)) < 1e-12, `sin at ${turns}`);
    assert.ok(Math.abs(cosineTurns(turns) - Math.cos(turns * 2 * Math.PI)) < 1e-12, `cos at ${turns}`);
  }
  for (const value of [0.001, 0.5, 1, 2, 7.25, 1000]) {
    assert.ok(Math.abs(log2(value) - Math.log2(value)) < 1e-12, `log2 of ${value}`);
  }
  for (const value of [-8.5, -1, 0, 0.25, 3.75, 10]) {
    assert.ok(Math.abs(exp2(value) - Math.pow(2, value)) / Math.pow(2, value) < 1e-12, `exp2 of ${value}`);
  }
  assert.ok(Math.abs(power(0.001, 0.5) - Math.pow(0.001, 0.5)) < 1e-12);
  // The renderer must not depend on Math.sin, whose precision is implementation defined.
  const source = readFileSync(resolve(root, "audio-authoring/src/nodes.ts"), "utf8");
  assert.ok(!/Math\.(sin|cos|exp|pow|log|tan)\b/.test(source), "nodes must use deterministic math only");
});

test("a recipe renders identical bytes on every run", () => {
  const first = renderAudioRecipe(impact());
  const second = renderAudioRecipe(impact());
  assert.equal(first.sha256, second.sha256);
  assert.deepEqual(Buffer.from(first.wav), Buffer.from(second.wav));
  assert.equal(audioCacheKey(impact()), audioCacheKey(impact()));

  // Key order in the document must not change the identity of the render.
  const reordered = { ...impact() };
  const rebuilt = Object.fromEntries(Object.entries(reordered).reverse());
  assert.equal(audioCacheKey(rebuilt), audioCacheKey(impact()));
});

test("seed and generator inputs change the render", () => {
  const base = renderAudioRecipe(impact());
  const varied = renderAudioRecipe(impact({ seed: 48193 }));
  assert.notEqual(base.sha256, varied.sha256, "a new seed must produce a variation");
  assert.equal(base.analysis.durationMs, varied.analysis.durationMs);
});

test("the render honours the declared header, duration and ceiling", () => {
  const rendered = renderAudioRecipe(impact());
  const header = Buffer.from(rendered.wav.subarray(0, 44));
  assert.equal(header.toString("ascii", 0, 4), "RIFF");
  assert.equal(header.toString("ascii", 8, 12), "WAVE");
  assert.equal(header.readUInt16LE(22), 1, "channels");
  assert.equal(header.readUInt32LE(24), 48000, "sample rate");
  assert.equal(header.readUInt16LE(34), 16, "bit depth");
  assert.equal(rendered.wav.length, 44 + 48000 * 0.32 * 2);

  assert.equal(rendered.analysis.durationMs, 320);
  assert.equal(rendered.analysis.clippedSamples, 0);
  assert.ok(rendered.analysis.peakDb <= -0.9 && rendered.analysis.peakDb >= -1.1, `peak ${rendered.analysis.peakDb}`);
  assert.ok(rendered.analysis.silentRatio < 0.9, "the render must not be silent");
  assert.deepEqual(rendered.issues, []);
});

test("analysis reports clipping, silence, DC offset and loop discontinuity", () => {
  const clipping = new Float64Array([0, 1, -1, 1]);
  const clippingIssues = inspect(analyze([clipping], 48000, false));
  assert.ok(clippingIssues.some(({ code }) => code === "AUDIO_RENDER_CLIPPING"));

  const silence = new Float64Array(64);
  assert.ok(inspect(analyze([silence], 48000, false)).some(({ code }) => code === "AUDIO_RENDER_SILENT"));

  const offset = new Float64Array(64).fill(0.4);
  assert.ok(inspect(analyze([offset], 48000, false)).some(({ code }) => code === "AUDIO_RENDER_DC_OFFSET"));

  const jump = new Float64Array([0, 0.2, -0.2, 0.9]);
  assert.ok(inspect(analyze([jump], 48000, true)).some(({ code }) => code === "AUDIO_LOOP_DISCONTINUITY"));
});

test("the example recipe satisfies the published schema", () => {
  const schema = JSON.parse(readFileSync(resolve(root, "schemas/audio-recipe.schema.json"), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  assert.ok(validate(impact()), JSON.stringify(validate.errors));
  assert.equal(validate({ ...impact(), layers: [] }), false, "at least one layer is required");
  assert.equal(validate({ ...impact(), seed: -1 }), false, "seed must be a natural number");
});

test("random streams are separated by domain and reproducible", () => {
  const first = createStream(42, "audio.noise.white", 0);
  const second = createStream(42, "audio.noise.white", 0);
  const other = createStream(42, "audio.noise.white", 1);
  const sequence = [first.unit(), first.unit(), first.unit()];
  assert.deepEqual(sequence, [second.unit(), second.unit(), second.unit()]);
  assert.notDeepEqual(sequence, [other.unit(), other.unit(), other.unit()]);
  for (const value of sequence) assert.ok(value >= 0 && value < 1);
});
