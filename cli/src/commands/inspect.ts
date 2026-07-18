import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { findEngineRoot } from "../repository.js";
import type { CommandOutcome } from "../result.js";

export async function runInspect(): Promise<CommandOutcome> {
  const root = await findEngineRoot();
  const packageManifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const capabilityCatalog = JSON.parse(await readFile(resolve(root, "CAPABILITIES.json"), "utf8"));

  return {
    diagnostics: [],
    data: {
      id: packageManifest.name,
      version: packageManifest.version,
      root,
      capabilities: capabilityCatalog.capabilities,
      platforms: capabilityCatalog.platforms
    },
    nextActions: ["Run game doctor --format json before development"]
  };
}

