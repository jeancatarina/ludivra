import { createHash } from "node:crypto";
import { analyze, inspect, type AudioAnalysis, type AudioAnalysisIssue } from "./analysis.js";
import { clamp, decibelsToGain } from "./deterministic-math.js";
import {
  applyDelay,
  applyDistortion,
  applyFilter,
  applyRingModulator,
  removeDirectCurrent,
  renderNoise,
  renderOscillator,
  renderResonator
} from "./nodes.js";
import type { AudioRecipe } from "./recipe.js";
import { writeWav } from "./wav.js";

/**
 * Version of the synthesis itself. It enters the cache key, so improving a node
 * regenerates every sound instead of leaving stale audio behind.
 *
 * 2: master gained a DC blocker after a real recipe rendered with 0.22 of offset.
 */
export const AUDIO_GENERATOR_VERSION = 2;

export interface RenderedAudio {
  wav: Uint8Array;
  sha256: string;
  analysis: AudioAnalysis;
  issues: AudioAnalysisIssue[];
}

function canonicalRecipe(recipe: AudioRecipe): string {
  const order = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(order);
    if (value !== null && typeof value === "object") {
      const source = value as Record<string, unknown>;
      const target: Record<string, unknown> = {};
      for (const key of Object.keys(source).sort()) target[key] = order(source[key]);
      return target;
    }
    return value;
  };
  return JSON.stringify(order(recipe));
}

/**
 * Cache identity of a rendered sound: the recipe, the generator version and the
 * seed. Nothing else may enter it, or the same recipe would render twice.
 */
export function audioCacheKey(recipe: AudioRecipe): string {
  return createHash("sha256")
    .update(`${AUDIO_GENERATOR_VERSION}\0${recipe.seed}\0${canonicalRecipe(recipe)}`)
    .digest("hex");
}

function renderLayers(recipe: AudioRecipe, totalSamples: number): Float64Array {
  const mix = new Float64Array(totalSamples);
  const sampleRate = recipe.render.sampleRate;

  for (const [instance, layer] of recipe.layers.entries()) {
    const startSample = Math.min(
      Math.round(((layer.startMs ?? 0) * sampleRate) / 1000),
      totalSamples
    );
    const layerSamples = totalSamples - startSample;
    if (layerSamples <= 0) continue;

    let rendered: Float64Array;
    if (layer.type === "oscillator") rendered = renderOscillator(layer, sampleRate, layerSamples);
    else if (layer.type === "noise") rendered = renderNoise(layer, sampleRate, layerSamples, recipe.seed, instance);
    else rendered = renderResonator(layer, sampleRate, layerSamples);

    if (layer.type !== "resonator" && layer.filter !== undefined) {
      applyFilter(rendered, layer.filter, sampleRate);
    }
    for (let index = 0; index < layerSamples; index += 1) {
      const target = startSample + index;
      mix[target] = (mix[target] ?? 0) + (rendered[index] ?? 0);
    }
  }
  return mix;
}

function applyEffects(recipe: AudioRecipe, samples: Float64Array): void {
  for (const effect of recipe.effects ?? []) {
    if (effect.type === "distortion") applyDistortion(samples, effect.amount);
    else if (effect.type === "delay") {
      const delaySamples = Math.max(1, Math.round((effect.delayMs * recipe.render.sampleRate) / 1000));
      applyDelay(samples, delaySamples, effect.feedback, effect.mix);
    } else applyRingModulator(samples, effect.frequency, recipe.render.sampleRate, effect.mix ?? 1);
  }
}

function applyMaster(recipe: AudioRecipe, samples: Float64Array): void {
  const sampleRate = recipe.render.sampleRate;
  removeDirectCurrent(samples);
  const fadeIn = Math.min(Math.round(((recipe.master?.fadeInMs ?? 0) * sampleRate) / 1000), samples.length);
  const fadeOut = Math.min(Math.round(((recipe.master?.fadeOutMs ?? 8) * sampleRate) / 1000), samples.length);

  for (let index = 0; index < fadeIn; index += 1) {
    samples[index] = (samples[index] ?? 0) * (index / fadeIn);
  }
  for (let index = 0; index < fadeOut; index += 1) {
    const target = samples.length - 1 - index;
    samples[target] = (samples[target] ?? 0) * (index / fadeOut);
  }

  // Normalize to the declared ceiling instead of trusting layer gains to sum well.
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  if (peak === 0) return;
  const ceiling = decibelsToGain(recipe.master?.peakDb ?? -1);
  const scale = ceiling / peak;
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = clamp((samples[index] ?? 0) * scale, -1, 1);
  }
}

/**
 * Renders a validated recipe into canonical PCM plus the evidence an agent reads
 * back. The recipe must already have passed `schemas/audio-recipe.schema.json`:
 * this function trusts the shape and owns only the synthesis.
 */
export function renderAudioRecipe(recipe: AudioRecipe): RenderedAudio {
  const sampleRate = recipe.render.sampleRate;
  const totalSamples = Math.max(1, Math.round((recipe.render.durationMs * sampleRate) / 1000));
  const mix = renderLayers(recipe, totalSamples);
  applyEffects(recipe, mix);
  applyMaster(recipe, mix);

  const channels: Float64Array[] = [];
  for (let channel = 0; channel < recipe.render.channels; channel += 1) channels.push(mix);
  const wav = writeWav(channels, sampleRate);
  const analysis = analyze(channels, sampleRate, recipe.loop?.enabled === true);
  return {
    wav,
    sha256: createHash("sha256").update(wav).digest("hex"),
    analysis,
    issues: inspect(analysis)
  };
}
