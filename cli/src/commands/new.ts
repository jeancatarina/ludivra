import { access, cp, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { commandPositionals, optionValue } from "../arguments.js";
import { findEngineRoot } from "../repository.js";
import type { CommandOutcome } from "../result.js";

function projectId(name: string): string {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return /^[a-z]/.test(id) ? id : `game-${id}`;
}

export async function runNew(arguments_: string[]): Promise<CommandOutcome> {
  const targetArgument = commandPositionals(arguments_)[0];
  if (targetArgument === undefined) {
    return {
      diagnostics: [{ code: "NEW_TARGET_REQUIRED", severity: "error", message: "Use game new <directory>" }],
      nextActions: ["Choose an empty directory for the game"]
    };
  }
  const target = resolve(targetArgument);
  try {
    await access(target);
    return {
      diagnostics: [{ code: "NEW_TARGET_EXISTS", severity: "error", message: `Target already exists: ${target}` }],
      nextActions: ["Choose a directory that does not exist"]
    };
  } catch {
    // Expected: creation is allowed only when the target does not exist.
  }

  const root = await findEngineRoot();
  await cp(resolve(root, "examples/first-game"), target, { recursive: true, errorOnExist: true });
  const manifestPath = resolve(target, "game.jsonc");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
  const name = optionValue(arguments_, "--name") ?? basename(target);
  manifest.name = name;
  manifest.id = projectId(name);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    diagnostics: [],
    artifacts: [{ kind: "game-project", path: target }],
    data: { id: manifest.id, name, projectDirectory: target },
    nextActions: [`Run game validate --project ${target}`]
  };
}
