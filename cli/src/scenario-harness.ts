import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { parse, type ParseError } from "jsonc-parser";
import { optionValue } from "./arguments.js";
import { hashArtifactPath } from "./artifact-hash.js";
import { LocalControlClient } from "./control-client.js";
import { createContractValidator } from "./contract-validator.js";
import type { Artifact, Diagnostic } from "./generated/cli-result.js";
import type { ControlOperation, ControlPayload, ControlResponse } from "./generated/control-protocol.js";
import { runProcess } from "./process-runner.js";
import { readGameManifest, resolveProjectDirectory } from "./project.js";
import { findEngineRoot } from "./repository.js";
import type { CommandContext, CommandOutcome } from "./result.js";

interface ScenarioStep {
  operation: "act" | "wait_for" | "inspect" | "capture" | "metrics";
  action?: string;
  valueMilli?: number;
  condition?: Record<string, unknown>;
  maxTicks?: number;
  name?: string;
}

interface ScenarioAssertion {
  type: "integer-equals" | "ui-node" | "replay-verifies";
  key?: number;
  equals?: number;
  id?: string;
  visible?: boolean;
}

export interface ScenarioDefinition {
  schemaVersion: 1;
  id: string;
  requirements: string[];
  seed: number;
  timeoutMs: number;
  steps: ScenarioStep[];
  assertions: ScenarioAssertion[];
}

interface InspectionData {
  logicalState: { tick: string; stateHash: string; integers: Array<{ key: number; value: string }> };
  uiViewModel: { nodes: Array<{ id: string }> };
  renderedUiSnapshot: { nodes: Array<{ id: string; visible: boolean }> };
  timeline: unknown[];
  replayBase64: string;
}

function withinProject(project: string, path: string): string {
  const resolved = resolve(project, path);
  const relation = relative(project, resolved);
  if (relation.startsWith("..") || isAbsolute(relation)) throw new Error("SCENARIO_PATH_ESCAPE");
  return resolved;
}

async function existingWithinProject(project: string, path: string): Promise<string> {
  const candidate = withinProject(project, path);
  const [actualProject, actualCandidate] = await Promise.all([realpath(project), realpath(candidate)]);
  const relation = relative(actualProject, actualCandidate);
  if (relation.startsWith("..") || isAbsolute(relation)) throw new Error("SCENARIO_PATH_ESCAPE");
  return actualCandidate;
}

async function loadScenario(engineRoot: string, project: string, arguments_: string[]): Promise<{ scenario: ScenarioDefinition; path: string; source: string }> {
  const manifest = await readGameManifest(project);
  const configured = optionValue(arguments_, "--scenario") ?? manifest.scenarios[0];
  if (configured === undefined) throw new Error("SCENARIO_NOT_CONFIGURED");
  const path = await existingWithinProject(project, configured);
  const source = await readFile(path, "utf8");
  const errors: ParseError[] = [];
  const scenario = parse(source, errors) as ScenarioDefinition;
  if (errors.length > 0) throw new Error("SCENARIO_JSONC_INVALID");
  const [controlSchema, scenarioSchema] = await Promise.all([
    readFile(resolve(engineRoot, "contracts/control-protocol.schema.json"), "utf8").then(JSON.parse),
    readFile(resolve(engineRoot, "schemas/scenario.schema.json"), "utf8").then(JSON.parse)
  ]);
  const ajv = createContractValidator();
  ajv.addSchema(controlSchema);
  const validate = ajv.compile(scenarioSchema);
  if (!validate(scenario)) {
    throw new Error(`SCENARIO_SCHEMA_INVALID:${validate.errors?.map((error) => `${error.instancePath} ${error.message}`).join("; ")}`);
  }
  return { scenario, path, source };
}

async function prepareHarness(engineRoot: string): Promise<void> {
  for (const [command, arguments_] of [
    ["pnpm", ["--filter", "@ludivra/runtime-web", "build"]],
    ["pnpm", ["build:wasm"]]
  ] as const) {
    const result = await runProcess(command, [...arguments_], { cwd: engineRoot, env: process.env });
    if (result.exitCode !== 0) throw new Error(`SCENARIO_PREPARATION_FAILED:${result.output.trim()}`);
  }
}

function stepPayload(step: ScenarioStep): ControlPayload {
  switch (step.operation) {
    case "act":
      return { action: step.action as string, ...(step.valueMilli === undefined ? {} : { valueMilli: step.valueMilli }) };
    case "wait_for":
      return { condition: step.condition as Record<string, unknown>, maxTicks: step.maxTicks as number };
    case "capture":
      return { name: step.name as string };
    case "inspect":
    case "metrics":
      return {};
  }
}

async function artifact(kind: string, path: string): Promise<Artifact> {
  return { kind, path, sha256: await hashArtifactPath(path) };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function runScenarioCommand(context: CommandContext, arguments_: string[], forceCapture: boolean): Promise<CommandOutcome> {
  const engineRoot = await findEngineRoot();
  const project = await resolveProjectDirectory(arguments_);
  const { scenario, path: scenarioPath, source } = await loadScenario(engineRoot, project, arguments_);
  await prepareHarness(engineRoot);
  const runDirectory = resolve(project, "reports/runs", context.runId);
  const screenshots = resolve(runDirectory, "screenshots");
  const traces = resolve(runDirectory, "traces");
  const replays = resolve(runDirectory, "replays");
  await Promise.all([mkdir(screenshots, { recursive: true }), mkdir(traces, { recursive: true }), mkdir(replays, { recursive: true })]);
  const diagnostics: Diagnostic[] = [];
  const captures: Array<{ name: string; path: string; data: Record<string, unknown> }> = [];
  let inspection: InspectionData | undefined;
  let metrics: Record<string, unknown> = {};
  const client = await LocalControlClient.start(engineRoot, project, scenario.timeoutMs);
  try {
    const loaded = await client.request("load_scenario", { scenarioId: scenario.id, seed: scenario.seed });
    if (loaded.status !== "PASS") throw new Error(loaded.diagnostic?.code ?? "SCENARIO_LOAD_FAILED");
    for (const step of scenario.steps) {
      const response = await client.request(step.operation as ControlOperation, stepPayload(step));
      if (response.status !== "PASS") {
        diagnostics.push({
          code: response.diagnostic?.code ?? "SCENARIO_STEP_FAILED",
          severity: "error",
          message: response.diagnostic?.message ?? `Scenario step failed: ${step.operation}`,
          file: scenarioPath
        });
        break;
      }
      if (step.operation === "inspect") inspection = response.data as InspectionData;
      if (step.operation === "metrics") metrics = response.data as Record<string, unknown>;
      if (step.operation === "capture") {
        const data = response.data as Record<string, unknown> & { name: string; svg: string };
        const capturePath = resolve(screenshots, `${data.name}.svg`);
        await writeFile(capturePath, data.svg, "utf8");
        captures.push({ name: data.name, path: capturePath, data });
      }
    }
    const inspected = await client.request("inspect", {});
    if (inspected.status !== "PASS") throw new Error(inspected.diagnostic?.code ?? "SCENARIO_INSPECT_FAILED");
    inspection = inspected.data as InspectionData;
    const measured = await client.request("metrics", {});
    if (measured.status === "PASS") metrics = measured.data as Record<string, unknown>;
    if (forceCapture && captures.length === 0) {
      const captured = await client.request("capture", { name: "final" });
      if (captured.status !== "PASS") throw new Error(captured.diagnostic?.code ?? "SCENARIO_CAPTURE_FAILED");
      const data = captured.data as Record<string, unknown> & { name: string; svg: string };
      const capturePath = resolve(screenshots, "final.svg");
      await writeFile(capturePath, data.svg, "utf8");
      captures.push({ name: "final", path: capturePath, data });
    }

    for (const assertion of scenario.assertions) {
      if (assertion.type === "integer-equals") {
        const value = inspection.logicalState.integers.find(({ key }) => key === assertion.key)?.value;
        if (value !== String(assertion.equals)) diagnostics.push({ code: "SCENARIO_ASSERT_INTEGER", severity: "error", message: `Expected integer ${assertion.key} to equal ${assertion.equals}, got ${value ?? "missing"}`, file: scenarioPath });
      } else if (assertion.type === "ui-node") {
        const node = inspection.renderedUiSnapshot.nodes.find(({ id }) => id === assertion.id);
        if (node === undefined || node.visible !== assertion.visible) diagnostics.push({ code: "SCENARIO_ASSERT_UI", severity: "error", message: `Expected UI node ${assertion.id} visibility to be ${assertion.visible}`, file: scenarioPath });
      } else {
        const verified = await client.request("verify_replay", { archiveBase64: inspection.replayBase64 });
        if (verified.status !== "PASS") diagnostics.push({ code: "SCENARIO_ASSERT_REPLAY", severity: "error", message: verified.diagnostic?.message ?? "Replay verification failed", file: scenarioPath });
      }
    }
  } catch (error) {
    diagnostics.push({
      code: error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : "SCENARIO_HARNESS_FAILED",
      severity: "error",
      message: error instanceof Error ? error.message : "Scenario harness failed",
      file: scenarioPath
    });
  } finally {
    await client.close();
  }

  if (inspection === undefined) {
    inspection = {
      logicalState: { tick: "0", stateHash: "unavailable", integers: [] },
      uiViewModel: { nodes: [] },
      renderedUiSnapshot: { nodes: [] },
      timeline: [],
      replayBase64: ""
    };
  }
  const replayPath = resolve(replays, `${scenario.id}.lreplay`);
  const tracePath = resolve(traces, "causal-trace.json");
  const commandsPath = resolve(runDirectory, "commands.json");
  const diagnosticsPath = resolve(runDirectory, "diagnostics.json");
  const metricsPath = resolve(runDirectory, "metrics.json");
  const logicalPath = resolve(runDirectory, "logical-state.json");
  const uiPath = resolve(runDirectory, "ui-view-model.json");
  const renderedPath = resolve(runDirectory, "rendered-ui-snapshot.json");
  const scenarioCopyPath = resolve(runDirectory, "scenario.jsonc");
  const summaryPath = resolve(runDirectory, "summary.md");
  await Promise.all([
    writeFile(replayPath, Buffer.from(inspection.replayBase64, "base64")),
    writeJson(tracePath, inspection.timeline),
    writeJson(commandsPath, client.commands),
    writeJson(diagnosticsPath, diagnostics),
    writeJson(metricsPath, metrics),
    writeJson(logicalPath, inspection.logicalState),
    writeJson(uiPath, inspection.uiViewModel),
    writeJson(renderedPath, inspection.renderedUiSnapshot),
    writeFile(scenarioCopyPath, source, "utf8"),
    writeFile(summaryPath, `# Scenario ${scenario.id}\n\n- Status: ${diagnostics.some(({ severity }) => severity === "error") ? "FAIL" : "PASS"}\n- Requirements: ${scenario.requirements.join(", ") || "none"}\n- Tick: ${inspection.logicalState.tick}\n- State hash: ${inspection.logicalState.stateHash}\n- Captures: ${captures.length}\n- Replay: ${relative(runDirectory, replayPath)}\n`, "utf8")
  ]);
  const artifacts = await Promise.all([
    artifact("scenario-summary", summaryPath),
    artifact("scenario-source", scenarioCopyPath),
    artifact("control-commands", commandsPath),
    artifact("scenario-diagnostics", diagnosticsPath),
    artifact("scenario-metrics", metricsPath),
    artifact("logical-state", logicalPath),
    artifact("ui-view-model", uiPath),
    artifact("rendered-ui-snapshot", renderedPath),
    artifact("causal-trace", tracePath),
    artifact("replay", replayPath),
    ...await Promise.all(captures.map((capture) => artifact("screenshot-svg", capture.path)))
  ]);
  return {
    diagnostics,
    artifacts,
    data: {
      project,
      scenarioId: scenario.id,
      requirements: scenario.requirements,
      tick: inspection.logicalState.tick,
      stateHash: inspection.logicalState.stateHash,
      captures: captures.map(({ name, path }) => ({ name, path })),
      replay: replayPath,
      metrics
    },
    nextActions: diagnostics.length === 0
      ? [`Run game replay --project ${project} --scenario ${relative(project, scenarioPath)} --replay ${relative(project, replayPath)}`]
      : ["Inspect diagnostics.json and causal-trace.json, repair the scenario or gameplay, and rerun"]
  };
}

export async function runReplayCommand(context: CommandContext, arguments_: string[]): Promise<CommandOutcome> {
  const engineRoot = await findEngineRoot();
  const project = await resolveProjectDirectory(arguments_);
  const replayArgument = optionValue(arguments_, "--replay");
  if (replayArgument === undefined) return { diagnostics: [{ code: "REPLAY_PATH_REQUIRED", severity: "error", message: "Use --replay <project-relative-path>" }], nextActions: ["Generate a replay with game simulate"] };
  const replayPath = await existingWithinProject(project, replayArgument);
  const replay = await readFile(replayPath);
  const { scenario } = await loadScenario(engineRoot, project, arguments_);
  await prepareHarness(engineRoot);
  const client = await LocalControlClient.start(engineRoot, project, scenario.timeoutMs);
  let response: ControlResponse;
  try {
    await client.request("load_scenario", { scenarioId: scenario.id, seed: scenario.seed });
    response = await client.request("verify_replay", { archiveBase64: replay.toString("base64") });
  } finally {
    await client.close();
  }
  const runDirectory = resolve(project, "reports/runs", context.runId);
  await mkdir(runDirectory, { recursive: true });
  const commandsPath = resolve(runDirectory, "commands.json");
  await writeJson(commandsPath, client.commands);
  return {
    diagnostics: response.status === "PASS" ? [] : [{ code: response.diagnostic?.code ?? "REPLAY_VERIFY_FAILED", severity: "error", message: response.diagnostic?.message ?? "Replay verification failed", file: replayPath }],
    artifacts: [await artifact("verified-replay", replayPath), await artifact("control-commands", commandsPath)],
    data: { project, scenarioId: scenario.id, replay: replayPath, verified: response.status === "PASS" },
    nextActions: response.status === "PASS" ? ["Use game report to summarize this evidence"] : ["Reproduce with game simulate and inspect the first divergent change"]
  };
}
