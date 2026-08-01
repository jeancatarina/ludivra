export type GpuTimingStatus = "unavailable" | "warming" | "within-budget" | "over-budget";

export interface GpuTimingMetrics {
  available: boolean;
  latestMs: number | null;
  sampleCount: number;
  medianMs: number | null;
  p95Ms: number | null;
  budgetMs: number;
  status: GpuTimingStatus;
}

export interface GpuTimingSampler {
  record(milliseconds: number): GpuTimingMetrics;
  snapshot(): GpuTimingMetrics;
}

const SAMPLE_CAPACITY = 120;
const MINIMUM_SAMPLES = 30;
export const DESKTOP_HIGH_GPU_P95_BUDGET_MS = 16.67;

function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? 0;
}

/** Keeps bounded, GPU-derived timings separate from wall-clock frame time. */
export function createGpuTimingSampler(
  available: boolean,
  budgetMs = DESKTOP_HIGH_GPU_P95_BUDGET_MS
): GpuTimingSampler {
  const samples: number[] = [];
  let latestMs: number | null = null;

  function snapshot(): GpuTimingMetrics {
    if (!available) {
      return {
        available: false,
        latestMs: null,
        sampleCount: 0,
        medianMs: null,
        p95Ms: null,
        budgetMs,
        status: "unavailable"
      };
    }
    if (samples.length === 0) {
      return {
        available: true,
        latestMs,
        sampleCount: 0,
        medianMs: null,
        p95Ms: null,
        budgetMs,
        status: "warming"
      };
    }
    const sorted = [...samples].sort((left, right) => left - right);
    const medianMs = percentile(sorted, 0.5);
    const p95Ms = percentile(sorted, 0.95);
    return {
      available: true,
      latestMs,
      sampleCount: samples.length,
      medianMs,
      p95Ms,
      budgetMs,
      status: samples.length < MINIMUM_SAMPLES ? "warming" : p95Ms <= budgetMs ? "within-budget" : "over-budget"
    };
  }

  return {
    record(milliseconds) {
      // Three.js reports zero until an asynchronous timestamp resolve has a
      // result. A real GPU interval cannot be zero at this precision.
      if (!available || !Number.isFinite(milliseconds) || milliseconds <= 0) return snapshot();
      latestMs = milliseconds;
      samples.push(milliseconds);
      if (samples.length > SAMPLE_CAPACITY) samples.shift();
      return snapshot();
    },
    snapshot
  };
}
