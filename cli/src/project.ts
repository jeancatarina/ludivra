import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse, type ParseError } from "jsonc-parser";
import { optionValue } from "./arguments.js";

export interface GameManifest {
  schemaVersion: number;
  id: string;
  name: string;
  targets: string[];
  entrypoints: { gameplay: string; presentation: string };
  steam?: { appId: number | null; depotId: number | null };
  desktop?: { updates?: { enabled: boolean; feedUrl: string | null } };
}

export async function resolveProjectDirectory(arguments_: string[]): Promise<string> {
  const explicit = optionValue(arguments_, "--project");
  const candidate = resolve(explicit ?? process.cwd());
  try {
    await access(resolve(candidate, "game.jsonc"));
    return candidate;
  } catch {
    throw new Error("GAME_PROJECT_NOT_FOUND");
  }
}

export async function readGameManifest(projectDirectory: string): Promise<GameManifest> {
  const errors: ParseError[] = [];
  const manifest = parse(
    await readFile(resolve(projectDirectory, "game.jsonc"), "utf8"),
    errors
  ) as GameManifest;
  if (errors.length > 0) {
    throw new Error("GAME_MANIFEST_INVALID_JSONC");
  }
  return manifest;
}
