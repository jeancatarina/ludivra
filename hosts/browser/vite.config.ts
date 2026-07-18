import { readFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { parse } from "jsonc-parser";
import { defineConfig, type Plugin } from "vite";

interface GameManifest {
  name: string;
  entrypoints: {
    gameplay: string;
    presentation: string;
  };
  inputs: Array<{
    id: string;
    label: string;
    actionId: number;
    keys: string[];
  }>;
  audio?: Array<{ eventId: number; source?: string }>;
}

function withinProject(projectDirectory: string, path: string): string {
  const resolved = resolve(projectDirectory, path);
  const relation = relative(projectDirectory, resolved);
  if (relation.startsWith("..") || isAbsolute(relation)) {
    throw new Error(`entrypoint escapes the game project: ${path}`);
  }
  return resolved;
}

function gamePlugin(projectDirectory: string): Plugin {
  const virtualId = "virtual:ludivra-game";
  const resolvedVirtualId = `\0${virtualId}`;
  return {
    name: "ludivra-game-project",
    resolveId(id) {
      return id === virtualId ? resolvedVirtualId : undefined;
    },
    async load(id) {
      if (id !== resolvedVirtualId) {
        return undefined;
      }
      const manifestPath = resolve(projectDirectory, "game.jsonc");
      const errors: import("jsonc-parser").ParseError[] = [];
      const manifest = parse(await readFile(manifestPath, "utf8"), errors) as GameManifest;
      if (errors.length > 0) {
        throw new Error(`invalid game.jsonc: JSONC error ${errors[0]?.error}`);
      }
      const gameplay = await readFile(
        withinProject(projectDirectory, manifest.entrypoints.gameplay),
        "utf8"
      );
      const audioSources: string[] = [];
      for (const audio of manifest.audio ?? []) {
        if (audio.source === undefined) continue;
        const sourcePath = withinProject(projectDirectory, audio.source);
        const reference = this.emitFile({
          type: "asset",
          name: basename(sourcePath),
          source: await readFile(sourcePath)
        });
        audioSources.push(`${JSON.stringify(audio.eventId)}: import.meta.ROLLUP_FILE_URL_${reference}`);
      }
      return `export const manifest = ${JSON.stringify(manifest)};\n` +
        `export const gameplaySource = ${JSON.stringify(gameplay)};\n` +
        `export const audioSources = {${audioSources.join(",")}};`;
    }
  };
}

const projectDirectory = resolve(process.env.LUDIVRA_GAME_DIR ?? "../../examples/first-game");

export default defineConfig({
  base: process.env.LUDIVRA_BASE ?? "/",
  plugins: [gamePlugin(projectDirectory)],
  resolve: {
    alias: {
      "@game/presentation": withinProject(projectDirectory, "presentation/index.ts"),
      "@ludivra/runtime-module": resolve("../../runtime-wasm/generated/ludivra-runtime.mjs")
    }
  },
  server: {
    fs: { allow: [resolve("../.."), projectDirectory] }
  }
});
