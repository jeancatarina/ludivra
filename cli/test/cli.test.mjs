import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

function runCli(arguments_) {
  const execution = spawnSync(process.execPath, ["dist/index.js", ...arguments_], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8"
  });
  return { execution, result: JSON.parse(execution.stdout) };
}

test("pnpm argument separator is ignored", () => {
  const { execution, result } = runCli(["--", "help", "--format", "json"]);
  assert.equal(execution.status, 0);
  assert.equal(result.operation, "help");
  assert.equal(result.status, "passed");
});

test("unknown command returns a structured failure", () => {
  const { execution, result } = runCli(["unknown", "--format", "json"]);
  assert.equal(execution.status, 2);
  assert.equal(result.status, "failed");
  assert.equal(result.diagnostics[0].code, "COMMAND_UNKNOWN");
});

test("new creates a schema-valid game project", () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "ludivra-cli-"));
  const project = resolve(temporaryRoot, "new-game");
  try {
    const created = runCli(["new", project, "--name", "Test Game", "--format", "json"]);
    assert.equal(created.execution.status, 0);
    assert.equal(created.result.data.id, "test-game");
    const validated = runCli(["validate", "--project", project, "--format", "json"]);
    assert.equal(validated.execution.status, 0);
    assert.equal(validated.result.status, "passed");
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("validate rejects duplicate semantic presentation event IDs", () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "ludivra-cli-feedback-"));
  const project = resolve(temporaryRoot, "feedback-game");
  try {
    assert.equal(runCli(["new", project, "--name", "Feedback Game", "--format", "json"]).execution.status, 0);
    const manifestPath = resolve(project, "game.jsonc");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const audio = (id) => ({
      id,
      eventId: 1,
      bus: "effects",
      loop: false,
      autoplay: false,
      volume: 0.5,
      origin: "test",
      license: "project_owned",
      synth: { waveform: "sine", frequency: 440, durationMs: 50 }
    });
    manifest.audio = [audio("audio.one"), audio("audio.two")];
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const validated = runCli(["validate", "--project", project, "--format", "json"]);
    assert.equal(validated.execution.status, 2);
    assert.equal(validated.result.diagnostics[0].code, "PRESENTATION_EVENT_ID_DUPLICATE");

    manifest.audio = [{
      id: "audio.missing",
      eventId: 2,
      bus: "effects",
      loop: false,
      autoplay: false,
      volume: 0.5,
      origin: "test",
      license: "project_owned",
      source: "assets/audio/missing.ogg"
    }];
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const missingAsset = runCli(["validate", "--project", project, "--format", "json"]);
    assert.equal(missingAsset.execution.status, 2);
    assert.ok(missingAsset.result.diagnostics.some(({ code }) => code === "AUDIO_SOURCE_MISSING"));
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
