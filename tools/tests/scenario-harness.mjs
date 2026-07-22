import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
function game(arguments_) {
  const execution = spawnSync(process.execPath, ["cli/dist/index.js", ...arguments_, "--format", "json"], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 120_000 });
  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  return JSON.parse(execution.stdout);
}

const simulated = game(["simulate", "--project", "examples/first-game", "--scenario", "scenarios/charge-core.jsonc"]);
assert.equal(simulated.status, "passed");
assert.equal(simulated.data.tick, "1");
assert.match(simulated.data.stateHash, /^[a-f0-9]{16}$/);
const kinds = new Set(simulated.artifacts.map(({ kind }) => kind));
for (const kind of ["logical-state", "ui-view-model", "rendered-ui-snapshot", "causal-trace", "replay", "screenshot-svg", "run-manifest"]) assert.ok(kinds.has(kind), `missing artifact ${kind}`);
const replay = simulated.data.replay;
assert.ok(existsSync(replay));
const replayRelative = replay.slice(resolve(root, "examples/first-game").length + 1);
const verified = game(["replay", "--project", "examples/first-game", "--scenario", "scenarios/charge-core.jsonc", "--replay", replayRelative]);
assert.equal(verified.data.verified, true);
const traceArtifact = simulated.artifacts.find(({ kind }) => kind === "causal-trace");
const trace = JSON.parse(readFileSync(traceArtifact.path, "utf8"));
assert.deepEqual([...new Set(trace.map(({ stage }) => stage))], ["input", "command", "event", "presentation"]);
const commandArtifact = simulated.artifacts.find(({ kind }) => kind === "control-commands");
const commands = JSON.parse(readFileSync(commandArtifact.path, "utf8"));
const replayCommand = commands.find(({ operation }) => operation === "verify_replay");
assert.equal(replayCommand.payload.archiveBase64, undefined);
assert.match(replayCommand.payload.archiveSha256, /^[a-f0-9]{64}$/);
assert.equal(commands.at(-1).operation, "shutdown");
assert.equal(commands.at(-1).status, "PASS");
process.stdout.write(`scenario_run=${simulated.runId}\n`);
