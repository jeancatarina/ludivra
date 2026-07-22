import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const runSchemaPath = resolve(root, "contracts/run-manifest.schema.json");
const stateSchemaPath = resolve(root, "contracts/project-state.schema.json");
const outputPath = resolve(root, "cli/src/generated/operability.ts");
const [runSchema, stateSchema] = await Promise.all([
  readFile(runSchemaPath, "utf8").then(JSON.parse),
  readFile(stateSchemaPath, "utf8").then(JSON.parse)
]);
const runVersion = runSchema.properties?.schemaVersion?.const;
const stateVersion = stateSchema.properties?.schemaVersion?.const;
const runStatuses = runSchema.properties?.status?.enum;

if (!Number.isInteger(runVersion) || !Number.isInteger(stateVersion) || !Array.isArray(runStatuses)) {
  throw new Error("OPERABILITY_SCHEMA_UNSUPPORTED");
}

const union = (values) => values.map((value) => JSON.stringify(value)).join(" | ");
const output = `// Generated from run-manifest.schema.json and project-state.schema.json. Do not edit.\n\n` +
  `export const RUN_MANIFEST_SCHEMA_VERSION = ${runVersion} as const;\n` +
  `export const PROJECT_STATE_SCHEMA_VERSION = ${stateVersion} as const;\n` +
  `export type EvidenceStatus = ${union(runStatuses)};\n\n` +
  `export interface RepositoryFingerprint { commit: string | null; dirty: boolean | null; worktreeHash: string | null; }\n` +
  `export interface RunArtifact { kind: string; path: string; sha256: string; }\n` +
  `export interface RunManifest {\n` +
  `  _generated: "game"; schemaVersion: typeof RUN_MANIFEST_SCHEMA_VERSION; runId: string; operation: string;\n` +
  `  status: EvidenceStatus; exitCode: number; startedAt: string; finishedAt: string; durationMs: number; command: string[];\n` +
  `  repositories: { engine: RepositoryFingerprint; project?: RepositoryFingerprint };\n` +
  `  toolchain: { engineVersion: string; nodeVersion: string; platform: string; architecture: string; toolchainLockSha256: string; contractsSha256: string };\n` +
  `  context: { projectId?: string; target?: string; profile?: string; scenarioId?: string; requirements?: string[] };\n` +
  `  diagnostics: Array<{ code: string; severity: "info" | "warning" | "error" }>; artifacts: RunArtifact[];\n` +
  `}\n\n` +
  `export interface ProjectLimitation { code: string; source: string; message: string; }\n` +
  `export interface ProjectState {\n` +
  `  _generated: "game status"; schemaVersion: typeof PROJECT_STATE_SCHEMA_VERSION; generatedAt: string;\n` +
  `  project: { id: string; name: string; targets: string[]; repository: RepositoryFingerprint };\n` +
  `  engine: { version: string; repository: RepositoryFingerprint };\n` +
  `  capabilities: { catalog: "engine:CAPABILITIES.json"; sha256: string; statuses: Record<"planned" | "experimental" | "stable" | "unavailable" | "deprecated", number> };\n` +
  `  evidence: { latestCompatibleRun: { runId: string; operation: string; status: EvidenceStatus; manifestPath: string } | null };\n` +
  `  limitations: ProjectLimitation[]; nextActions: string[];\n` +
  `}\n`;

if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== output) {
    throw new Error("OPERABILITY_BINDINGS_STALE: run pnpm contracts");
  }
} else {
  await writeFile(outputPath, output, "utf8");
}
