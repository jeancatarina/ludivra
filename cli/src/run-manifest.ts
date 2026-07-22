import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { optionValue } from "./arguments.js";
import { hashArtifactPath, sha256 } from "./artifact-hash.js";
import { createContractValidator } from "./contract-validator.js";
import {
  RUN_MANIFEST_SCHEMA_VERSION,
  type RunArtifact,
  type RunManifest
} from "./generated/operability.js";
import { readGameManifest } from "./project.js";
import { findEngineRoot } from "./repository.js";
import { repositoryFingerprint } from "./repository-state.js";
import type { OperationResult } from "./generated/cli-result.js";

function sanitizeCommand(arguments_: string[]): string[] {
  const sanitized = ["game"];
  let redactNext = false;
  for (const argument of arguments_) {
    if (redactNext) {
      sanitized.push("<redacted>");
      redactNext = false;
      continue;
    }
    if (/^--(?:token|secret|password|api-key|private-key)=/i.test(argument)) {
      sanitized.push(`${argument.slice(0, argument.indexOf("="))}=<redacted>`);
      continue;
    }
    sanitized.push(argument);
    redactNext = /^--(?:token|secret|password|api-key|private-key)$/i.test(argument);
  }
  return sanitized;
}

async function projectFromResult(arguments_: string[], result: OperationResult): Promise<string | undefined> {
  const explicit = optionValue(arguments_, "--project");
  const candidates: string[] = [];
  if (explicit !== undefined) candidates.push(resolve(explicit));
  for (const key of ["projectDirectory", "project"] as const) {
    const value = result.data?.[key];
    if (typeof value === "string") candidates.push(resolve(value));
  }
  for (const candidate of candidates) {
    if (await access(resolve(candidate, "game.jsonc")).then(() => true).catch(() => false)) return candidate;
  }
  return undefined;
}

async function artifactRecord(engineRoot: string, evidenceRoot: string, artifact: OperationResult["artifacts"][number]): Promise<RunArtifact> {
  const absolutePath = isAbsolute(artifact.path) ? artifact.path : resolve(engineRoot, artifact.path);
  const displayPath = relative(evidenceRoot, absolutePath);
  return {
    kind: artifact.kind,
    path: displayPath.startsWith("..") ? absolutePath : displayPath || ".",
    sha256: artifact.sha256 ?? await hashArtifactPath(absolutePath)
  };
}

export async function writeRunManifest(
  arguments_: string[],
  startedAt: Date,
  result: OperationResult
): Promise<{ kind: string; path: string; sha256: string }> {
  const engineRoot = await findEngineRoot();
  const project = await projectFromResult(arguments_, result);
  const evidenceRoot = project ?? engineRoot;
  const runDirectory = resolve(evidenceRoot, "reports/runs", result.runId);
  const manifestPath = resolve(runDirectory, "manifest.json");
  const [packageManifest, toolchainHash, contractsHash, schemasHash, engineRepository, projectRepository] = await Promise.all([
    readFile(resolve(engineRoot, "package.json"), "utf8").then(JSON.parse),
    hashArtifactPath(resolve(engineRoot, "toolchain.lock")),
    hashArtifactPath(resolve(engineRoot, "contracts")),
    hashArtifactPath(resolve(engineRoot, "schemas")),
    repositoryFingerprint(engineRoot),
    project === undefined ? Promise.resolve(undefined) : repositoryFingerprint(project)
  ]);
  const projectManifest = project === undefined
    ? undefined
    : await readGameManifest(project).catch(() => undefined);
  const artifacts = await Promise.all(result.artifacts.map((artifact) => artifactRecord(engineRoot, evidenceRoot, artifact)));
  const target = optionValue(arguments_, "--target");
  const profile = optionValue(arguments_, "--profile");
  const context: RunManifest["context"] = {};
  if (projectManifest !== undefined) context.projectId = projectManifest.id;
  if (target !== undefined) context.target = target;
  if (profile !== undefined) context.profile = profile;
  if (typeof result.data?.scenarioId === "string") context.scenarioId = result.data.scenarioId;
  if (Array.isArray(result.data?.requirements) && result.data.requirements.every((value) => typeof value === "string")) {
    context.requirements = result.data.requirements as string[];
  }

  const manifest: RunManifest = {
    _generated: "game",
    schemaVersion: RUN_MANIFEST_SCHEMA_VERSION,
    runId: result.runId,
    operation: result.operation,
    status: result.status,
    exitCode: result.exitCode,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: result.durationMs,
    command: sanitizeCommand(arguments_),
    repositories: {
      engine: engineRepository,
      ...(projectRepository === undefined ? {} : { project: projectRepository })
    },
    toolchain: {
      engineVersion: String(packageManifest.version),
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      toolchainLockSha256: toolchainHash,
      contractsSha256: sha256(`${contractsHash}\0${schemasHash}`)
    },
    context,
    diagnostics: result.diagnostics.map(({ code, severity }) => ({ code, severity })),
    artifacts
  };

  const schema = JSON.parse(await readFile(resolve(engineRoot, "contracts/run-manifest.schema.json"), "utf8"));
  const validate = createContractValidator().compile(schema);
  if (!validate(manifest)) {
    throw new Error(`RUN_MANIFEST_INVALID:${validate.errors?.map((error) => `${error.instancePath} ${error.message}`).join("; ")}`);
  }

  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  await mkdir(runDirectory, { recursive: true });
  await writeFile(manifestPath, serialized, "utf8");
  return {
    kind: "run-manifest",
    path: relative(evidenceRoot, manifestPath),
    sha256: sha256(serialized)
  };
}
