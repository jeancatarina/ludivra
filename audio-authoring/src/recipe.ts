/**
 * Types mirroring `schemas/audio-recipe.schema.json`. The schema is the contract
 * and the validator, exactly like `game.jsonc`: these declarations exist so the
 * compiler is typed, and a recipe is always validated against the schema before
 * reaching the compiler.
 */
export type FrequencyCurve = "linear" | "exponential";

export type FrequencySpec = number | { from: number; to: number; curve?: FrequencyCurve };

export interface EnvelopeSpec {
  attackMs: number;
  decayMs: number;
  sustain: number;
  releaseMs: number;
  curve?: FrequencyCurve;
}

export interface FilterSpec {
  type: "lowpass" | "highpass" | "bandpass";
  frequency: number;
  resonance?: number;
}

export interface OscillatorLayer {
  type: "oscillator";
  waveform: "sine" | "triangle" | "square" | "pulse" | "sawtooth";
  pulseWidth?: number;
  frequency: FrequencySpec;
  gain: number;
  envelope: EnvelopeSpec;
  filter?: FilterSpec;
  startMs?: number;
}

export interface NoiseLayer {
  type: "noise";
  noise: "white" | "pink" | "brown" | "metallic" | "sample-and-hold";
  holdSamples?: number;
  gain: number;
  envelope: EnvelopeSpec;
  filter?: FilterSpec;
  startMs?: number;
}

export interface ResonatorLayer {
  type: "resonator";
  frequencies: number[];
  decayMs: number;
  gain: number;
  startMs?: number;
}

export type AudioLayer = OscillatorLayer | NoiseLayer | ResonatorLayer;

export type AudioEffect =
  | { type: "distortion"; amount: number }
  | { type: "delay"; delayMs: number; feedback: number; mix: number }
  | { type: "ring-modulator"; frequency: number; mix?: number };

export interface AudioRecipe {
  schemaVersion: 1;
  id: string;
  kind: "sfx" | "ambience" | "ui";
  seed: number;
  render: { sampleRate: number; channels: number; durationMs: number };
  layers: AudioLayer[];
  effects?: AudioEffect[];
  master?: { fadeInMs?: number; fadeOutMs?: number; peakDb?: number };
  loop?: { enabled: boolean; crossfadeMs?: number };
}
