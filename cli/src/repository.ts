import { access } from "node:fs/promises";
import { dirname, parse, resolve } from "node:path";

const rootMarkers = ["architecture.md", "AGENTS.md", "package.json"] as const;

async function containsRootMarkers(directory: string): Promise<boolean> {
  try {
    await Promise.all(rootMarkers.map((marker) => access(resolve(directory, marker))));
    return true;
  } catch {
    return false;
  }
}

export async function findEngineRoot(startDirectory = process.cwd()): Promise<string> {
  let candidate = resolve(startDirectory);
  const filesystemRoot = parse(candidate).root;

  while (true) {
    if (await containsRootMarkers(candidate)) {
      return candidate;
    }
    if (candidate === filesystemRoot) {
      throw new Error("ENGINE_ROOT_NOT_FOUND");
    }
    candidate = dirname(candidate);
  }
}

