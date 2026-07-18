// Generated from contracts/cli-result.schema.json. Do not edit.

export const CLI_RESULT_SCHEMA_VERSION = 1 as const;
export type OperationStatus = "passed" | "failed";
export type DiagnosticSeverity = "info" | "warning" | "error";

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  file?: string;
  details?: Record<string, unknown>;
}

export interface Artifact {
  kind: string;
  path: string;
  sha256?: string;
}

export interface OperationResult {
  schemaVersion: typeof CLI_RESULT_SCHEMA_VERSION;
  runId: string;
  operation: string;
  status: OperationStatus;
  exitCode: number;
  durationMs: number;
  diagnostics: Diagnostic[];
  artifacts: Artifact[];
  data?: Record<string, unknown>;
  nextActions: string[];
}
