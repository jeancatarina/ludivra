import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { hashArtifactPath, sha256 } from "./artifact-hash.js";
import { createContractValidator } from "./contract-validator.js";
import {
  PROJECT_STATE_SCHEMA_VERSION,
  type ProjectLimitation,
  type ProjectState,
  type RunManifest
} from "./generated/operability.js";
import { readGameManifest } from "./project.js";
import { findEngineRoot } from "./repository.js";
import { repositoriesMatch, repositoryFingerprint } from "./repository-state.js";

interface CapabilityCatalog {
  capabilities: Array<{
    id: string;
    status: "planned" | "experimental" | "stable" | "unavailable" | "deprecated";
    limitations: Array<{ code: string; message: string }>;
  }>;
  platforms: Record<string, "planned" | "experimental" | "stable" | "unavailable" | "deprecated">;
}

const targetPlatforms: Record<string, string> = {
  browser: "browser",
  desktop: "electron",
  android: "android",
  ios: "ios",
  "native-headless": "native-headless"
};

async function readRunManifests(root: string): Promise<Array<{ manifest: RunManifest; path: string }>> {
  const directory = resolve(root, "reports/runs");
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const manifests: Array<{ manifest: RunManifest; path: string }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = resolve(directory, entry.name, "manifest.json");
    const manifest = await readFile(path, "utf8").then(JSON.parse).catch(() => undefined) as RunManifest | undefined;
    if (manifest !== undefined && manifest.schemaVersion === 1) manifests.push({ manifest, path });
  }
  return manifests.sort((left, right) => right.manifest.finishedAt.localeCompare(left.manifest.finishedAt));
}

function capabilityStatuses(catalog: CapabilityCatalog): ProjectState["capabilities"]["statuses"] {
  const statuses = { planned: 0, experimental: 0, stable: 0, unavailable: 0, deprecated: 0 };
  for (const capability of catalog.capabilities) statuses[capability.status] += 1;
  return statuses;
}

function collectLimitations(catalog: CapabilityCatalog, targets: string[], steamConfigured: boolean): ProjectLimitation[] {
  const limitations: ProjectLimitation[] = [];
  for (const target of targets) {
    const platform = targetPlatforms[target];
    const status = platform === undefined ? undefined : catalog.platforms[platform];
    if (platform !== undefined && status !== undefined && status !== "stable") {
      limitations.push({
        code: `TARGET_${platform.replaceAll("-", "_").toUpperCase()}_${status.toUpperCase()}`,
        source: `platform:${platform}`,
        message: `Target ${target} is ${status}.`
      });
    }
  }
  if (!steamConfigured && targets.includes("desktop")) {
    limitations.push({
      code: "STEAM_IDS_NOT_CONFIGURED",
      source: "game.jsonc",
      message: "Steam App ID and Depot ID are not configured."
    });
  }
  for (const capability of catalog.capabilities) {
    for (const limitation of capability.limitations) {
      limitations.push({ ...limitation, source: `capability:${capability.id}` });
    }
  }
  return limitations;
}

export async function writeProjectState(projectDirectory: string): Promise<{
  state: ProjectState;
  artifact: { kind: string; path: string; sha256: string };
}> {
  const engineRoot = await findEngineRoot();
  const [game, packageManifest, catalogText, engineRepository, projectRepository] = await Promise.all([
    readGameManifest(projectDirectory),
    readFile(resolve(engineRoot, "package.json"), "utf8").then(JSON.parse),
    readFile(resolve(engineRoot, "CAPABILITIES.json"), "utf8"),
    repositoryFingerprint(engineRoot),
    repositoryFingerprint(projectDirectory)
  ]);
  const catalog = JSON.parse(catalogText) as CapabilityCatalog;
  const runManifests = await readRunManifests(projectDirectory);
  const compatible = runManifests.find(({ manifest }) => {
    if (!repositoriesMatch(manifest.repositories.engine, engineRepository)) return false;
    return manifest.repositories.project === undefined || repositoriesMatch(manifest.repositories.project, projectRepository);
  });
  const steamConfigured = game.steam?.appId !== null && game.steam?.appId !== undefined &&
    game.steam.depotId !== null && game.steam.depotId !== undefined;
  const latestCompatibleRun = compatible === undefined ? null : {
    runId: compatible.manifest.runId,
    operation: compatible.manifest.operation,
    status: compatible.manifest.status,
    manifestPath: relative(projectDirectory, compatible.path)
  };
  const nextActions = latestCompatibleRun === null
    ? [`Run game validate --project ${projectDirectory} --format json`]
    : latestCompatibleRun.status === "failed"
      ? [`Inspect ${latestCompatibleRun.manifestPath} and repair the recorded diagnostics`]
      : ["Continue with the first pending item in BACKLOG.md"];
  const state: ProjectState = {
    _generated: "game status",
    schemaVersion: PROJECT_STATE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    project: { id: game.id, name: game.name, targets: game.targets, repository: projectRepository },
    engine: { version: String(packageManifest.version), repository: engineRepository },
    capabilities: {
      catalog: "engine:CAPABILITIES.json",
      sha256: sha256(catalogText),
      statuses: capabilityStatuses(catalog)
    },
    evidence: { latestCompatibleRun },
    limitations: collectLimitations(catalog, game.targets, steamConfigured),
    nextActions
  };

  const schema = JSON.parse(await readFile(resolve(engineRoot, "contracts/project-state.schema.json"), "utf8"));
  const validate = createContractValidator().compile(schema);
  if (!validate(state)) {
    throw new Error(`PROJECT_STATE_INVALID:${validate.errors?.map((error) => `${error.instancePath} ${error.message}`).join("; ")}`);
  }
  const statePath = resolve(projectDirectory, ".ludivra/project-state.json");
  const serialized = `${JSON.stringify(state, null, 2)}\n`;
  await mkdir(resolve(projectDirectory, ".ludivra"), { recursive: true });
  await writeFile(statePath, serialized, "utf8");
  return {
    state,
    artifact: { kind: "project-state", path: statePath, sha256: await hashArtifactPath(statePath) }
  };
}
