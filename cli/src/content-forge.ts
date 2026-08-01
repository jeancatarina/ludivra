import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  compileContentPack,
  compileSceneGraph,
  contentPackCacheKey,
  readContentPack,
  PREFAB_SCHEMA_ID,
  SCENE_GRAPH_DOCUMENT_ID,
  SCENE_SCHEMA_ID,
  type ContentDocumentInput,
  type SceneGraphSource,
  type SymbolOrigin
} from "@ludivra/content-compiler";
import { parse, type ParseError } from "jsonc-parser";
import { optionValue } from "./arguments.js";
import { hashArtifactPath } from "./artifact-hash.js";
import type { Artifact, Diagnostic } from "./generated/cli-result.js";
import { readGameManifest, resolveProjectDirectory } from "./project.js";
import { findEngineRoot } from "./repository.js";
import type { CommandContext, CommandOutcome } from "./result.js";

/** Derived, regenerable and ignored by Git, like every other compiled artifact. */
export const CONTENT_PACK_FILE = ".ludivra/content-pack.json";

/**
 * Cache bookkeeping lives beside the pack, never inside it. The pack file must be
 * exactly the canonical bytes its hash covers, or the identity the hosts compare
 * would not be the identity the compiler produced.
 */
const CONTENT_PACK_META_FILE = ".ludivra/content-pack.meta.json";

export interface ContentPackResult {
  path: string;
  sha256: string;
  cacheKey: string;
  reused: boolean;
  symbols: string[];
  diagnostics: Diagnostic[];
}

/**
 * Compiles the project content into the pack the hosts load. The JSONC documents
 * stay the only editable source; this output is identified by the hash of its
 * canonical bytes, so two hosts either load the same content or disagree loudly.
 */
export async function ensureContentPack(project: string): Promise<ContentPackResult> {
  const manifest = await readGameManifest(project);
  const diagnostics: Diagnostic[] = [];
  const documents: ContentDocumentInput[] = [];

  for (const descriptor of manifest.content ?? []) {
    const file = resolve(project, descriptor.source);
    const source = await readFile(file, "utf8");
    const errors: ParseError[] = [];
    const value = parse(source, errors) as unknown;
    if (errors.length > 0) {
      diagnostics.push({
        code: "CONTENT_UNREADABLE",
        severity: "error",
        message: `${descriptor.source} is not valid JSONC`,
        file: descriptor.source
      });
      continue;
    }
    documents.push({ id: descriptor.id, schema: descriptor.schema, file: descriptor.source, source, value });
  }

  const compositionSources = async (
    kind: "scene" | "prefab",
    descriptors: ReadonlyArray<{ id: string; source: string }>,
    schema: string
  ): Promise<SceneGraphSource[]> => {
    const sources: SceneGraphSource[] = [];
    for (const descriptor of descriptors) {
      const file = resolve(project, descriptor.source);
      try {
        const source = await readFile(file, "utf8");
        const errors: ParseError[] = [];
        const value = parse(source, errors) as unknown;
        if (errors.length > 0) {
          diagnostics.push({
            code: "SCENE_SCHEMA_INVALID",
            severity: "error",
            message: `${descriptor.source} is not valid JSONC`,
            file: descriptor.source
          });
          continue;
        }
        sources.push({ id: descriptor.id, file: descriptor.source, value });
        documents.push({ id: descriptor.id, schema, file: descriptor.source, source, value });
      } catch (error) {
        diagnostics.push({
          code: "SCENE_SCHEMA_INVALID",
          severity: "error",
          message: error instanceof Error ? error.message : `Unable to read ${descriptor.source}`,
          file: descriptor.source
        });
      }
    }
    return sources;
  };

  const scenes = await compositionSources("scene", manifest.composition?.scenes ?? [], SCENE_SCHEMA_ID);
  const prefabs = await compositionSources("prefab", manifest.composition?.prefabs ?? [], PREFAB_SCHEMA_ID);
  if (scenes.length > 0 || prefabs.length > 0) {
    try {
      const sceneGraph = compileSceneGraph({ scenes, prefabs });
      documents.push({
        id: SCENE_GRAPH_DOCUMENT_ID,
        file: "generated:scene-graph",
        source: new TextDecoder().decode(sceneGraph.bytes),
        value: sceneGraph.graph
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scene graph compilation failed";
      const code = message.match(/^(?:SCENE|PREFAB)_[A-Z_]+/)?.[0] ?? "SCENE_SCHEMA_INVALID";
      diagnostics.push({ code, severity: "error", message });
    }
  }

  // The manifest binding is a document like any other: it is how gameplay reaches
  // action ids and state keys without repeating them.
  const binding = {
    inputs: manifest.inputs.map(({ id, actionId }) => ({ id, actionId })),
    inspection: {
      integerStates: manifest.inspection.integerStates.map(({ id, key }) => ({ id, key }))
    }
  };
  documents.push({
    id: "ludivra.game",
    file: "game.jsonc",
    source: JSON.stringify(binding),
    value: binding
  });

  // Manifest labels are the base locale table until real translations exist.
  const entries: Record<string, string> = { "runtime.status": "Tick {tick}" };
  for (const definition of manifest.inspection.integerStates) entries[`state.${definition.id}`] = `${definition.label}: {value}`;
  for (const input of manifest.inputs) entries[`input.${input.id}`] = input.label;

  const input = { documents, strings: [{ locale: "base", entries }] };
  const cacheKey = contentPackCacheKey(input);
  const path = resolve(project, CONTENT_PACK_FILE);
  const metaPath = resolve(project, CONTENT_PACK_META_FILE);
  const existing = await readFile(path).catch(() => null);
  const meta = JSON.parse(await readFile(metaPath, "utf8").catch(() => "null")) as
    | { cacheKey: string; sha256: string }
    | null;
  if (existing !== null && meta?.cacheKey === cacheKey) {
    const parsed = readContentPack(existing);
    if (parsed.failure === null) {
      return {
        path: CONTENT_PACK_FILE,
        sha256: meta.sha256,
        cacheKey,
        reused: true,
        symbols: Object.keys((parsed.pack.sections.symbols.value ?? {}) as Record<string, unknown>).sort(),
        diagnostics
      };
    }
  }

  const compiled = compileContentPack(input);
  await mkdir(resolve(project, ".ludivra"), { recursive: true });
  await writeFile(path, compiled.bytes);
  await writeFile(metaPath, `${JSON.stringify({ cacheKey, sha256: compiled.sha256 }, null, 2)}\n`, "utf8");
  return {
    path: CONTENT_PACK_FILE,
    sha256: compiled.sha256,
    cacheKey,
    reused: false,
    symbols: compiled.symbols,
    diagnostics
  };
}

export async function runContentCommand(
  context: CommandContext,
  arguments_: string[]
): Promise<CommandOutcome> {
  const action = arguments_[1] ?? "build";
  if (!["build", "inspect", "explain"].includes(action)) {
    return {
      diagnostics: [{ code: "CONTENT_ACTION_UNKNOWN", severity: "error", message: `Unknown content action: ${action}` }],
      nextActions: ["Use game content build, inspect or explain"]
    };
  }
  await findEngineRoot();
  const project = await resolveProjectDirectory(arguments_);
  const result = await ensureContentPack(project);
  const diagnostics = [...result.diagnostics];

  if (action === "explain") {
    const symbol = optionValue(arguments_, "--symbol");
    if (symbol === undefined) {
      return {
        diagnostics: [{ code: "CONTENT_SYMBOL_REQUIRED", severity: "error", message: "explain requires --symbol" }],
        nextActions: ["Run game content explain --symbol <id>"]
      };
    }
    const pack = readContentPack(await readFile(resolve(project, CONTENT_PACK_FILE)));
    const origins = (pack.pack.sections.origin.value ?? {}) as Record<string, SymbolOrigin>;
    const origin = origins[symbol];
    if (origin === undefined) {
      return {
        diagnostics: [{ code: "CONTENT_SYMBOL_UNKNOWN", severity: "error", message: `No content symbol named ${symbol}` }],
        data: { project, symbol, symbols: result.symbols.length },
        nextActions: ["Run game content inspect to list the declared symbols"]
      };
    }
    return {
      diagnostics,
      data: { project, symbol, origin },
      nextActions: [`Open ${origin.file}:${origin.line} to change this value`]
    };
  }

  if (action === "inspect") {
    const sceneId = optionValue(arguments_, "--scene");
    if (sceneId !== undefined) {
      const pack = readContentPack(await readFile(resolve(project, CONTENT_PACK_FILE)));
      const documents = (pack.pack.sections.documents.value ?? {}) as Record<string, unknown>;
      const graph = documents[SCENE_GRAPH_DOCUMENT_ID] as { scenes?: Array<{ id: string }> } | undefined;
      const scene = graph?.scenes?.find(({ id }) => id === sceneId);
      if (scene === undefined) {
        return {
          diagnostics: [{ code: "SCENE_REFERENCE_NOT_FOUND", severity: "error", message: `No compiled scene named ${sceneId}` }],
          data: { project, sceneId },
          nextActions: ["Run game content inspect to list the declared symbols"]
        };
      }
      return {
        diagnostics,
        data: { project, action, scene },
        nextActions: [`Run game content explain --symbol ${sceneId} to trace the authored scene`]
      };
    }
  }

  const artifacts: Artifact[] = [];
  if (action === "build") {
    const runDirectory = resolve(project, "reports/runs", context.runId);
    await mkdir(runDirectory, { recursive: true });
    const reportPath = resolve(runDirectory, "content-pack.json");
    await writeFile(reportPath, `${JSON.stringify({
      pack: result.path,
      sha256: result.sha256,
      cacheKey: result.cacheKey,
      reused: result.reused,
      symbols: result.symbols
    }, null, 2)}\n`, "utf8");
    artifacts.push({ kind: "content-pack-report", path: reportPath, sha256: await hashArtifactPath(reportPath) });
    artifacts.push({
      kind: "content-pack",
      path: resolve(project, result.path),
      sha256: result.sha256
    });
  }

  return {
    diagnostics,
    artifacts,
    data: {
      project,
      action,
      pack: result.path,
      sha256: result.sha256,
      reused: result.reused,
      symbols: action === "inspect" ? result.symbols : result.symbols.length,
      documents: (await readGameManifest(project)).content?.length ?? 0,
      scenes: (await readGameManifest(project)).composition?.scenes.length ?? 0,
      prefabs: (await readGameManifest(project)).composition?.prefabs.length ?? 0
    },
    nextActions: ["Run game content explain --symbol <id> to trace a value to its line"]
  };
}
