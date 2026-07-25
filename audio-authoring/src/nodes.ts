import {
  clamp,
  cosineTurns,
  power,
  sineTurns,
  tangentTurns
} from "./deterministic-math.js";
import { createStream, type RandomStream } from "./random.js";
import type {
  EnvelopeSpec,
  FilterSpec,
  FrequencySpec,
  NoiseLayer,
  OscillatorLayer,
  ResonatorLayer
} from "./recipe.js";

/** Floor reached by an exponential curve, equivalent to -60 dB. */
const EXPONENTIAL_FLOOR = 0.001;

function shape(progress: number, curve: "linear" | "exponential"): number {
  if (curve === "linear") return progress;
  // Normalized exponential fall from 1 to 0 over the segment.
  return (power(EXPONENTIAL_FLOOR, progress) - EXPONENTIAL_FLOOR) / (1 - EXPONENTIAL_FLOOR);
}

/**
 * ADSR over a fixed duration: attack, decay to sustain, hold, then release that
 * always ends at silence. A release longer than what is left is clamped, so a
 * recipe cannot produce a click by declaring impossible timings.
 */
export function renderEnvelope(envelope: EnvelopeSpec, sampleRate: number, totalSamples: number): Float64Array {
  const curve = envelope.curve ?? "exponential";
  const attack = Math.min(Math.round((envelope.attackMs * sampleRate) / 1000), totalSamples);
  const decay = Math.min(Math.round((envelope.decayMs * sampleRate) / 1000), totalSamples - attack);
  const release = Math.min(Math.round((envelope.releaseMs * sampleRate) / 1000), totalSamples - attack - decay);
  const sustainSamples = totalSamples - attack - decay - release;
  const values = new Float64Array(totalSamples);

  let index = 0;
  for (let step = 0; step < attack; step += 1, index += 1) {
    values[index] = attack === 0 ? 1 : step / attack;
  }
  for (let step = 0; step < decay; step += 1, index += 1) {
    const fall = 1 - shape(step / decay, curve);
    values[index] = envelope.sustain + (1 - envelope.sustain) * fall;
  }
  for (let step = 0; step < sustainSamples; step += 1, index += 1) {
    values[index] = envelope.sustain;
  }
  for (let step = 0; step < release; step += 1, index += 1) {
    const fall = 1 - shape(step / release, curve);
    values[index] = envelope.sustain * fall;
  }
  return values;
}

function frequencyAt(spec: FrequencySpec, progress: number): number {
  if (typeof spec === "number") return spec;
  const curve = spec.curve ?? "linear";
  if (curve === "linear") return spec.from + (spec.to - spec.from) * progress;
  return spec.from * power(spec.to / spec.from, progress);
}

function waveform(kind: OscillatorLayer["waveform"], phase: number, pulseWidth: number): number {
  const cycle = phase - Math.floor(phase);
  switch (kind) {
    case "sine":
      return sineTurns(cycle);
    case "triangle":
      return cycle < 0.5 ? -1 + 4 * cycle : 3 - 4 * cycle;
    case "square":
      return cycle < 0.5 ? 1 : -1;
    case "pulse":
      return cycle < pulseWidth ? 1 : -1;
    case "sawtooth":
      return 2 * cycle - 1;
  }
}

export function renderOscillator(layer: OscillatorLayer, sampleRate: number, totalSamples: number): Float64Array {
  const envelope = renderEnvelope(layer.envelope, sampleRate, totalSamples);
  const output = new Float64Array(totalSamples);
  const pulseWidth = layer.pulseWidth ?? 0.5;
  let phase = 0;
  for (let index = 0; index < totalSamples; index += 1) {
    const progress = totalSamples === 1 ? 0 : index / (totalSamples - 1);
    const frequency = frequencyAt(layer.frequency, progress);
    output[index] = waveform(layer.waveform, phase, pulseWidth) * (envelope[index] ?? 0) * layer.gain;
    phase += frequency / sampleRate;
  }
  return output;
}

function noiseSample(kind: NoiseLayer["noise"], stream: RandomStream, state: number[], index: number, hold: number): number {
  const white = stream.bipolar();
  switch (kind) {
    case "white":
      return white;
    case "pink": {
      // Three one-pole filters summed, the usual cheap approximation of 1/f.
      state[0] = 0.99765 * (state[0] ?? 0) + white * 0.099046;
      state[1] = 0.963 * (state[1] ?? 0) + white * 0.2965164;
      state[2] = 0.57 * (state[2] ?? 0) + white * 1.0526913;
      return ((state[0] ?? 0) + (state[1] ?? 0) + (state[2] ?? 0) + white * 0.1848) * 0.25;
    }
    case "brown": {
      // Leaky integration: a pure integrator accumulates DC offset, which wastes
      // headroom and shows up as a constant push in the analysis.
      const next = clamp((state[0] ?? 0) * 0.995 + white * 0.035, -1, 1);
      state[0] = next;
      return next * 2.2;
    }
    case "metallic": {
      // Inharmonic partials give the ringing character without a sample.
      state[0] = (state[0] ?? 0) + 0.0713;
      state[1] = (state[1] ?? 0) + 0.1237;
      state[2] = (state[2] ?? 0) + 0.1907;
      return (
        (sineTurns(state[0] ?? 0) + sineTurns(state[1] ?? 0) + sineTurns(state[2] ?? 0)) * 0.28 +
        white * 0.16
      );
    }
    case "sample-and-hold": {
      if (index % hold === 0) state[0] = white;
      return state[0] ?? 0;
    }
  }
}

export function renderNoise(layer: NoiseLayer, sampleRate: number, totalSamples: number, seed: number, instance: number): Float64Array {
  const stream = createStream(seed, `audio.noise.${layer.noise}`, instance);
  const envelope = renderEnvelope(layer.envelope, sampleRate, totalSamples);
  const output = new Float64Array(totalSamples);
  const state = [0, 0, 0];
  const hold = layer.holdSamples ?? 64;
  for (let index = 0; index < totalSamples; index += 1) {
    output[index] = noiseSample(layer.noise, stream, state, index, hold) * (envelope[index] ?? 0) * layer.gain;
  }
  return output;
}

/**
 * Bank of decaying sine partials excited at the start. It is what gives bone,
 * wood and metal their body without shipping a sample.
 */
export function renderResonator(layer: ResonatorLayer, sampleRate: number, totalSamples: number): Float64Array {
  const output = new Float64Array(totalSamples);
  const decaySamples = Math.max(1, Math.round((layer.decayMs * sampleRate) / 1000));
  const perPartial = layer.gain / layer.frequencies.length;
  for (const frequency of layer.frequencies) {
    let phase = 0;
    for (let index = 0; index < totalSamples; index += 1) {
      const progress = index / decaySamples;
      const amplitude = progress >= 1 ? 0 : power(EXPONENTIAL_FLOOR, progress);
      output[index] = (output[index] ?? 0) + sineTurns(phase) * amplitude * perPartial;
      phase += frequency / sampleRate;
    }
  }
  return output;
}

/** Biquad from the RBJ cookbook, evaluated with the deterministic trigonometry. */
export function applyFilter(samples: Float64Array, filter: FilterSpec, sampleRate: number): void {
  const resonance = filter.resonance ?? 0.7071;
  const turns = clamp(filter.frequency / sampleRate, 0.000001, 0.499);
  const omegaSine = sineTurns(turns);
  const omegaCosine = cosineTurns(turns);
  const alpha = omegaSine / (2 * resonance);

  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  if (filter.type === "lowpass") {
    b0 = (1 - omegaCosine) / 2;
    b1 = 1 - omegaCosine;
    b2 = b0;
  } else if (filter.type === "highpass") {
    b0 = (1 + omegaCosine) / 2;
    b1 = -(1 + omegaCosine);
    b2 = b0;
  } else {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * omegaCosine;
  const a2 = 1 - alpha;

  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const x0 = samples[index] ?? 0;
    const y0 = (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    samples[index] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
}

/** Soft clip without transcendentals: a rational curve that stays inside [-1, 1]. */
export function applyDistortion(samples: Float64Array, amount: number): void {
  const drive = 1 + amount * 24;
  for (let index = 0; index < samples.length; index += 1) {
    const value = (samples[index] ?? 0) * drive;
    samples[index] = value / (1 + Math.abs(value));
  }
}

export function applyDelay(samples: Float64Array, delaySamples: number, feedback: number, mix: number): void {
  const buffer = new Float64Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const source = index - delaySamples;
    const delayed = source >= 0 ? (buffer[source] ?? 0) : 0;
    const value = (samples[index] ?? 0) + delayed * feedback;
    buffer[index] = value;
    samples[index] = (samples[index] ?? 0) * (1 - mix) + delayed * mix;
  }
}

export function applyRingModulator(samples: Float64Array, frequency: number, sampleRate: number, mix: number): void {
  let phase = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const modulated = (samples[index] ?? 0) * sineTurns(phase);
    samples[index] = (samples[index] ?? 0) * (1 - mix) + modulated * mix;
    phase += frequency / sampleRate;
  }
}

export { tangentTurns };
