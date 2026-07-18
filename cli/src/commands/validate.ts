import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { parse, type ParseError } from "jsonc-parser";
import type { Diagnostic } from "../generated/cli-result.js";
import { optionValue } from "../arguments.js";
import { findEngineRoot } from "../repository.js";
import type { CommandOutcome } from "../result.js";

const requiredFiles = [
  "AGENTS.md",
  "architecture.md",
  "CAPABILITIES.json",
  "CMakeLists.txt",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "contracts/cli-result.schema.json",
  "contracts/desktop-host.schema.json",
  "runtime-c-api/include/ludivra/runtime.h",
  "toolchain.lock"
] as const;

const jsonFiles = [
  "CAPABILITIES.json",
  "CMakePresets.json",
  "package.json",
  "contracts/capability-catalog.source.json",
  "contracts/cli-result.schema.json",
  "contracts/desktop-host.schema.json",
  "schemas/game.schema.json",
  "toolchain.lock"
] as const;

const kernelForbiddenPatterns = [
  { code: "KERNEL_IMPORTS_RENDERER", pattern: /three(?:\.js)?/i },
  { code: "KERNEL_IMPORTS_ELECTRON", pattern: /electron/i },
  { code: "KERNEL_IMPORTS_CAPACITOR", pattern: /capacitor/i },
  { code: "KERNEL_IMPORTS_PLATFORM_SDK", pattern: /steamworks|gamecenter|googleplay/i },
  { code: "KERNEL_USES_NONDETERMINISTIC_RNG", pattern: /<random>|std::random_/i }
] as const;

const skippedDirectories = new Set([".git", ".toolchains", "build", "dist", "node_modules", "reports"]);
const forbiddenGenericDirectories = new Set(["common", "helpers", "utils"]);

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(path));
    } else if ([".cpp", ".h", ".hpp"].includes(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
}

async function collectBoundaryFiles(directory: string, diagnostics: Diagnostic[]): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) {
      continue;
    }
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (forbiddenGenericDirectories.has(entry.name)) {
        diagnostics.push({
          code: "GENERIC_MODULE_FORBIDDEN",
          severity: "error",
          message: `Generic module directory is forbidden: ${entry.name}`,
          file: path
        });
      }
      files.push(...await collectBoundaryFiles(path, diagnostics));
    } else if ([".cjs", ".js", ".mjs", ".ts", ".lua"].includes(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
}

export async function runValidate(arguments_: string[] = []): Promise<CommandOutcome> {
  const root = await findEngineRoot();
  const diagnostics: Diagnostic[] = [];

  for (const file of requiredFiles) {
    try {
      await readFile(resolve(root, file));
    } catch {
      diagnostics.push({
        code: "REQUIRED_FILE_MISSING",
        severity: "error",
        message: `Required file is missing: ${file}`,
        file
      });
    }
  }

  for (const file of jsonFiles) {
    try {
      JSON.parse(await readFile(resolve(root, file), "utf8"));
    } catch (error) {
      diagnostics.push({
        code: "JSON_INVALID",
        severity: "error",
        message: error instanceof Error ? error.message : `Invalid JSON: ${file}`,
        file
      });
    }
  }

  const generationChecks = [
    "tools/contracts/generate-cli-result.mjs",
    "tools/contracts/generate-desktop-host.mjs",
    "tools/contracts/generate-capabilities.mjs"
  ];
  for (const script of generationChecks) {
    const execution = spawnSync("node", [resolve(root, script), "--check"], { encoding: "utf8" });
    if (execution.status !== 0) {
      diagnostics.push({
        code: "GENERATED_FILE_STALE",
        severity: "error",
        message: `${script} reports stale output`,
        file: script,
        details: { stderr: execution.stderr.trim() }
      });
    }
  }

  for (const file of await collectSourceFiles(resolve(root, "kernel"))) {
    const content = await readFile(file, "utf8");
    for (const forbidden of kernelForbiddenPatterns) {
      if (forbidden.pattern.test(content)) {
        diagnostics.push({
          code: forbidden.code,
          severity: "error",
          message: `Forbidden kernel dependency detected in ${relative(root, file)}`,
          file: relative(root, file)
        });
      }
    }
  }

  for (const file of await collectBoundaryFiles(root, diagnostics)) {
    const path = relative(root, file);
    const content = await readFile(file, "utf8");
    if (/(?:from\s+|import\s*\()["']three["']/.test(content) && !path.startsWith("renderer-three/")) {
      diagnostics.push({
        code: "THREE_IMPORT_OUTSIDE_ADAPTER",
        severity: "error",
        message: "Three.js may only be imported by renderer-three",
        file: path
      });
    }
    if (/(?:from\s+|require\s*\()["']electron["']/.test(content) && !path.startsWith("hosts/electron/")) {
      diagnostics.push({
        code: "ELECTRON_IMPORT_OUTSIDE_HOST",
        severity: "error",
        message: "Electron may only be imported by ElectronHost",
        file: path
      });
    }
    if (/from\s+["']@ludivra\/[^"'/]+\//.test(content)) {
      diagnostics.push({
        code: "DEEP_IMPORT_FORBIDDEN",
        severity: "error",
        message: "Cross-package deep imports are forbidden",
        file: path
      });
    }
    if (extname(file) === ".lua" && /\b(?:debug|io|os|package)\s*[.:]/.test(content)) {
      diagnostics.push({
        code: "LUA_HOST_ACCESS_FORBIDDEN",
        severity: "error",
        message: "Gameplay Lua cannot access host libraries",
        file: path
      });
    }
  }

  const projectArgument = optionValue(arguments_, "--project");
  if (projectArgument !== undefined) {
    const project = resolve(projectArgument);
    const gamePath = resolve(project, "game.jsonc");
    const parseErrors: ParseError[] = [];
    try {
      const game = parse(await readFile(gamePath, "utf8"), parseErrors);
      if (parseErrors.length > 0) {
        diagnostics.push({ code: "GAME_JSONC_INVALID", severity: "error", message: "game.jsonc is not valid JSONC", file: gamePath });
      } else {
        const schema = JSON.parse(await readFile(resolve(root, "schemas/game.schema.json"), "utf8"));
        const validator = new Ajv2020({ allErrors: true }).compile(schema);
        if (!validator(game)) {
          for (const error of validator.errors ?? []) {
            diagnostics.push({
              code: "GAME_SCHEMA_INVALID",
              severity: "error",
              message: `${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
              file: gamePath
            });
          }
        }
      }
    } catch (error) {
      diagnostics.push({
        code: "GAME_MANIFEST_UNREADABLE",
        severity: "error",
        message: error instanceof Error ? error.message : "Unable to read game.jsonc",
        file: gamePath
      });
    }
  }

  return {
    diagnostics,
    data: {
      requiredFilesChecked: requiredFiles.length,
      jsonFilesChecked: jsonFiles.length,
      generationChecks: generationChecks.length,
      gameProjectChecked: projectArgument !== undefined
    },
    nextActions: diagnostics.length === 0
      ? ["Run pnpm test"]
      : ["Resolve validation diagnostics and run game validate again"]
  };
}
