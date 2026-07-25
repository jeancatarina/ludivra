import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createStream } from "../../audio-authoring/dist/random.js";

/**
 * Cross-language golden vectors for ADR 0018. The kernel derives streams in C++ and
 * the authoring tools derive them in TypeScript; two independent implementations
 * agreeing bit for bit on the same fixture is what makes the sequence trustworthy.
 */
const root = resolve(import.meta.dirname, "../..");
const golden = JSON.parse(readFileSync(resolve(root, "tests/fixtures/rng-golden.json"), "utf8"));
assert.equal(golden.schemaVersion, 1);

for (const stream of golden.streams) {
  const produced = createStream(golden.rootSeed, stream.domain, stream.instance);
  const draws = stream.draws.map(() => produced.nextU64().toString(16).padStart(16, "0"));
  assert.deepEqual(
    draws,
    stream.draws,
    `TypeScript and the kernel disagree on ${stream.domain}#${stream.instance}`
  );
}

// Domain separation: a new domain must not shift an existing sequence.
const first = createStream(golden.rootSeed, "world.generation", 0);
const other = createStream(golden.rootSeed, "combat.damage", 0);
assert.notEqual(first.nextU64(), other.nextU64());

process.stdout.write(`rng_golden=${golden.streams.length} streams\n`);
