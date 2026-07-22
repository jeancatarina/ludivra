import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { composeGameplaySource } from "../../runtime-web/dist/index.js";

const root = resolve(import.meta.dirname, "../..");
const project = resolve(root, "examples/card-roguelite");

function run(command, arguments_, environment = process.env) {
  const execution = spawnSync(command, arguments_, { cwd: root, env: environment, encoding: "utf8" });
  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  return execution.stdout;
}

function game(arguments_) {
  return JSON.parse(run(process.execPath, ["cli/dist/index.js", ...arguments_, "--format", "json"]));
}

game(["status", "--project", project]);
const validated = game(["validate", "--project", project]);
assert.equal(validated.status, "passed");
assert.equal(validated.data.contentFilesChecked, 1);

const expected = new Map([
  ["scenarios/run-victory.jsonc", { phase: "3", health: "15", enemy: "0" }],
  ["scenarios/run-defeat.jsonc", { phase: "4", health: "0", enemy: "10" }],
  ["scenarios/guard-and-energy.jsonc", { phase: "1", health: "20", enemy: "2" }]
]);
for (const [scenario, state] of expected) {
  const result = game(["simulate", "--project", project, "--scenario", scenario]);
  assert.equal(result.status, "passed");
  const logical = JSON.parse(readFileSync(resolve(project, "reports/runs", result.runId, "logical-state.json"), "utf8"));
  const integers = new Map(logical.integers.map(({ key, value }) => [key, value]));
  assert.equal(integers.get(1), state.phase);
  assert.equal(integers.get(2), state.health);
  assert.equal(integers.get(3), state.enemy);
  assert.ok(result.artifacts.some(({ kind, sha256 }) => kind === "replay" && /^[a-f0-9]{64}$/.test(sha256)));
}

const first = composeGameplaySource("return {}", [
  { id: "z", value: { beta: 2, alpha: 1 } },
  { id: "a", value: { label: "Brasa" } }
]);
const second = composeGameplaySource("return {}", [
  { id: "a", value: { label: "Brasa" } },
  { id: "z", value: { alpha: 1, beta: 2 } }
]);
assert.equal(first, second);
assert.throws(() => composeGameplaySource("return {}", [{ id: "x", value: null }]), /does not support null/);
assert.throws(() => composeGameplaySource("return {}", [{ id: "x", value: {} }, { id: "x", value: {} }]), /duplicate/);

run("pnpm", ["--filter", "@ludivra/browser-host", "build"], {
  ...process.env,
  LUDIVRA_GAME_DIR: project,
  LUDIVRA_BASE: "/"
});

process.stdout.write("card_roguelite=PASS\n");
