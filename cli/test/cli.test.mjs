import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse as parseJsonc } from "jsonc-parser";
import { normalizeRepositoryPath, validateCmakeGraph, validateWorkspaceGraph } from "../dist/commands/validate.js";
import { createContractValidator } from "../dist/contract-validator.js";

function runCli(arguments_) {
  const execution = spawnSync(process.execPath, ["dist/index.js", ...arguments_], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8"
  });
  return { execution, result: JSON.parse(execution.stdout) };
}

function storageChecksum(bytes) {
  let value = 14695981039346656037n;
  for (const byte of bytes) value = BigInt.asUintN(64, (value ^ BigInt(byte)) * 1099511628211n);
  return value;
}

function storageBytes(parts) {
  const content = Buffer.concat(parts);
  const checksum = Buffer.alloc(8);
  checksum.writeBigUInt64LE(storageChecksum(content));
  return Buffer.concat([content, checksum]);
}

function storageU32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value >>> 0);
  return bytes;
}

function storageI32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeInt32LE(value);
  return bytes;
}

function storageU64(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(value));
  return bytes;
}

function storageBlob(bytes) {
  return Buffer.concat([storageU32(bytes.length), bytes]);
}

function storageRegion({ version, key, seed = 42n }) {
  const generator = Buffer.from("procedural-test", "utf8");
  const delta = Buffer.from([7, 8, 9]);
  const common = [
    Buffer.from("LDWR", "ascii"), storageU32(version), storageU32(key.dimension), storageI32(key.x), storageI32(key.y), storageI32(key.z),
    storageBlob(generator), storageU32(3), storageU64(seed), storageU32(1), storageI32(-1), storageI32(0), storageI32(1), storageBlob(delta),
    storageBlob(Buffer.from([1, 2]))
  ];
  if (version === 1) common.push(storageBlob(Buffer.from([3])));
  common.push(storageBlob(Buffer.from([4, 5])));
  return storageBytes(common);
}

function storageJournal(regions) {
  return storageBytes([
    Buffer.from("LDWJ", "ascii"), storageU32(1), storageU32(regions.length), ...regions.map(storageBlob)
  ]);
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

test("storage inspects, migrates, compacts and recovers canonical region files", () => {
  const root = mkdtempSync(resolve(tmpdir(), "ludivra-storage-"));
  const legacyKey = { dimension: 7, x: -2, y: 3, z: -4 };
  const recoveredKey = { dimension: 7, x: 6, y: 0, z: 9 };
  const legacyPath = resolve(root, "region-d7-x-2-y3-z-4.ldwr");
  try {
    writeFileSync(legacyPath, storageRegion({ version: 0, key: legacyKey }));
    const inspectedLegacy = runCli(["storage", "inspect", "--root", root, "--format", "json"]);
    assert.equal(inspectedLegacy.execution.status, 0);
    assert.equal(inspectedLegacy.result.data.regions[0].sourceVersion, 0);
    assert.deepEqual(inspectedLegacy.result.data.regions[0].key, legacyKey);

    const migrated = runCli(["storage", "migrate", "--root", root, "--format", "json"]);
    assert.equal(migrated.execution.status, 0);
    assert.equal(migrated.result.data.migratedRegions, 1);
    assert.equal(readFileSync(legacyPath).readUInt32LE(4), 1);

    const compacted = runCli(["storage", "compact", "--root", root, "--format", "json"]);
    assert.equal(compacted.execution.status, 0);
    assert.equal(compacted.result.data.compactedRegions, 1);

    writeFileSync(resolve(root, "journal.ldwj"), storageJournal([storageRegion({ version: 1, key: recoveredKey, seed: 99n })]));
    const recovered = runCli(["storage", "recover", "--root", root, "--format", "json"]);
    assert.equal(recovered.execution.status, 0);
    assert.equal(recovered.result.data.replayedRegions, 1);
    assert.equal(existsSync(resolve(root, "journal.ldwj")), false);
    assert.equal(existsSync(resolve(root, "region-d7-x6-y0-z9.ldwr")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an invalid project target is not created for evidence output", () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "ludivra-invalid-project-"));
  const missingProject = resolve(temporaryRoot, "missing");
  try {
    const { execution, result } = runCli(["validate", "--scope", "project", "--project", missingProject, "--format", "json"]);
    assert.equal(execution.status, 2);
    assert.equal(existsSync(missingProject), false);
    assert.equal(result.data.requiredFilesChecked, 0);
    assert.ok(result.artifacts.some(({ kind }) => kind === "run-manifest"));
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("validate rejects an unknown scope", () => {
  const { execution, result } = runCli(["validate", "--scope", "fast", "--format", "json"]);
  assert.equal(execution.status, 2);
  assert.equal(result.diagnostics[0].code, "VALIDATE_SCOPE_INVALID");
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
    // game.jsonc is JSONC by contract: comments are legal and JSON.parse is not.
    const manifest = parseJsonc(readFileSync(manifestPath, "utf8"));
    manifest.name = "Changed Without Status";
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const stale = runCli(["validate", "--scope", "project", "--project", project, "--format", "json"]);
    assert.equal(stale.execution.status, 2);
    assert.ok(stale.result.diagnostics.some(({ code }) => code === "PROJECT_STATE_STALE"));
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("asset cooker validates glTF provenance, reuses content-addressed output and rejects project escape", () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "ludivra-asset-cook-"));
  const project = resolve(temporaryRoot, "asset-game");
  try {
    assert.equal(runCli(["new", project, "--name", "Asset Game", "--format", "json"]).execution.status, 0);
    const source = "assets/models/reference.gltf";
    mkdirSync(resolve(project, "assets/models"), { recursive: true });
    writeFileSync(resolve(project, source), JSON.stringify({
      asset: { version: "2.0", generator: "asset cooker test" },
      meshes: [{ primitives: [{ indices: 0 }] }],
      accessors: [{ count: 3 }]
    }));
    const manifestPath = resolve(project, "game.jsonc");
    const manifest = parseJsonc(readFileSync(manifestPath, "utf8"));
    manifest.assets = [{
      id: "model.reference",
      kind: "model",
      format: "gltf",
      source,
      origin: "test",
      license: "CC0-1.0",
      targets: ["browser"],
      residency: { class: "scene", priority: 1, cpuBudgetMiB: 1, gpuBudgetMiB: 1 },
      import: { units: "meters", coordinateSystem: "right-handed-y-up" }
    }];
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const cooked = runCli(["asset", "cook", "--project", project, "--format", "json"]);
    assert.equal(cooked.execution.status, 0);
    assert.equal(cooked.result.data.rendered[0].metrics.triangles, 1);
    assert.equal(cooked.result.data.rendered[0].reused, false);
    assert.ok(existsSync(resolve(project, ".ludivra/assets-index.json")));

    const reused = runCli(["asset", "inspect", "--project", project, "--id", "model.reference", "--format", "json"]);
    assert.equal(reused.execution.status, 0);
    assert.equal(reused.result.data.rendered[0].reused, true);

    const glbJson = Buffer.from('{"asset":{"version":"2.0"}} '.padEnd(28, " "), "utf8");
    const glb = Buffer.alloc(20 + glbJson.length);
    glb.writeUInt32LE(0x46546c67, 0);
    glb.writeUInt32LE(2, 4);
    glb.writeUInt32LE(glb.length, 8);
    glb.writeUInt32LE(glbJson.length, 12);
    glb.writeUInt32LE(0x4e4f534a, 16);
    glbJson.copy(glb, 20);
    writeFileSync(resolve(project, "assets/models/reference.glb"), glb);
    manifest.assets.push({
      ...manifest.assets[0],
      id: "model.binary-reference",
      format: "glb",
      source: "assets/models/reference.glb"
    });
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const binary = runCli(["asset", "cook", "--project", project, "--id", "model.binary-reference", "--format", "json"]);
    assert.equal(binary.execution.status, 0);
    assert.equal(binary.result.data.rendered[0].format, "glb");
    const index = JSON.parse(readFileSync(resolve(project, ".ludivra/assets-index.json"), "utf8"));
    assert.equal(index.entries.length, 2);

    manifest.assets[0].source = "../outside.gltf";
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const escaped = runCli(["asset", "cook", "--project", project, "--format", "json"]);
    assert.equal(escaped.execution.status, 2);
    assert.equal(escaped.result.diagnostics[0].code, "ASSET_SOURCE_UNDECLARED");
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
    // game.jsonc is JSONC by contract: comments are legal and JSON.parse is not.
    const manifest = parseJsonc(readFileSync(manifestPath, "utf8"));
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

    const validated = runCli(["validate", "--scope", "project", "--project", project, "--format", "json"]);
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
    const missingAsset = runCli(["validate", "--scope", "project", "--project", project, "--format", "json"]);
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
    // game.jsonc is JSONC by contract: comments are legal and JSON.parse is not.
    const manifest = parseJsonc(readFileSync(manifestPath, "utf8"));
    manifest.inputs = manifest.inputs.filter(({ id }) => id !== "play-strike");
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const validated = runCli(["validate", "--scope", "project", "--project", project, "--format", "json"]);
    assert.equal(validated.execution.status, 2);
    assert.ok(validated.result.diagnostics.some(({ code }) => code === "CONTENT_CARD_CONTRACT_INVALID"));
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("content validation and pack compilation migrate declared legacy content", () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "ludivra-content-migration-"));
  const project = resolve(temporaryRoot, "card-game");
  const root = fileURLToPath(new URL("../..", import.meta.url));
  try {
    cpSync(resolve(root, "examples/card-roguelite"), project, {
      recursive: true,
      filter: (source) => {
        const normalized = source.replaceAll("\\", "/");
        return !normalized.includes("/.ludivra") && !normalized.includes("/reports/runs/run_");
      }
    });
    const fixture = readFileSync(resolve(root, "content-compiler/test/fixtures/migrations/card-roguelite-v1.input.json"), "utf8");
    writeFileSync(resolve(project, "content/run.jsonc"), fixture);
    assert.equal(runCli(["status", "--project", project, "--format", "json"]).execution.status, 0);
    const validated = runCli(["validate", "--scope", "project", "--project", project, "--format", "json"]);
    assert.equal(validated.execution.status, 0, JSON.stringify(validated.result.diagnostics));
    const built = runCli(["content", "build", "--project", project, "--format", "json"]);
    assert.equal(built.execution.status, 0, JSON.stringify(built.result.diagnostics));
    const pack = JSON.parse(readFileSync(resolve(project, ".ludivra/content-pack.json"), "utf8"));
    assert.equal(pack.packFormatVersion, 2);
    assert.deepEqual(pack.sections.migrations.value[0].applied.map(({ id }) => id), ["card-roguelite-v1-to-v2"]);
    assert.equal(pack.sections.documents.value["ember-vault.run"].run.rewardHealAmount, 3);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("scene validation rejects an unresolved required prefab slot", () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "ludivra-scene-graph-"));
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
    const scenePath = resolve(project, "scenes/ember-vault.scene.jsonc");
    const scene = parseJsonc(readFileSync(scenePath, "utf8"));
    scene.nodes.find(({ id }) => id === "hero").slots = [];
    writeFileSync(scenePath, `${JSON.stringify(scene, null, 2)}\n`);
    const validated = runCli(["validate", "--scope", "project", "--project", project, "--format", "json"]);
    assert.equal(validated.execution.status, 2);
    assert.ok(validated.result.diagnostics.some(({ code }) => code === "PREFAB_SLOT_UNRESOLVED"));
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("declared UI projector validates the view model and reports deterministic reads", async () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const { BASE_LOCALE, createUiInspectionProjector, resolveUiLabel, validateRenderedUi } = await import(
    "@ludivra/presentation-protocol"
  );
  const validator = createContractValidator();
  const projectorSchema = JSON.parse(readFileSync(resolve(root, "contracts/ui-inspection-projector.schema.json"), "utf8"));
  const viewModelSchema = JSON.parse(readFileSync(resolve(root, "contracts/ui-view-model.schema.json"), "utf8"));
  const snapshotSchema = JSON.parse(
    readFileSync(resolve(root, "contracts/rendered-ui-snapshot.schema.json"), "utf8")
  );
  const validateViewModel = validator.compile(viewModelSchema);
  const validateSnapshot = validator.compile(snapshotSchema);

  const declaration = {
    projectorVersion: 1,
    id: "ui.inspection",
    kind: "ui-inspection",
    screen: "game",
    states: ["energy"],
    inputs: ["play-strike"]
  };
  const validateProjector = validator.compile(projectorSchema);
  assert.ok(validateProjector(declaration), JSON.stringify(validateProjector.errors));
  const projector = createUiInspectionProjector(declaration, {
    states: [{ id: "energy", label: "Energia", key: 7 }],
    inputs: [{ id: "play-strike", label: "Jogar Golpe", actionId: 1 }]
  });
  const projection = projector.project({
    tick: 12n,
    integer(key) {
      assert.equal(key, 7);
      return 3n;
    }
  });
  const { viewModel, localeTable: locale } = projection;
  assert.ok(validateViewModel(viewModel), JSON.stringify(validateViewModel.errors));
  assert.deepEqual(projection.measurement, {
    projectorId: "ui.inspection",
    projectorVersion: 1,
    kind: "ui-inspection",
    access: "read-only",
    execution: "post-commit",
    stateReadsFormula: "states.length",
    uiNodesFormula: "viewModel.nodes.length",
    stateReads: 1,
    uiNodes: 3
  });
  assert.deepEqual(projector.metrics(), {
    ...projection.measurement,
    executions: 1,
    totalStateReads: 1,
    totalUiNodes: 3
  });

  // The view model carries keys and parameters; resolved text belongs to the renderer.
  for (const node of viewModel.nodes) {
    assert.ok(!Object.values(node).includes("Energia: 3"));
  }
  assert.equal(resolveUiLabel(locale, "state.energy", { value: "3" }), "Energia: 3");
  assert.equal(resolveUiLabel(locale, "input.play-strike", {}), "Jogar Golpe");
  assert.throws(() => resolveUiLabel(locale, "state.absent", {}), /UI_LOCALE_KEY_MISSING/);
  assert.throws(() => resolveUiLabel(locale, "state.energy", {}), /UI_LOCALE_PARAM_MISSING/);

  const button = viewModel.nodes.find(({ role }) => role === "button");
  assert.deepEqual(button.actions, ["act"]);
  assert.equal(button.intent.actionId, 1);
  assert.equal(viewModel.focus, button.id);
  assert.deepEqual(button.navigation, { previous: button.id, next: button.id });

  const snapshot = {
    protocolVersion: 1,
    renderer: "browser-dom-v1",
    viewport: { width: 1280, height: 720 },
    textScale: 1,
    locale: BASE_LOCALE,
    breakpoint: "wide",
    nodes: viewModel.nodes.map((node) => ({
      id: node.id,
      bounds: { x: 0, y: 0, width: 100, height: node.role === "button" ? 48 : 20 },
      visible: true,
      clipped: false,
      focused: node.id === viewModel.focus,
      text: resolveUiLabel(locale, node.labelKey, node.labelParams),
      accessibleRole: node.role === "button" ? "button" : "status",
      contrastRatio: 7.4
    }))
  };
  assert.ok(validateSnapshot(snapshot), JSON.stringify(validateSnapshot.errors));
  assert.deepEqual(validateRenderedUi(viewModel, snapshot, {
    minimumTouchTargetPx: 48,
    minimumContrastRatio: 4.5,
    breakpoint: "wide"
  }), []);

  // An unknown renderer must be refused so headless evidence is never read as browser evidence.
  assert.equal(validateSnapshot({ ...snapshot, renderer: "unknown-v1" }), false);
  assert.throws(
    () => createUiInspectionProjector({ ...declaration, states: ["missing"] }, {
      states: [{ id: "energy", label: "Energia", key: 7 }],
      inputs: [{ id: "play-strike", label: "Jogar Golpe", actionId: 1 }]
    }),
    /UI_PROJECTOR_STATE_UNKNOWN/
  );
});

test("raster comparison decodes PNG filters and applies declared tolerance", async () => {
  const { crc32, deflateSync } = await import("node:zlib");
  const { compareRasterImages, decodePng } = await import("../dist/raster-image.js");
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, body) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, checksum]);
  }

  // Row 0 uses filter None, row 1 uses filter Sub, so both unfilter paths are exercised.
  function encode(width, height, rows) {
    const stride = width * 4;
    const raw = Buffer.alloc(height * (stride + 1));
    for (let y = 0; y < height; y += 1) {
      raw[y * (stride + 1)] = rows[y].filter;
      Buffer.from(rows[y].bytes).copy(raw, y * (stride + 1) + 1);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    return Buffer.concat([
      signature,
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0))
    ]);
  }

  const first = [10, 20, 30, 255, 12, 22, 32, 255];
  const secondSub = [40, 50, 60, 255, 5, 5, 5, 0];
  const png = encode(2, 2, [{ filter: 0, bytes: first }, { filter: 1, bytes: secondSub }]);
  const image = decodePng(png);
  assert.equal(image.width, 2);
  assert.equal(image.height, 2);
  assert.deepEqual([...image.pixels.slice(0, 8)], first);
  // Sub filter: each channel adds the pixel to its left.
  assert.deepEqual([...image.pixels.slice(8, 16)], [40, 50, 60, 255, 45, 55, 65, 255]);

  const identical = compareRasterImages(image, decodePng(png), { maxChangedFraction: 0, maxChannelDelta: 0 });
  assert.equal(identical.changedPixels, 0);
  assert.equal(identical.withinTolerance, true);

  const drifted = decodePng(encode(2, 2, [
    { filter: 0, bytes: [10, 20, 30, 255, 12, 22, 34, 255] },
    { filter: 1, bytes: secondSub }
  ]));
  const small = compareRasterImages(image, drifted, { maxChangedFraction: 0.5, maxChannelDelta: 8 });
  assert.equal(small.changedPixels, 1);
  assert.equal(small.maxChannelDelta, 2);
  assert.equal(small.withinTolerance, true);
  assert.deepEqual(small.regions, [{ x: 0, y: 0, width: 2, height: 2 }]);

  const strict = compareRasterImages(image, drifted, { maxChangedFraction: 0.5, maxChannelDelta: 1 });
  assert.equal(strict.withinTolerance, false);

  assert.throws(
    () => compareRasterImages(image, decodePng(encode(1, 1, [{ filter: 0, bytes: [0, 0, 0, 255] }])), {
      maxChangedFraction: 1,
      maxChannelDelta: 255
    }),
    /CAPTURE_IMAGE_SIZE_MISMATCH/
  );
  assert.throws(() => decodePng(Buffer.from("not a png")), /CAPTURE_IMAGE_NOT_PNG/);
});

test("raster capture keys approved baselines by viewport, text scale and device scale", async () => {
  const { parseRasterCaptureRequest, rasterBaselineFileName } = await import("../dist/raster-capture.js");
  const request = parseRasterCaptureRequest([
    "capture", "--viewport", "390x844", "--text-scale", "1.5", "--device-scale", "2"
  ]);
  assert.equal(request.textScale, 1.5);
  assert.equal(request.deviceScale, 2);
  assert.equal(rasterBaselineFileName(request, 2), "390x844@2x-text-1.5x.png");
  assert.throws(
    () => parseRasterCaptureRequest(["capture", "--text-scale", "0"]),
    /CAPTURE_PROFILE_UNDECLARED/
  );
});

test("artifact families own their inputs and declare their dependents", async () => {
  const { cacheFamilyIds, dependentFamilies, familyDefinition, owningFamily } = await import(
    "../dist/artifact-cache.js"
  );
  const { parseBuildOptions } = await import("../dist/build-runner.js");

  assert.deepEqual(cacheFamilyIds(), ["contracts", "packages", "wasm", "native", "web-bundle"]);
  assert.equal(owningFamily("hosts/browser/src/main.ts"), "web-bundle");
  assert.equal(owningFamily("kernel/src/runtime.cpp"), "wasm");
  assert.equal(owningFamily("contracts/ui-view-model.schema.json"), "contracts");
  assert.equal(owningFamily("docs/program-status.json"), "contracts");
  assert.equal(owningFamily("docs/adr/0046-generated-program-documentation.md"), "contracts");
  assert.equal(owningFamily("runtime-web/tsconfig.json"), "packages");
  // A path no family declares must not trigger a rebuild by accident.
  assert.equal(owningFamily("README.md"), null);

  // Changing contracts must rebuild everything that consumes them, in order.
  const affected = dependentFamilies("contracts");
  assert.deepEqual(affected, ["contracts", "packages", "wasm", "native", "web-bundle"]);
  assert.deepEqual(dependentFamilies("packages"), ["packages", "web-bundle"]);
  assert.deepEqual(dependentFamilies("web-bundle"), ["web-bundle"]);

  // Every family declares inputs, outputs and a command; a stub family is not allowed.
  for (const id of cacheFamilyIds()) {
    const family = familyDefinition(id);
    assert.ok(family.inputs.length > 0, `${id} declares inputs`);
    assert.ok(family.outputs.length > 0, `${id} declares outputs`);
    assert.ok(family.command.length > 0, `${id} declares a command`);
  }

  assert.deepEqual(parseBuildOptions([]), { watch: false, force: false, debounceMs: 150 });
  assert.deepEqual(parseBuildOptions(["--watch", "--no-cache", "--debounce", "50"]), {
    watch: true,
    force: true,
    debounceMs: 50
  });
  assert.throws(() => parseBuildOptions(["--debounce", "-1"]), /RUNNER_DEBOUNCE_INVALID/);
});

test("the process runner terminates a child that exceeds its declared timeout", async () => {
  const { liveChildren, runProcess } = await import("../dist/process-runner.js");
  const result = await runProcess(process.execPath, ["-e", "setTimeout(() => {}, 60_000)"], {
    id: "timeout-probe",
    cwd: process.cwd(),
    timeoutMs: 300,
    killGraceMs: 200
  });
  assert.equal(result.timedOut, true);
  assert.equal(result.exitCode, 124);
  assert.match(result.output, /RUNNER_CHILD_TIMEOUT: timeout-probe/);
  // The child must be gone from the live table, not merely detached.
  assert.deepEqual(liveChildren(), []);
});

test("the recording renderer links projector intent to the captured frame", async () => {
  const { createRecordingRenderer } = await import("@ludivra/presentation-protocol");
  const calls = [];
  const inner = new Proxy({}, {
    get: (_target, name) => (...args) => {
      calls.push(name);
      return undefined;
    }
  });
  const recording = createRecordingRenderer(inner);

  recording.beginFrame();
  recording.renderer.createVisual({ id: "core", shape: "sphere", color: 0x9b7cff, surface: "emissive" });
  recording.renderer.createAssetVisual({ id: "reference-model", assetId: "model.reference" });
  recording.renderer.setTransform("core", { position: [1, 2, 3], rotation: [0, 0, 0] });
  recording.renderer.setVisible("core", false);
  recording.renderer.spawnParticles({
    position: [0, 0, 0], color: 1, count: 4, size: 1, speed: 1, lifetimeMs: 10, gravity: 0, seed: 7n
  });
  recording.renderer.render();

  const trace = recording.trace("42");
  assert.equal(trace.tick, "42");
  assert.equal(trace.visuals.length, 2);
  assert.deepEqual(trace.visuals[0], {
    id: "core",
    shape: "sphere",
    surface: "emissive",
    color: 0x9b7cff,
    visible: false,
    transform: { position: [1, 2, 3], rotation: [0, 0, 0] }
  });
  assert.deepEqual(trace.visuals[1], {
    id: "reference-model",
    shape: "asset",
    surface: "asset",
    color: 0,
    visible: true,
    transform: null,
    assetId: "model.reference"
  });
  assert.equal(trace.operations.createVisual, 1);
  assert.equal(trace.operations.createAssetVisual, 1);
  assert.equal(trace.operations.setTransform, 1);
  assert.equal(trace.operations.render, 1);
  assert.equal(trace.particleBursts, 1);
  // Every recorded call must still reach the real renderer.
  assert.deepEqual(calls, ["createVisual", "createAssetVisual", "setTransform", "setVisible", "spawnParticles", "render"]);

  // A new frame resets per-frame counters but keeps the projected scene.
  recording.beginFrame();
  const next = recording.trace("43");
  assert.equal(next.operations.render, 0);
  assert.equal(next.particleBursts, 0);
  assert.equal(next.visuals.length, 2);
});

test("game audio renders a recipe, reuses it by key and reports its analysis", () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "ludivra-audio-"));
  const project = resolve(temporaryRoot, "audio-game");
  try {
    cpSync(resolve(fileURLToPath(new URL("../..", import.meta.url)), "examples/card-roguelite"), project, {
      recursive: true,
      filter: (source) => {
        const normalized = source.replaceAll("\\", "/");
        return !normalized.includes("/.ludivra") && !normalized.includes("/reports/runs/run_");
      }
    });

    const first = runCli(["audio", "render", "--project", project, "--format", "json"]);
    assert.equal(first.execution.status, 0, first.execution.stdout);
    assert.equal(first.result.data.recipes, 1);
    const [rendered] = first.result.data.rendered;
    assert.equal(rendered.id, "audio.card.strike");
    assert.equal(rendered.reused, false);
    assert.equal(rendered.durationMs, 340);
    assert.equal(rendered.sampleRate, 48000);
    assert.ok(existsSync(resolve(project, rendered.output)), "the rendered wav exists");
    assert.ok(first.result.artifacts.some(({ kind }) => kind === "audio-asset"));

    // The same recipe and generator version must reuse the render instead of redoing it.
    const second = runCli(["audio", "render", "--project", project, "--format", "json"]);
    assert.equal(second.result.data.rendered[0].reused, true);
    assert.equal(second.result.data.rendered[0].sha256, rendered.sha256);

    // Changing the recipe changes the identity of the artifact.
    const recipePath = resolve(project, "audio/ember-strike.audio.jsonc");
    writeFileSync(recipePath, readFileSync(recipePath, "utf8").replace('"seed": 48192', '"seed": 7'));
    const varied = runCli(["audio", "render", "--project", project, "--format", "json"]);
    assert.notEqual(varied.result.data.rendered[0].sha256, rendered.sha256);
    assert.equal(varied.result.data.rendered[0].reused, false);

    // An invalid recipe fails with a stable code instead of producing audio.
    writeFileSync(recipePath, JSON.stringify({ schemaVersion: 1, id: "audio.broken", kind: "sfx" }));
    const broken = runCli(["audio", "render", "--project", project, "--format", "json"]);
    assert.equal(broken.execution.status, 2);
    assert.ok(broken.result.diagnostics.some(({ code }) => code === "AUDIO_RECIPE_INVALID"));
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("game visual compiles, validates and finalizes a deterministic humanoid job", () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "ludivra-visual-"));
  const project = resolve(temporaryRoot, "visual-game");
  const engineRoot = fileURLToPath(new URL("../..", import.meta.url));
  try {
    assert.equal(runCli(["new", project, "--name", "Visual Game", "--format", "json"]).execution.status, 0);
    mkdirSync(resolve(project, "visuals"), { recursive: true });
    mkdirSync(resolve(project, "styles/stylized"), { recursive: true });
    cpSync(
      resolve(engineRoot, "visual-authoring/test/fixtures/goblin-shaman.character.json"),
      resolve(project, "visuals/goblin-shaman.character.json")
    );
    cpSync(
      resolve(engineRoot, "visual-authoring/test/fixtures/stylized/style.yaml"),
      resolve(project, "styles/stylized/style.yaml")
    );

    const first = runCli(["visual", "compile", "visual.goblin.shaman", "--project", project, "--format", "json"]);
    assert.equal(first.execution.status, 0, first.execution.stdout);
    assert.equal(first.result.data.rendered[0].validation, "passed");
    assert.equal(first.result.data.rendered[0].triangles, 118669);
    assert.equal(first.result.data.rendered[0].bones, 21);
    assert.equal(first.result.data.rendered[0].reused, false);
    assert.ok(existsSync(resolve(project, first.result.data.rendered[0].output)));
    assert.ok(existsSync(resolve(project, first.result.data.rendered[0].manifest)));
    assert.ok(existsSync(resolve(project, first.result.data.rendered[0].preview)));

    const second = runCli(["visual", "compile", "visual.goblin.shaman", "--project", project, "--format", "json"]);
    assert.equal(second.execution.status, 0, second.execution.stdout);
    assert.equal(second.result.data.rendered[0].reused, true);
    assert.equal(second.result.data.rendered[0].sha256, first.result.data.rendered[0].sha256);

    const validated = runCli(["visual", "validate", "visual.goblin.shaman", "--project", project, "--format", "json"]);
    assert.equal(validated.execution.status, 0, validated.execution.stdout);
    assert.equal(validated.result.data.validation, "passed");
    assert.equal(validated.result.data.state, "VALIDATING");

    const finalized = runCli(["visual", "finalize", "visual.goblin.shaman", "--project", project, "--format", "json"]);
    assert.equal(finalized.execution.status, 0, finalized.execution.stdout);
    assert.equal(finalized.result.data.state, "APPROVED");
    const cookedAgain = runCli(["visual", "compile", "visual.goblin.shaman", "--project", project, "--format", "json"]);
    assert.equal(cookedAgain.execution.status, 0, cookedAgain.execution.stdout);
    assert.equal(cookedAgain.result.data.rendered[0].reused, true);
    const approvedJob = JSON.parse(readFileSync(
      resolve(project, ".ludivra/visual-jobs/visual.goblin.shaman/job.json"),
      "utf8"
    ));
    assert.equal(approvedJob.state, "APPROVED", "an unchanged build must preserve approval");

    const planned = runCli([
      "visual", "plan", "orc guard with a cloth texture",
      "--id", "visual.orc.guard",
      "--style", "stylized",
      "--project", project,
      "--format", "json"
    ]);
    assert.equal(planned.execution.status, 0, planned.execution.stdout);
    assert.equal(planned.result.data.state, "PLANNED");
    assert.deepEqual(planned.result.data.textureRequests, []);
    const plannedSpec = JSON.parse(readFileSync(
      resolve(project, "visuals/visual-orc-guard.character.json"),
      "utf8"
    ));
    assert.equal(plannedSpec.features.generationProfile, "compact-creature");
    assert.equal(plannedSpec.features.hands.style, "bare");
    assert.equal(plannedSpec.features.outfit.construction, "single-layer");
    assert.deepEqual(plannedSpec.surfaces, [], "first-pass planning must never wait for external visual inputs");

    const mascotPlan = runCli([
      "visual", "plan", "mascote mecanico com bone, bigode, luvas e macacao",
      "--id", "visual.mascot.mechanic",
      "--style", "stylized",
      "--project", project,
      "--format", "json"
    ]);
    assert.equal(mascotPlan.execution.status, 0, mascotPlan.execution.stdout);
    const mascotSpec = JSON.parse(readFileSync(
      resolve(project, "visuals/visual-mascot-mechanic.character.json"),
      "utf8"
    ));
    assert.equal(mascotSpec.features.generationProfile, "hero-mascot");
    assert.equal(mascotSpec.features.presentationPose, "t-pose");
    assert.equal(mascotSpec.features.headwear.type, "cap");
    assert.equal(mascotSpec.features.headwear.badge, "star");
    assert.equal(mascotSpec.features.facialHair.style, "moustache");
    assert.equal(mascotSpec.features.hands.style, "gloves");
    assert.equal(mascotSpec.features.outfit.construction, "overalls");
    assert.deepEqual(mascotSpec.surfaces, []);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("game visual compiles production-ready 2D, 2.5D and 3D character profiles", () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "ludivra-visual-production-"));
  const project = resolve(temporaryRoot, "visual-production-game");
  const engineRoot = fileURLToPath(new URL("../..", import.meta.url));
  const fixture = resolve(engineRoot, "visual-authoring/test/fixtures/production");
  try {
    assert.equal(runCli(["new", project, "--name", "Visual Production Game", "--format", "json"]).execution.status, 0);
    for (const directory of ["styles", "visuals"]) {
      cpSync(resolve(fixture, directory), resolve(project, directory), { recursive: true });
    }
    const first = runCli([
      "visual", "compile", "visual.goblin.shaman.production",
      "--project", project,
      "--format", "json"
    ]);
    assert.equal(first.execution.status, 0, first.execution.stdout);
    const [rendered] = first.result.data.rendered;
    assert.equal(rendered.validation, "passed");
    assert.equal(rendered.reused, false);
    const index = JSON.parse(readFileSync(resolve(project, ".ludivra/visual-index.json"), "utf8"));
    assert.deepEqual(index.entries.flatMap(({ outputs }) => outputs.map(({ mode }) => mode)), ["2d", "2.5d", "3d"]);
    for (const entry of index.entries) {
      for (const output of entry.outputs) {
        assert.ok(existsSync(resolve(project, output.artifact)), `${output.mode} artifact exists`);
        assert.ok(existsSync(resolve(project, output.preview)), `${output.mode} preview exists`);
      }
    }
    const manifest = JSON.parse(readFileSync(resolve(project, rendered.manifest), "utf8"));
    assert.equal(manifest.schemaVersion, 2);
    assert.equal(manifest.source.kind, "forge-recipe");
    assert.equal(manifest.generator.pipeline, "canonical-character-local");
    assert.equal(manifest.outputs.length, 3);
    assert.ok(manifest.outputs.every(({ generatedFrom }) => generatedFrom.kind === "canonical-character"));
    assert.ok(manifest.outputs.every(({ quality, validation }) =>
      quality === "production" && validation.status === "passed"
    ));

    const second = runCli([
      "visual", "compile", "visual.goblin.shaman.production",
      "--project", project,
      "--format", "json"
    ]);
    assert.equal(second.execution.status, 0, second.execution.stdout);
    assert.equal(second.result.data.rendered[0].reused, true);
    const validated = runCli([
      "visual", "validate", "visual.goblin.shaman.production",
      "--project", project,
      "--format", "json"
    ]);
    assert.equal(validated.execution.status, 0, validated.execution.stdout);
    const finalized = runCli([
      "visual", "finalize", "visual.goblin.shaman.production",
      "--project", project,
      "--format", "json"
    ]);
    assert.equal(finalized.execution.status, 0, finalized.execution.stdout);
    assert.equal(finalized.result.data.state, "APPROVED");
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("game content compiles a pack and traces a value to the line that authored it", () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "ludivra-content-"));
  const project = resolve(temporaryRoot, "content-game");
  try {
    cpSync(resolve(fileURLToPath(new URL("../..", import.meta.url)), "examples/card-roguelite"), project, {
      recursive: true,
      filter: (source) => {
        const normalized = source.replaceAll("\\", "/");
        return !normalized.includes("/.ludivra") && !normalized.includes("/reports/runs/run_");
      }
    });

    const built = runCli(["content", "build", "--project", project, "--format", "json"]);
    assert.equal(built.execution.status, 0, built.execution.stdout);
    assert.equal(built.result.data.reused, false);
    assert.match(built.result.data.sha256, /^[a-f0-9]{64}$/);
    assert.ok(existsSync(resolve(project, ".ludivra/content-pack.json")));
    assert.ok(built.result.artifacts.some(({ kind }) => kind === "content-pack"));
    const graph = JSON.parse(readFileSync(resolve(project, ".ludivra/content-pack.json"), "utf8"));
    assert.ok(graph.sections.documents.value["ludivra.scene-graph"]);

    // The stored file is exactly the canonical bytes the hash covers, so the hosts
    // compare the same identity the compiler produced.
    const storedBytes = readFileSync(resolve(project, ".ludivra/content-pack.json"));
    assert.equal(createHash("sha256").update(storedBytes).digest("hex"), built.result.data.sha256);

    // A second build with the same sources reuses the compiled pack.
    const again = runCli(["content", "build", "--project", project, "--format", "json"]);
    assert.equal(again.result.data.reused, true);
    assert.equal(again.result.data.sha256, built.result.data.sha256);

    // Every declared id is addressable, without the document id repeating itself.
    const inspected = runCli(["content", "inspect", "--project", project, "--format", "json"]);
    assert.ok(inspected.result.data.symbols.includes("ember-vault.run.card.strike"));
    assert.ok(!inspected.result.data.symbols.some((symbol) => symbol.includes("run.ember-vault.run")));

    const scene = runCli([
      "content", "inspect", "--scene", "scene.ember-vault", "--project", project, "--format", "json"
    ]);
    assert.equal(scene.execution.status, 0, scene.execution.stdout);
    assert.equal(scene.result.data.scene.root, "vault");
    assert.deepEqual(scene.result.data.scene.nodes.map(({ id }) => id), ["enemy", "hero", "vault"]);

    const explained = runCli([
      "content", "explain", "--symbol", "ember-vault.run.card.strike", "--project", project, "--format", "json"
    ]);
    assert.equal(explained.execution.status, 0);
    assert.equal(explained.result.data.origin.file, "content/run.jsonc");
    assert.equal(explained.result.data.origin.pointer, "/cards/0");
    assert.ok(explained.result.data.origin.line > 1);

    const explainedScene = runCli([
      "content", "explain", "--symbol", "scene.ember-vault.hero", "--project", project, "--format", "json"
    ]);
    assert.equal(explainedScene.execution.status, 0);
    assert.equal(explainedScene.result.data.origin.file, "scenes/ember-vault.scene.jsonc");

    const missing = runCli([
      "content", "explain", "--symbol", "absent.symbol", "--project", project, "--format", "json"
    ]);
    assert.equal(missing.execution.status, 2);
    assert.ok(missing.result.diagnostics.some(({ code }) => code === "CONTENT_SYMBOL_UNKNOWN"));

    // Editing a source changes the pack identity instead of reusing it.
    const contentPath = resolve(project, "content/run.jsonc");
    writeFileSync(contentPath, readFileSync(contentPath, "utf8").replace('"label": "Golpe"', '"label": "Golpe+"'));
    const edited = runCli(["content", "build", "--project", project, "--format", "json"]);
    assert.equal(edited.result.data.reused, false);
    assert.notEqual(edited.result.data.sha256, built.result.data.sha256);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
