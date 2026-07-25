/**
 * PRNG streams for audio authoring, following ADR 0018: SplitMix64 derives the
 * state and xoshiro256++ produces the sequence. Domain separation means adding a
 * layer never shifts the numbers of another layer, so a recipe edit changes only
 * what it touched.
 *
 * BigInt keeps the arithmetic exact; a render is authoring work, not a hot frame.
 */
const MASK64 = (1n << 64n) - 1n;
const GOLDEN = 0x9e3779b97f4a7c15n;

function splitMix64(state: bigint): { value: bigint; next: bigint } {
  const next = (state + GOLDEN) & MASK64;
  let value = next;
  value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
  value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & MASK64;
  value = value ^ (value >> 31n);
  return { value, next };
}

function rotateLeft(value: bigint, count: bigint): bigint {
  return ((value << count) | (value >> (64n - count))) & MASK64;
}

/** Hashes a domain name into the derivation input, so domains are named, not numbered. */
function domainHash(domain: string): bigint {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < domain.length; index += 1) {
    hash = (hash ^ BigInt(domain.charCodeAt(index))) & MASK64;
    hash = (hash * 0x100000001b3n) & MASK64;
  }
  return hash;
}

export interface RandomStream {
  /** Raw 64-bit draw. Exposed so the golden vectors can compare this
   *  implementation against the kernel one bit for bit. */
  nextU64(): bigint;
  /** Next value in [0, 1). */
  unit(): number;
  /** Next value in [-1, 1). */
  bipolar(): number;
}

export function createStream(rootSeed: number | bigint, domain: string, instance = 0): RandomStream {
  let seed = (BigInt(rootSeed) ^ domainHash(domain) ^ (BigInt(instance) * GOLDEN)) & MASK64;
  const state: bigint[] = [];
  for (let index = 0; index < 4; index += 1) {
    const derived = splitMix64(seed);
    seed = derived.next;
    state.push(derived.value);
  }

  const nextUint64 = (): bigint => {
    const [s0, s1, s2, s3] = state as [bigint, bigint, bigint, bigint];
    const result = (rotateLeft((s0 + s3) & MASK64, 23n) + s0) & MASK64;
    const t = (s1 << 17n) & MASK64;
    state[2] = s2 ^ s0;
    state[3] = s3 ^ s1;
    state[1] = s1 ^ (state[2] as bigint);
    state[0] = s0 ^ (state[3] as bigint);
    state[2] = (state[2] as bigint) ^ t;
    state[3] = rotateLeft(state[3] as bigint, 45n);
    return result;
  };

  return {
    nextU64: nextUint64,
    unit() {
      // 53 significant bits keep the conversion exact in double precision.
      return Number(nextUint64() >> 11n) / 9007199254740992;
    },
    bipolar() {
      return this.unit() * 2 - 1;
    }
  };
}
