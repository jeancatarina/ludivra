import { randomUUID } from "node:crypto";
import {
  CLI_RESULT_SCHEMA_VERSION,
  type Artifact,
  type Diagnostic,
  type OperationResult
} from "./generated/cli-result.js";

export interface CommandOutcome {
  diagnostics: Diagnostic[];
  artifacts?: Artifact[];
  data?: Record<string, unknown>;
  nextActions?: string[];
}

export interface CommandContext {
  runId: string;
}

export type OutputFormat = "json" | "text";

export function createRunId(): string {
  return `run_${randomUUID()}`;
}

export function createOperationResult(
  runId: string,
  operation: string,
  startedAt: number,
  outcome: CommandOutcome,
  maxDiagnostics?: number
): OperationResult {
  const diagnosticTotal = outcome.diagnostics.length;
  const diagnostics = maxDiagnostics === undefined
    ? outcome.diagnostics
    : outcome.diagnostics.slice(0, maxDiagnostics);
  const failed = outcome.diagnostics.some((diagnostic) => diagnostic.severity === "error");
  const data = diagnosticTotal === diagnostics.length
    ? outcome.data
    : { ...outcome.data, diagnosticTotal, diagnosticsReturned: diagnostics.length };

  return {
    schemaVersion: CLI_RESULT_SCHEMA_VERSION,
    runId,
    operation,
    status: failed ? "failed" : "passed",
    exitCode: failed ? 2 : 0,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    diagnostics,
    artifacts: outcome.artifacts ?? [],
    ...(data === undefined ? {} : { data }),
    nextActions: outcome.nextActions ?? []
  };
}

export function writeOperationResult(result: OperationResult, format: OutputFormat): void {
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  process.stdout.write(`${result.status.toUpperCase()} ${result.operation} (${result.durationMs}ms)\n`);
  for (const diagnostic of result.diagnostics) {
    process.stdout.write(`${diagnostic.severity.toUpperCase()} ${diagnostic.code}: ${diagnostic.message}\n`);
  }
  if (result.data !== undefined) {
    process.stdout.write(`${JSON.stringify(result.data, null, 2)}\n`);
  }
}
