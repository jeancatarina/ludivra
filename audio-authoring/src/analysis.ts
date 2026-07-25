import { gainToDecibels } from "./deterministic-math.js";

export interface AudioAnalysis {
  durationMs: number;
  sampleRate: number;
  channels: number;
  peak: number;
  peakDb: number;
  rmsDb: number;
  dcOffset: number;
  clippedSamples: number;
  silentRatio: number;
  loopDiscontinuity: number;
}

export interface AudioAnalysisIssue {
  code: string;
  message: string;
}

const SILENCE_THRESHOLD = 0.0005;

/**
 * Turns a rendered buffer into numbers an agent can act on. Clipping, silence, DC
 * offset and loop discontinuity are the failures that are invisible in a waveform
 * thumbnail and obvious in a value.
 */
export function analyze(channels: Float64Array[], sampleRate: number, loops: boolean): AudioAnalysis {
  const frames = channels[0]?.length ?? 0;
  let peak = 0;
  let squareSum = 0;
  let sum = 0;
  let clipped = 0;
  let silent = 0;
  let total = 0;

  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) {
      const value = channel[index] ?? 0;
      const magnitude = Math.abs(value);
      if (magnitude > peak) peak = magnitude;
      if (magnitude >= 1) clipped += 1;
      if (magnitude < SILENCE_THRESHOLD) silent += 1;
      squareSum += value * value;
      sum += value;
      total += 1;
    }
  }

  const rms = total === 0 ? 0 : Math.sqrt(squareSum / total);
  let discontinuity = 0;
  if (loops) {
    for (const channel of channels) {
      const first = channel[0] ?? 0;
      const last = channel[channel.length - 1] ?? 0;
      discontinuity = Math.max(discontinuity, Math.abs(last - first));
    }
  }

  return {
    durationMs: sampleRate === 0 ? 0 : Math.round((frames / sampleRate) * 1000),
    sampleRate,
    channels: channels.length,
    peak: Number(peak.toFixed(6)),
    peakDb: Number(gainToDecibels(peak).toFixed(2)),
    rmsDb: Number(gainToDecibels(rms).toFixed(2)),
    dcOffset: Number((total === 0 ? 0 : sum / total).toFixed(6)),
    clippedSamples: clipped,
    silentRatio: Number((total === 0 ? 1 : silent / total).toFixed(4)),
    loopDiscontinuity: Number(discontinuity.toFixed(6))
  };
}

/** Failures that must block promotion of a rendered sound. */
export function inspect(analysis: AudioAnalysis): AudioAnalysisIssue[] {
  const issues: AudioAnalysisIssue[] = [];
  if (analysis.clippedSamples > 0) {
    issues.push({
      code: "AUDIO_RENDER_CLIPPING",
      message: `${analysis.clippedSamples} samples reached full scale`
    });
  }
  if (analysis.silentRatio > 0.995) {
    issues.push({ code: "AUDIO_RENDER_SILENT", message: "the render is silent for its whole duration" });
  }
  if (Math.abs(analysis.dcOffset) > 0.02) {
    issues.push({
      code: "AUDIO_RENDER_DC_OFFSET",
      message: `DC offset of ${analysis.dcOffset} will waste headroom and stress speakers`
    });
  }
  if (analysis.loopDiscontinuity > 0.05) {
    issues.push({
      code: "AUDIO_LOOP_DISCONTINUITY",
      message: `loop endpoints differ by ${analysis.loopDiscontinuity}, which is audible as a click`
    });
  }
  return issues;
}
