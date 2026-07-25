import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { LudivraRuntime } from "../../runtime-web/dist/index.js";
import createLudivraModule from "../../runtime-wasm/generated/ludivra-runtime.mjs";

const root = resolve(import.meta.dirname, "../..");
const native = spawnSync(resolve(root, "build/dev/tests/runtime/ludivra_runtime_tests"), [], {
  cwd: root,
  encoding: "utf8"
});
if (native.status !== 0) {
  throw new Error(`native runtime test failed: ${native.stderr}`);
}
const match = /wasm_equivalence_hash=([0-9a-f]{16})/.exec(native.stdout);
if (match?.[1] === undefined) {
  throw new Error("native runtime did not emit an equivalence hash");
}
const determinismMatch = /wasm_determinism_hash=([0-9a-f]{16})/.exec(native.stdout);
if (determinismMatch?.[1] === undefined) {
  throw new Error("native runtime did not emit a determinism hash");
}

const runtime = await LudivraRuntime.create(
  createLudivraModule,
  { tickRateHz: 60, maxPendingInputs: 4096, seed: 42n },
  { locateFile: (path) => resolve(root, "runtime-wasm/generated", path) }
);
try {
  runtime.loadGameplay(await readFile(resolve(root, "tests/fixtures/counter.lua"), "utf8"));
  runtime.submitInput({ actionId: 1, valueMilli: 1000, sequence: 1n });
  runtime.submitInput({ actionId: 2, valueMilli: 1000, sequence: 2n });
  runtime.step(1);
  const wasmHash = runtime.stateHash().toString(16).padStart(16, "0");
  if (wasmHash !== match[1]) {
    throw new Error(`native/WASM mismatch: native=${match[1]} wasm=${wasmHash}`);
  }
  // ADR 0018 in WebAssembly: the same draws and the same fixed-point results as
  // native, which is what makes the golden vectors a cross-target guarantee.
  const determinism = await LudivraRuntime.create(
    createLudivraModule,
    { tickRateHz: 60, maxPendingInputs: 4096, seed: 42n },
    { locateFile: (path) => resolve(root, "runtime-wasm/generated", path) }
  );
  try {
    determinism.loadGameplay(await readFile(resolve(root, "tests/fixtures/determinism.lua"), "utf8"));
    determinism.submitInput({ actionId: 1, valueMilli: 2000, sequence: 1n });
    determinism.step(1);
    const producedHash = determinism.stateHash().toString(16).padStart(16, "0");
    if (producedHash !== determinismMatch[1]) {
      throw new Error(`determinism mismatch: native=${determinismMatch[1]} wasm=${producedHash}`);
    }
    if (determinism.integerState(11) !== 3000n) {
      throw new Error(`fixed-point multiply diverged in WebAssembly: ${determinism.integerState(11)}`);
    }
  } finally {
    determinism.destroy();
  }

  const save = runtime.save();
  const replay = runtime.replay();
  runtime.verifyReplay(replay);

  const restored = await LudivraRuntime.create(
    createLudivraModule,
    { tickRateHz: 60, maxPendingInputs: 4096, seed: 42n },
    { locateFile: (path) => resolve(root, "runtime-wasm/generated", path) }
  );
  try {
    restored.loadGameplay(await readFile(resolve(root, "tests/fixtures/counter.lua"), "utf8"));
    restored.loadSave(save);
    if (restored.stateHash() !== runtime.stateHash() || restored.integerState(1) !== 1n) {
      throw new Error("WASM save round-trip changed runtime state");
    }
    restored.verifyReplay(replay);
  } finally {
    restored.destroy();
  }
  process.stdout.write(`native_wasm_hash=${wasmHash}\n`);
} finally {
  runtime.destroy();
}

const feedback = await LudivraRuntime.create(
  createLudivraModule,
  { tickRateHz: 60, maxPendingInputs: 4096, seed: 42n },
  { locateFile: (path) => resolve(root, "runtime-wasm/generated", path) }
);
try {
  feedback.loadGameplay(await readFile(resolve(root, "tests/fixtures/feedback.lua"), "utf8"));
  feedback.submitInput({ actionId: 1, valueMilli: 1000, sequence: 1n });
  feedback.step(1);
  const events = feedback.drainPresentationEvents();
  if (events.length !== 3 || events[0]?.type !== "audio-play" ||
      events[1]?.type !== "effect-spawn" || events[2]?.type !== "audio-stop") {
    throw new Error(`WASM presentation event mismatch: ${JSON.stringify(events)}`);
  }
  if (events[1].position.join(",") !== "1,-0.5,0.25") {
    throw new Error("WASM effect position mismatch");
  }
} finally {
  feedback.destroy();
}
