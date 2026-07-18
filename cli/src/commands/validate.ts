import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import type { Diagnostic } from "../generated/cli-result.js";
import { findEngineRoot } from "../repository.js";
import type { CommandOutcome } from "../result.js";

const requiredFiles = [
  "AGENTS.md",
  "architecture.md",
  "CAPABILITIES.json",
  "CMakeLists.txt",
  "contracts/cli-result.schema.json",
  "runtime-c-api/include/ludivra/runtime.h",
  "toolchain.lock"
] as const;

const jsonFiles = [
  "CAPABILITIES.json",
  "CMakePresets.json",
  "package.json",
  "contracts/capability-catalog.source.json",
  "contracts/cli-result.schema.json",
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

export async function runValidate(): Promise<CommandOutcome> {
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

  return {
    diagnostics,
    data: {
      requiredFilesChecked: requiredFiles.length,
      jsonFilesChecked: jsonFiles.length,
      generationChecks: generationChecks.length
    },
    nextActions: diagnostics.length === 0
      ? ["Run pnpm test"]
      : ["Resolve validation diagnostics and run game validate again"]
  };
}

