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
  process.stdout.write(`native_wasm_hash=${wasmHash}\n`);
} finally {
  runtime.destroy();
}
