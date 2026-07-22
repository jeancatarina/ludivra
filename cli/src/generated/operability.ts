// Generated from run-manifest.schema.json and project-state.schema.json. Do not edit.

export const RUN_MANIFEST_SCHEMA_VERSION = 1 as const;
export const PROJECT_STATE_SCHEMA_VERSION = 1 as const;
export type EvidenceStatus = "passed" | "failed";

export interface RepositoryFingerprint { commit: string | null; dirty: boolean | null; worktreeHash: string | null; }
export interface RunArtifact { kind: string; path: string; sha256: string; }
export interface RunManifest {
  _generated: "game"; schemaVersion: typeof RUN_MANIFEST_SCHEMA_VERSION; runId: string; operation: string;
  status: EvidenceStatus; exitCode: number; startedAt: string; finishedAt: string; durationMs: number; command: string[];
  repositories: { engine: RepositoryFingerprint; project?: RepositoryFingerprint };
  toolchain: { engineVersion: string; nodeVersion: string; platform: string; architecture: string; toolchainLockSha256: string; contractsSha256: string };
  context: { projectId?: string; target?: string; profile?: string };
  diagnostics: Array<{ code: string; severity: "info" | "warning" | "error" }>; artifacts: RunArtifact[];
}

export interface ProjectLimitation { code: string; source: string; message: string; }
export interface ProjectState {
  _generated: "game status"; schemaVersion: typeof PROJECT_STATE_SCHEMA_VERSION; generatedAt: string;
  project: { id: string; name: string; targets: string[]; repository: RepositoryFingerprint };
  engine: { version: string; repository: RepositoryFingerprint };
  capabilities: { catalog: "engine:CAPABILITIES.json"; sha256: string; statuses: Record<"planned" | "experimental" | "stable" | "unavailable" | "deprecated", number> };
  evidence: { latestCompatibleRun: { runId: string; operation: string; status: EvidenceStatus; manifestPath: string } | null };
  limitations: ProjectLimitation[]; nextActions: string[];
}
