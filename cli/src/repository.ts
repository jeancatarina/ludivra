import { access } from "node:fs/promises";
import { dirname, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootMarkers = ["architecture.md", "AGENTS.md", "package.json"] as const;

async function containsRootMarkers(directory: string): Promise<boolean> {
  try {
    await Promise.all(rootMarkers.map((marker) => access(resolve(directory, marker))));
    return true;
  } catch {
    return false;
  }
}

async function searchForEngineRoot(startDirectory: string): Promise<string | undefined> {
  let candidate = resolve(startDirectory);
  const filesystemRoot = parse(candidate).root;

  while (true) {
    if (await containsRootMarkers(candidate)) {
      return candidate;
    }
    if (candidate === filesystemRoot) {
      return undefined;
    }
    candidate = dirname(candidate);
  }
}

export async function findEngineRoot(startDirectory = process.cwd()): Promise<string> {
  const fromWorkingDirectory = await searchForEngineRoot(startDirectory);
  if (fromWorkingDirectory !== undefined) {
    return fromWorkingDirectory;
  }
  const fromInstallation = await searchForEngineRoot(dirname(fileURLToPath(import.meta.url)));
  if (fromInstallation !== undefined) {
    return fromInstallation;
  }
  throw new Error("ENGINE_ROOT_NOT_FOUND");
}
