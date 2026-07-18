import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(toolDirectory, "../..");
const schemaPath = resolve(root, "contracts/cli-result.schema.json");
const outputPath = resolve(root, "cli/src/generated/cli-result.ts");
const schema = JSON.parse(await readFile(schemaPath, "utf8"));

const schemaVersion = schema.properties?.schemaVersion?.const;
const statuses = schema.properties?.status?.enum;
const severities = schema.$defs?.diagnostic?.properties?.severity?.enum;

if (!Number.isInteger(schemaVersion) || !Array.isArray(statuses) || !Array.isArray(severities)) {
  throw new Error("CLI_RESULT_SCHEMA_UNSUPPORTED: expected schemaVersion, status enum and severity enum");
}

const union = (values) => values.map((value) => JSON.stringify(value)).join(" | ");
const output = `// Generated from contracts/cli-result.schema.json. Do not edit.\n\n` +
`export const CLI_RESULT_SCHEMA_VERSION = ${schemaVersion} as const;\n` +
`export type OperationStatus = ${union(statuses)};\n` +
`export type DiagnosticSeverity = ${union(severities)};\n\n` +
`export interface Diagnostic {\n` +
`  code: string;\n` +
`  severity: DiagnosticSeverity;\n` +
`  message: string;\n` +
`  file?: string;\n` +
`  details?: Record<string, unknown>;\n` +
`}\n\n` +
`export interface Artifact {\n` +
`  kind: string;\n` +
`  path: string;\n` +
`  sha256?: string;\n` +
`}\n\n` +
`export interface OperationResult {\n` +
`  schemaVersion: typeof CLI_RESULT_SCHEMA_VERSION;\n` +
`  runId: string;\n` +
`  operation: string;\n` +
`  status: OperationStatus;\n` +
`  exitCode: number;\n` +
`  durationMs: number;\n` +
`  diagnostics: Diagnostic[];\n` +
`  artifacts: Artifact[];\n` +
`  data?: Record<string, unknown>;\n` +
`  nextActions: string[];\n` +
`}\n`;

if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== output) {
    throw new Error("CLI_RESULT_BINDING_STALE: run pnpm contracts");
  }
} else {
  await writeFile(outputPath, output, "utf8");
}
