/**
 * Deterministic math for audio rendering.
 *
 * IEEE-754 fixes the result of `+`, `-`, `*`, `/` and `sqrt` exactly, so those are
 * portable. `Math.sin`, `Math.exp` and `Math.pow` are only *approximated* by the
 * specification and may differ between engines, platforms and versions — which
 * would break the byte-identical guarantee the Audio Forge promises. Everything
 * below is built from the exact operations only.
 */

const TWO_PI = 6.283185307179586;
const LN2 = 0.6931471805599453;

/**
 * Sine of a phase expressed in turns. Reduced to the first quarter by symmetry and
 * evaluated with a Taylor series in Horner form up to y^17. Thirteen terms were not
 * enough: the residual at pi/2 is around 5e-10, which a tolerance test caught.
 */
export function sineTurns(turns: number): number {
  let phase = turns - Math.floor(turns);
  let sign = 1;
  if (phase >= 0.5) {
    phase -= 0.5;
    sign = -1;
  }
  if (phase > 0.25) phase = 0.5 - phase;
  const y = phase * TWO_PI;
  const y2 = y * y;
  const series =
    1 -
    (y2 / 6) *
      (1 -
        (y2 / 20) *
          (1 - (y2 / 42) * (1 - (y2 / 72) * (1 - (y2 / 110) * (1 - (y2 / 156) * (1 - (y2 / 210) * (1 - y2 / 272)))))));
  return sign * y * series;
}

export function cosineTurns(turns: number): number {
  return sineTurns(turns + 0.25);
}

/** Exact for |exponent| below 1000: multiplying by 2 or 0.5 never rounds. */
function powerOfTwo(exponent: number): number {
  const step = exponent >= 0 ? 2 : 0.5;
  const count = Math.abs(exponent);
  let result = 1;
  for (let index = 0; index < count; index += 1) result *= step;
  return result;
}

/** 2^x, split into an exact integer part and a series for the fraction. */
export function exp2(x: number): number {
  const whole = Math.floor(x);
  const fraction = x - whole;
  const y = fraction * LN2;
  let term = 1;
  let sum = 1;
  for (let index = 1; index <= 14; index += 1) {
    term = (term * y) / index;
    sum += term;
  }
  return sum * powerOfTwo(whole);
}

/**
 * log2 for positive values. The exponent comes from exact halving or doubling and
 * the mantissa from the atanh series, which converges quickly on [1, 2).
 */
export function log2(value: number): number {
  if (!(value > 0)) throw new Error("AUDIO_MATH_DOMAIN: log2 requires a positive value");
  let mantissa = value;
  let exponent = 0;
  while (mantissa >= 2) {
    mantissa *= 0.5;
    exponent += 1;
  }
  while (mantissa < 1) {
    mantissa *= 2;
    exponent -= 1;
  }
  const z = (mantissa - 1) / (mantissa + 1);
  const z2 = z * z;
  let power = z;
  let sum = 0;
  for (let index = 0; index < 20; index += 1) {
    sum += power / (2 * index + 1);
    power *= z2;
  }
  return exponent + (2 * sum) / LN2;
}

/** base^exponent for positive bases, composed from the deterministic pair above. */
export function power(base: number, exponent: number): number {
  if (base === 0) return exponent === 0 ? 1 : 0;
  return exp2(exponent * log2(base));
}

export function decibelsToGain(decibels: number): number {
  return power(10, decibels / 20);
}

export function gainToDecibels(gain: number): number {
  return gain <= 0 ? -Infinity : 20 * (log2(gain) * (LN2 / 2.302585092994046));
}

/** Tangent used by the biquad coefficients, from the deterministic sine pair. */
export function tangentTurns(turns: number): number {
  const cosine = cosineTurns(turns);
  if (cosine === 0) throw new Error("AUDIO_MATH_DOMAIN: tangent is undefined at this phase");
  return sineTurns(turns) / cosine;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  if (value < minimum) return minimum;
  if (value > maximum) return maximum;
  return value;
}

/** Round half away from zero, the rule declared by ADR 0018. */
export function roundHalfAwayFromZero(value: number): number {
  return value >= 0 ? Math.floor(value + 0.5) : -Math.floor(-value + 0.5);
}
