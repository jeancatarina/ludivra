import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const temporaryRoot = mkdtempSync(resolve(tmpdir(), "ludivra-cold-session-"));
const project = resolve(temporaryRoot, "cold-game");
function game(arguments_) {
  const execution = spawnSync(process.execPath, ["cli/dist/index.js", ...arguments_, "--format", "json"], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 120_000 });
  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  return JSON.parse(execution.stdout);
}

try {
  cpSync(resolve(root, "examples/first-game"), project, {
    recursive: true,
    filter: (source) => {
      const portable = source.replaceAll("\\", "/");
      return !portable.includes("/.ludivra") && !portable.includes("/reports/runs/run_");
    }
  });
  const gameplayPath = resolve(project, "scripts/gameplay.lua");
  writeFileSync(gameplayPath, readFileSync(gameplayPath, "utf8").replace("ctx.commands:add_i64(SCORE_KEY, 1)", "ctx.commands:add_i64(SCORE_KEY, 2)"));
  const scenarioPath = resolve(project, "scenarios/charge-core.jsonc");
  writeFileSync(scenarioPath, readFileSync(scenarioPath, "utf8").replaceAll('"equals": 1', '"equals": 2'));

  const context = game(["context", "--task", "control scenario replay"]);
  assert.equal(context.data.matches[0].id, "operability.control-harness");
  assert.equal(game(["status", "--project", project]).status, "passed");
  assert.equal(game(["validate", "--project", project]).status, "passed");
  const simulated = game(["simulate", "--project", project, "--scenario", "scenarios/charge-core.jsonc"]);
  assert.equal(simulated.status, "passed");
  const logical = JSON.parse(readFileSync(simulated.artifacts.find(({ kind }) => kind === "logical-state").path, "utf8"));
  assert.equal(logical.integers.find(({ key }) => key === 1).value, "2");
  assert.ok(simulated.artifacts.some(({ kind }) => kind === "screenshot-svg"));
  assert.ok(simulated.artifacts.some(({ kind }) => kind === "replay"));
  process.stdout.write(`cold_session_run=${simulated.runId}\n`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
