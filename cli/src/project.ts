import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse, type ParseError } from "jsonc-parser";
import type { UiInspectionProjectorDeclaration } from "@ludivra/presentation-protocol";
import { optionValue } from "./arguments.js";

export interface GameManifest {
  schemaVersion: number;
  id: string;
  name: string;
  targets: string[];
  rendering: {
    browser: RendererProfileDeclaration;
    desktop: RendererProfileDeclaration;
  };
  entrypoints: { gameplay: string; presentation: string };
  content?: Array<{ id: string; schema: string; source: string }>;
  composition?: {
    scenes: Array<{ id: string; source: string }>;
    prefabs: Array<{ id: string; source: string }>;
  };
  statecharts?: {
    charts: Array<{ id: string; source: string }>;
    events: Array<{ id: string; actionId: number }>;
    guards: Array<{ id: string }>;
    actions: Array<{ id: string }>;
  };
  inputs: Array<{ id: string; label: string; actionId: number; keys: string[] }>;
  ui: {
    defaultLocale: string;
    locales: Array<{ locale: string; entries: Record<string, string> }>;
    minimumTouchTargetPx: number;
    minimumContrastRatio: number;
    breakpoints: Array<{ id: string; minWidth: number; maxWidth?: number }>;
  };
  timers?: Array<{ id: string; key: number }>;
  inspection: { integerStates: Array<{ id: string; label: string; key: number }> };
  projectors: UiInspectionProjectorDeclaration[];
  scenarios: string[];
  steam?: { appId: number | null; depotId: number | null };
  desktop?: { updates?: { enabled: boolean; feedUrl: string | null } };
}

export interface RendererProfileDeclaration {
  profile: "web-compatible" | "desktop-compatible" | "desktop-high";
  requiredFeatures: RendererFeature[];
  optionalFeatures: RendererFeature[];
  fallbackProfiles: Array<"web-compatible" | "desktop-compatible" | "desktop-high">;
}

export type RendererFeature =
  | "pbr"
  | "shadows"
  | "postprocess"
  | "cpu-particles"
  | "gpu-particles"
  | "instancing"
  | "lod"
  | "culling"
  | "animation"
  | "gamepad"
  | "gpu-timestamps";

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
