#!/usr/bin/env node

import type { Diagnostic } from "./generated/cli-result.js";
import { runDoctor } from "./commands/doctor.js";
import { runInspect } from "./commands/inspect.js";
import { runTest } from "./commands/test.js";
import { runValidate } from "./commands/validate.js";
import {
  createOperationResult,
  createRunId,
  type CommandContext,
  type CommandOutcome,
  type OutputFormat,
  writeOperationResult
} from "./result.js";

function optionValue(arguments_: string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  return index < 0 ? undefined : arguments_[index + 1];
}

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

async function dispatch(command: string, context: CommandContext): Promise<CommandOutcome> {
  switch (command) {
    case "doctor":
      return runDoctor();
    case "inspect":
      return runInspect();
    case "test":
      return runTest(context);
    case "validate":
      return runValidate();
    case "help":
      return {
        diagnostics: [],
        data: { commands: ["doctor", "inspect", "test", "validate"] },
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
const startedAt = performance.now();
const context: CommandContext = { runId: createRunId() };
let outcome: CommandOutcome;

try {
  outcome = await dispatch(command, context);
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
writeOperationResult(result, parseFormat(arguments_));
process.exitCode = result.exitCode;
