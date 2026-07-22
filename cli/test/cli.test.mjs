import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeRepositoryPath, validateCmakeGraph, validateWorkspaceGraph } from "../dist/commands/validate.js";
import { createContractValidator } from "../dist/contract-validator.js";

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
  assert.ok(result.artifacts.some(({ kind, sha256 }) => kind === "run-manifest" && /^[a-f0-9]{64}$/.test(sha256)));
});

test("fitness functions normalize Windows repository paths", () => {
  assert.equal(normalizeRepositoryPath("hosts\\electron\\src\\main.cjs"), "hosts/electron/src/main.cjs");
  assert.equal(normalizeRepositoryPath("renderer-three\\src\\index.ts"), "renderer-three/src/index.ts");
});

test("control protocol rejects arbitrary execution operations", () => {
  const schema = JSON.parse(readFileSync(new URL("../../contracts/control-protocol.schema.json", import.meta.url), "utf8"));
  const validate = createContractValidator().compile(schema);
  assert.equal(validate({ protocolVersion: 1, requestId: 1, token: "a".repeat(64), operation: "eval", payload: { source: "process.exit()" } }), false);
  assert.equal(validate({ protocolVersion: 1, requestId: 1, token: "a".repeat(64), operation: "health", payload: {} }), true);
});

test("context search cites matching capability contracts", () => {
  const { execution, result } = runCli(["context", "--task", "control scenario replay", "--format", "json"]);
  assert.equal(execution.status, 0);
  assert.equal(result.data.confidence, "MATCHED");
  assert.equal(result.data.matches[0].id, "operability.control-harness");
  assert.ok(result.data.matches[0].contracts.includes("contracts/control-protocol.schema.json"));
});

test("unknown command returns a structured failure", () => {
  const { execution, result } = runCli(["unknown", "--format", "json"]);
  assert.equal(execution.status, 2);
  assert.equal(result.status, "failed");
  assert.equal(result.diagnostics[0].code, "COMMAND_UNKNOWN");
});

test("an invalid project target is not created for evidence output", () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "ludivra-invalid-project-"));
  const missingProject = resolve(temporaryRoot, "missing");
  try {
    const { execution, result } = runCli(["validate", "--project", missingProject, "--format", "json"]);
    assert.equal(execution.status, 2);
    assert.equal(existsSync(missingProject), false);
    assert.ok(result.artifacts.some(({ kind }) => kind === "run-manifest"));
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
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
    assert.equal(existsSync(resolve(project, ".ludivra/project-state.json")), true);
    assert.equal(existsSync(resolve(project, "PROJECT_STATE.json")), false);

    const status = runCli(["status", "--project", project, "--format", "json"]);
    assert.equal(status.execution.status, 0);
    assert.equal(status.result.data.state.project.id, "test-game");
    assert.notEqual(status.result.data.state.evidence.latestCompatibleRun, null);
    const runArtifact = status.result.artifacts.find(({ kind }) => kind === "run-manifest");
    assert.ok(runArtifact);
    const runManifest = JSON.parse(readFileSync(resolve(project, runArtifact.path), "utf8"));
    assert.equal(runManifest.context.projectId, "test-game");
    assert.equal(typeof runManifest.repositories.engine.dirty, "boolean");
    assert.ok(runManifest.artifacts.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256)));

    const manifestPath = resolve(project, "game.jsonc");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.name = "Changed Without Status";
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const stale = runCli(["validate", "--project", project, "--format", "json"]);
    assert.equal(stale.execution.status, 2);
    assert.ok(stale.result.diagnostics.some(({ code }) => code === "PROJECT_STATE_STALE"));
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("fitness functions reject workspace and CMake cycles", async () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "ludivra-cycles-"));
  try {
    for (const [name, dependency] of [["a", "b"], ["b", "a"]]) {
      const directory = resolve(temporaryRoot, name);
      mkdirSync(directory, { recursive: true });
      writeFileSync(resolve(directory, "package.json"), JSON.stringify({
        name: `@ludivra/${name}`,
        dependencies: { [`@ludivra/${dependency}`]: "workspace:*" }
      }));
    }
    const workspaceDiagnostics = [];
    await validateWorkspaceGraph(temporaryRoot, [], workspaceDiagnostics);
    assert.ok(workspaceDiagnostics.some(({ code }) => code === "WORKSPACE_DEPENDENCY_CYCLE"));

    writeFileSync(resolve(temporaryRoot, "CMakeLists.txt"), [
      "add_library(alpha STATIC alpha.cpp)",
      "add_library(beta STATIC beta.cpp)",
      "target_link_libraries(alpha PRIVATE beta)",
      "target_link_libraries(beta PRIVATE alpha)"
    ].join("\n"));
    const cmakeDiagnostics = [];
    await validateCmakeGraph(temporaryRoot, cmakeDiagnostics);
    assert.ok(cmakeDiagnostics.some(({ code }) => code === "CMAKE_DEPENDENCY_CYCLE"));
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

test("validate rejects card content that references an absent manifest action", () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "ludivra-card-content-"));
  const project = resolve(temporaryRoot, "card-game");
  try {
    cpSync(resolve(fileURLToPath(new URL("../..", import.meta.url)), "examples/card-roguelite"), project, {
      recursive: true,
      filter: (source) => {
        const normalized = source.replaceAll("\\", "/");
        return !normalized.includes("/.ludivra") && !normalized.includes("/reports/runs/run_");
      }
    });
    assert.equal(runCli(["status", "--project", project, "--format", "json"]).execution.status, 0);
    const manifestPath = resolve(project, "game.jsonc");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.inputs = manifest.inputs.filter(({ id }) => id !== "play-strike");
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const validated = runCli(["validate", "--project", project, "--format", "json"]);
    assert.equal(validated.execution.status, 2);
    assert.ok(validated.result.diagnostics.some(({ code }) => code === "CONTENT_CARD_CONTRACT_INVALID"));
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
