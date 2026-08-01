import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  const metrics = JSON.parse(readFileSync(resolve(project, "reports/runs", result.runId, "metrics.json"), "utf8"));
  const projector = metrics.projectors?.find(({ projectorId }) => projectorId === "ui.inspection");
  assert.ok(projector, "the declared UI projector is measured by the headless host");
  assert.equal(projector.execution, "post-commit");
  assert.equal(projector.access, "read-only");
  assert.equal(projector.stateReads, 9);
  assert.equal(projector.uiNodes, 17);
  assert.ok(projector.executions >= 1);
  assert.ok(result.artifacts.some(({ kind, sha256 }) => kind === "replay" && /^[a-f0-9]{64}$/.test(sha256)));
  if (scenario === "scenarios/run-victory.jsonc") {
    const traceArtifact = result.artifacts.find(({ kind }) => kind === "causal-trace");
    const trace = JSON.parse(readFileSync(traceArtifact.path, "utf8"));
    assert.ok(trace.some(({ kind, data }) =>
      kind === "statechart-event" && data.transition === "start-run" && data.previous === "idle" && data.active === "combat"
    ), "the control trace names the statechart transition");
    assert.ok(trace.some(({ kind, data }) =>
      kind === "statechart-guard" && data.guard === "guard.can-start" && data.passed === true
    ), "the control trace records the evaluated guard");
    assert.ok(trace.some(({ kind, data }) =>
      kind === "statechart-action" && data.action === "action.begin-combat" && data.phase === "entry"
    ), "the control trace records the lifecycle action");
  }
}

// Content reaches the game through the compiled pack, not through the script.
const built = game(["content", "build", "--project", project]);
assert.equal(built.status, "passed");
const pack = JSON.parse(readFileSync(resolve(project, ".ludivra/content-pack.json"), "utf8"));
assert.equal(pack.packFormatVersion, 2);
const documents = pack.sections.documents.value;
assert.ok(documents["ember-vault.run"].cards.length >= 3, "the run document travels in the pack");
assert.ok(documents["ludivra.game"].inputs.length >= 1, "the manifest binding travels in the pack");
assert.ok(
  !readFileSync(resolve(project, "scripts/gameplay.lua"), "utf8").includes("CONTENT ="),
  "the script does not carry content"
);

// The bundle consumes the cooked audio index, which is derived and not versioned.
// Building through the CLI is what guarantees recipes are rendered first; calling
// vite directly would only work on a machine that happened to have the index.
game(["build", "--project", project, "--target", "web"]);

const rasterMatrix = [
  { viewport: "1280x800", textScale: "1", deviceScale: "1" },
  { viewport: "1280x800", textScale: "1", deviceScale: "2" },
  { viewport: "390x844", textScale: "1", deviceScale: "2" },
  { viewport: "1280x800", textScale: "1.5", deviceScale: "2" }
];
for (const row of rasterMatrix) {
  const captured = game([
    "capture", "--raster", "--project", project, "--name", "card-roguelite", "--profile", "desktop",
    "--viewport", row.viewport, "--text-scale", row.textScale, "--device-scale", row.deviceScale
  ]);
  assert.equal(captured.status, "passed");
  assert.equal(captured.data.baselinePresent, true);
  assert.equal(captured.data.textScale, Number(row.textScale));
  assert.equal(captured.data.deviceScale, Number(row.deviceScale));
  assert.equal(captured.data.locale, "en-US");
  assert.equal(captured.data.breakpoint, row.viewport.startsWith("390x") ? "compact" : "wide");
}

process.stdout.write("card_roguelite=PASS\n");
