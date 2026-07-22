#!/usr/bin/env node

import type { Diagnostic } from "./generated/cli-result.js";
import { runDoctor } from "./commands/doctor.js";
import { runInspect } from "./commands/inspect.js";
import { runTest } from "./commands/test.js";
import { runValidate } from "./commands/validate.js";
import { runBuild } from "./commands/build.js";
import { runNew } from "./commands/new.js";
import { runPackage } from "./commands/package.js";
import { runGame } from "./commands/run.js";
import { runStatus } from "./commands/status.js";
import { runCapture } from "./commands/capture.js";
import { runContext } from "./commands/context.js";
import { runReplay } from "./commands/replay.js";
import { runReport } from "./commands/report.js";
import { runSimulate } from "./commands/simulate.js";
import { optionValue } from "./arguments.js";
import {
  createOperationResult,
  createRunId,
  type CommandContext,
  type CommandOutcome,
  type OutputFormat,
  writeOperationResult
} from "./result.js";
import { writeRunManifest } from "./run-manifest.js";

function parseFormat(arguments_: string[]): OutputFormat {
  const value = optionValue(arguments_, "--format");
  return value === "json" ? "json" : "text";
}

function parseMaxDiagnostics(arguments_: string[]): number | undefined {
  const value = optionValue(arguments_, "--max-diagnostics");
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

async function dispatch(command: string, context: CommandContext, arguments_: string[]): Promise<CommandOutcome> {
  switch (command) {
    case "doctor":
      return runDoctor();
    case "inspect":
      return runInspect();
    case "test":
      return runTest(context, arguments_);
    case "validate":
      return runValidate(arguments_);
    case "new":
      return runNew(arguments_);
    case "build":
      return runBuild(arguments_);
    case "package":
      return runPackage(arguments_);
    case "run":
      return runGame(context, arguments_);
    case "status":
      return runStatus(arguments_);
    case "context":
      return runContext(arguments_);
    case "simulate":
      return runSimulate(context, arguments_);
    case "capture":
      return runCapture(context, arguments_);
    case "replay":
      return runReplay(context, arguments_);
    case "report":
      return runReport(context, arguments_);
    case "help":
      return {
        diagnostics: [],
        data: { commands: ["build", "capture", "context", "doctor", "inspect", "new", "package", "replay", "report", "run", "simulate", "status", "test", "validate"] },
        nextActions: ["Run game doctor --format json"]
      };
    default:
      return {
        diagnostics: [{
          code: "COMMAND_UNKNOWN",
          severity: "error",
          message: `Unknown command: ${command}`
        }],
        nextActions: ["Run game help"]
      };
  }
}

const rawArguments = process.argv.slice(2);
const arguments_ = rawArguments[0] === "--" ? rawArguments.slice(1) : rawArguments;
const command = arguments_[0] ?? "help";
const startedAtDate = new Date();
const startedAt = performance.now();
const context: CommandContext = { runId: createRunId() };
let outcome: CommandOutcome;

try {
  outcome = await dispatch(command, context, arguments_);
} catch (error) {
  const message = error instanceof Error ? error.message : "Unexpected CLI failure";
  const diagnostic: Diagnostic = {
    code: /^[A-Z][A-Z0-9_]+$/.test(message) ? message : "CLI_INTERNAL_ERROR",
    severity: "error",
    message
  };
  outcome = { diagnostics: [diagnostic], nextActions: ["Inspect the failure and retry"] };
}

const result = createOperationResult(
  context.runId,
  command,
  startedAt,
  outcome,
  parseMaxDiagnostics(arguments_));
try {
  result.artifacts.push(await writeRunManifest(arguments_, startedAtDate, result));
} catch (error) {
  result.status = "failed";
  result.exitCode = 2;
  result.diagnostics.push({
    code: "RUN_MANIFEST_WRITE_FAILED",
    severity: "error",
    message: error instanceof Error ? error.message : "Unable to write run manifest"
  });
  result.nextActions = ["Repair run evidence output before trusting this operation"];
}
writeOperationResult(result, parseFormat(arguments_));
process.exitCode = result.exitCode;
