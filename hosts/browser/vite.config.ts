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
  content?: Array<{ id: string; schema: string; source: string }>;
  inputs: Array<{
    id: string;
    label: string;
    actionId: number;
    keys: string[];
  }>;
  audio?: Array<{ eventId: number; source?: string; recipe?: string }>;
}

interface CookedAudioIndex {
  generatorVersion: number;
  entries: Array<{ id: string; recipe: string; output: string; sha256: string }>;
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
      // Recipes are resolved by the Audio Forge, never by this plugin: the host
      // consumes the cooked index and stays out of synthesis.
      const cookedIndex = JSON.parse(
        await readFile(resolve(projectDirectory, ".ludivra/audio-index.json"), "utf8").catch(() => "null")
      ) as CookedAudioIndex | null;

      const audioSources: string[] = [];
      for (const audio of manifest.audio ?? []) {
        if (audio.source === undefined && audio.recipe === undefined) continue;
        let assetPath: string;
        if (audio.recipe !== undefined) {
          const cooked = cookedIndex?.entries.find((entry) => entry.recipe === audio.recipe);
          if (cooked === undefined) {
            throw new Error(
              `audio recipe ${audio.recipe} has no cooked output; run game audio render before building`
            );
          }
          assetPath = withinProject(projectDirectory, cooked.output);
        } else {
          assetPath = withinProject(projectDirectory, audio.source as string);
        }
        const sourcePath = assetPath;
        const reference = this.emitFile({
          type: "asset",
          name: basename(sourcePath),
          source: await readFile(sourcePath)
        });
        audioSources.push(`${JSON.stringify(audio.eventId)}: import.meta.ROLLUP_FILE_URL_${reference}`);
      }
      // The compiled pack is embedded as bytes; the plugin never composes content
      // into the script, and it never compiles content itself.
      const packSource = await readFile(resolve(projectDirectory, ".ludivra/content-pack.json"), "utf8")
        .catch(() => {
          throw new Error("content pack is missing; run game content build before building");
        });
      return `export const manifest = ${JSON.stringify(manifest)};\n` +
        `export const gameplaySource = ${JSON.stringify(gameplay)};\n` +
        `export const contentPackSource = ${JSON.stringify(packSource)};\n` +
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
