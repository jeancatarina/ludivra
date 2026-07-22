import { spawnSync } from "node:child_process";
import { readdir, readFile, realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { parse, type ParseError } from "jsonc-parser";
import type { Diagnostic } from "../generated/cli-result.js";
import { optionValue } from "../arguments.js";
import { sha256 } from "../artifact-hash.js";
import { createContractValidator } from "../contract-validator.js";
import type { ProjectState } from "../generated/operability.js";
import { findEngineRoot } from "../repository.js";
import { repositoriesMatch, repositoryFingerprint } from "../repository-state.js";
import type { CommandOutcome } from "../result.js";

const requiredFiles = [
  "AGENTS.md",
  "ROADMAP.md",
  "architecture.md",
  "CAPABILITIES.json",
  "CMakeLists.txt",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "contracts/cli-result.schema.json",
  "contracts/capability-catalog.schema.json",
  "contracts/capability-manifest.schema.json",
  "contracts/control-protocol.schema.json",
  "contracts/desktop-host.schema.json",
  "contracts/project-state.schema.json",
  "contracts/presentation-events.schema.json",
  "contracts/run-manifest.schema.json",
  "schemas/card-roguelite.schema.json",
  "schemas/scenario.schema.json",
  "runtime-c-api/include/ludivra/runtime.h",
  "toolchain.lock"
] as const;

const jsonFiles = [
  "CAPABILITIES.json",
  "CMakePresets.json",
  "package.json",
  "contracts/capability-catalog.source.json",
  "contracts/capability-catalog.schema.json",
  "contracts/capability-manifest.schema.json",
  "contracts/cli-result.schema.json",
  "contracts/control-protocol.schema.json",
  "contracts/desktop-host.schema.json",
  "contracts/project-state.schema.json",
  "contracts/presentation-events.schema.json",
  "contracts/run-manifest.schema.json",
  "schemas/card-roguelite.schema.json",
  "schemas/game.schema.json",
  "schemas/scenario.schema.json",
  "toolchain.lock"
] as const;

const contractSchemaFiles = [
  "contracts/capability-manifest.schema.json",
  "contracts/capability-catalog.schema.json",
  "contracts/cli-result.schema.json",
  "contracts/control-protocol.schema.json",
  "contracts/desktop-host.schema.json",
  "contracts/project-state.schema.json",
  "contracts/presentation-events.schema.json",
  "contracts/run-manifest.schema.json",
  "schemas/card-roguelite.schema.json",
  "schemas/game.schema.json",
  "schemas/scenario.schema.json"
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

interface WorkspacePackage {
  name: string;
  directory: string;
  dependencies: Set<string>;
}

export function normalizeRepositoryPath(path: string): string {
  return path.replaceAll("\\", "/");
}

async function collectPackageFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectPackageFiles(path));
    else if (entry.name === "package.json") files.push(path);
  }
  return files;
}

export async function validateWorkspaceGraph(root: string, boundaryFiles: string[], diagnostics: Diagnostic[]): Promise<number> {
  const packages = new Map<string, WorkspacePackage>();
  for (const path of await collectPackageFiles(root)) {
    const manifest = JSON.parse(await readFile(path, "utf8")) as {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    if (manifest.name?.startsWith("@ludivra/") !== true) continue;
    const dependencies = new Set(
      Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })
        .filter(([name, version]) => name.startsWith("@ludivra/") && version.startsWith("workspace:"))
        .map(([name]) => name)
    );
    if (packages.has(manifest.name)) {
      diagnostics.push({
        code: "WORKSPACE_PACKAGE_DUPLICATE",
        severity: "error",
        message: `Workspace package name is duplicated: ${manifest.name}`,
        file: relative(root, path)
      });
    }
    packages.set(manifest.name, { name: manifest.name, directory: resolve(path, ".."), dependencies });
  }

  for (const workspacePackage of packages.values()) {
    for (const dependency of workspacePackage.dependencies) {
      if (!packages.has(dependency)) {
        diagnostics.push({
          code: "WORKSPACE_DEPENDENCY_MISSING",
          severity: "error",
          message: `${workspacePackage.name} declares missing workspace dependency ${dependency}`,
          file: relative(root, resolve(workspacePackage.directory, "package.json"))
        });
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (name: string, path: string[]): void => {
    if (visiting.has(name)) {
      const cycleStart = path.indexOf(name);
      diagnostics.push({
        code: "WORKSPACE_DEPENDENCY_CYCLE",
        severity: "error",
        message: `Workspace dependency cycle: ${[...path.slice(cycleStart), name].join(" -> ")}`
      });
      return;
    }
    if (visited.has(name)) return;
    visiting.add(name);
    const workspacePackage = packages.get(name);
    for (const dependency of workspacePackage?.dependencies ?? []) visit(dependency, [...path, name]);
    visiting.delete(name);
    visited.add(name);
  };
  for (const name of packages.keys()) visit(name, []);

  const orderedPackages = [...packages.values()].sort((left, right) => right.directory.length - left.directory.length);
  const importPattern = /(?:from\s+|import\s*\(|require\s*\()\s*["'](@ludivra\/[^"'/]+)(?:\/[^"']*)?["']/g;
  for (const file of boundaryFiles) {
    const owner = orderedPackages.find((workspacePackage) => {
      const localPath = relative(workspacePackage.directory, file);
      return localPath !== "" && !localPath.startsWith("..") && !isAbsolute(localPath);
    });
    if (owner === undefined) continue;
    const content = await readFile(file, "utf8");
    for (const match of content.matchAll(importPattern)) {
      const dependency = match[1];
      if (dependency !== undefined && packages.has(dependency) && dependency !== owner.name && !owner.dependencies.has(dependency)) {
        diagnostics.push({
          code: "WORKSPACE_DEPENDENCY_UNDECLARED",
          severity: "error",
          message: `${owner.name} imports undeclared workspace dependency ${dependency}`,
          file: normalizeRepositoryPath(relative(root, file))
        });
      }
    }
  }
  return packages.size;
}

async function collectCmakeFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectCmakeFiles(path));
    else if (entry.name === "CMakeLists.txt") files.push(path);
  }
  return files;
}

export async function validateCmakeGraph(root: string, diagnostics: Diagnostic[]): Promise<number> {
  const sources = await Promise.all((await collectCmakeFiles(root)).map(async (path) => ({ path, content: await readFile(path, "utf8") })));
  const targets = new Set<string>();
  const aliases = new Map<string, string>();
  for (const { content } of sources) {
    for (const match of content.matchAll(/add_(?:library|executable)\(\s*([^\s)]+)/g)) {
      if (match[1] !== undefined) targets.add(match[1]);
    }
    for (const match of content.matchAll(/add_library\(\s*([^\s)]+)\s+ALIAS\s+([^\s)]+)/g)) {
      if (match[1] !== undefined && match[2] !== undefined) aliases.set(match[1], match[2]);
    }
  }
  const graph = new Map([...targets].map((target) => [target, new Set<string>()]));
  for (const { content } of sources) {
    for (const match of content.matchAll(/target_link_libraries\(\s*([^\s)]+)\s+([\s\S]*?)\)/g)) {
      const owner = match[1];
      const body = match[2];
      if (owner === undefined || body === undefined || !targets.has(owner)) continue;
      for (const token of body.split(/\s+/).filter(Boolean)) {
        const dependency = aliases.get(token) ?? token;
        if (targets.has(dependency)) graph.get(owner)?.add(dependency);
      }
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (target: string, path: string[]): void => {
    if (visiting.has(target)) {
      const cycleStart = path.indexOf(target);
      diagnostics.push({
        code: "CMAKE_DEPENDENCY_CYCLE",
        severity: "error",
        message: `CMake target dependency cycle: ${[...path.slice(cycleStart), target].join(" -> ")}`
      });
      return;
    }
    if (visited.has(target)) return;
    visiting.add(target);
    for (const dependency of graph.get(target) ?? []) visit(dependency, [...path, target]);
    visiting.delete(target);
    visited.add(target);
  };
  for (const target of targets) visit(target, []);
  return targets.size;
}

export async function runValidate(arguments_: string[] = []): Promise<CommandOutcome> {
  const root = await findEngineRoot();
  const diagnostics: Diagnostic[] = [];
  let contentFilesChecked = 0;

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

  const schemaValidator = createContractValidator();
  for (const file of contractSchemaFiles) {
    try {
      schemaValidator.addSchema(JSON.parse(await readFile(resolve(root, file), "utf8")));
    } catch (error) {
      diagnostics.push({
        code: "CONTRACT_SCHEMA_INVALID",
        severity: "error",
        message: error instanceof Error ? error.message : `Invalid contract schema: ${file}`,
        file
      });
    }
  }

  const generationChecks = [
    "tools/contracts/generate-cli-result.mjs",
    "tools/contracts/generate-control.mjs",
    "tools/contracts/generate-desktop-host.mjs",
    "tools/contracts/generate-presentation-events.mjs",
    "tools/contracts/generate-operability.mjs",
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

  const boundaryFiles = await collectBoundaryFiles(root, diagnostics);
  for (const file of boundaryFiles) {
    const path = normalizeRepositoryPath(relative(root, file));
    const content = await readFile(file, "utf8");
    if (/(?:from\s+|import\s*\()["']three(?:\/[^"']*)?["']/.test(content) && !path.startsWith("renderer-three/")) {
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
    if (/(?:from\s+|require\s*\()["']steamworks\.js["']/.test(content) && !path.startsWith("hosts/electron/")) {
      diagnostics.push({
        code: "STEAMWORKS_IMPORT_OUTSIDE_ADAPTER",
        severity: "error",
        message: "steamworks.js may only be imported by the Electron Steam adapter",
        file: path
      });
    }
    if (/(?:from\s+|require\s*\()["']@capacitor\//.test(content) && !path.startsWith("hosts/capacitor-")) {
      diagnostics.push({
        code: "CAPACITOR_IMPORT_OUTSIDE_HOST",
        severity: "error",
        message: "Capacitor packages may only be imported by Capacitor hosts",
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
    if (!path.startsWith("cli/") && !path.startsWith("tools/") &&
        (/LUDIVRA_CONTROL_TOKEN/.test(content) || /["'][^"']*(?:control-client|control-worker|generated\/control-protocol)[^"']*["']/.test(content))) {
      diagnostics.push({
        code: "CONTROL_PROTOCOL_OUTSIDE_TOOLING",
        severity: "error",
        message: "The development control protocol may only be imported or configured by CLI/tooling code",
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
  const workspacePackagesChecked = await validateWorkspaceGraph(root, boundaryFiles, diagnostics);
  const cmakeTargetsChecked = await validateCmakeGraph(root, diagnostics);

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
        const validator = createContractValidator().compile(schema);
        if (!validator(game)) {
          for (const error of validator.errors ?? []) {
            diagnostics.push({
              code: "GAME_SCHEMA_INVALID",
              severity: "error",
              message: `${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
              file: gamePath
            });
          }
        } else {
          const manifest = game as {
            id: string;
            name: string;
            content?: Array<{ id: string; schema: string; source: string }>;
            inputs: Array<{ id: string; actionId: number }>;
            inspection: { integerStates: Array<{ id: string; key: number }> };
            scenarios: string[];
            audio?: Array<{ id: string; eventId: number; source?: string }>;
            effects?: Array<{ id: string; eventId: number }>;
          };
          const manifestActions = new Map(manifest.inputs.map(({ id, actionId }) => [id, actionId]));
          const declaredStateKeys = new Set(manifest.inspection.integerStates.map(({ key }) => key));
          const manifestActionIds = manifest.inputs.map(({ actionId }) => actionId);
          if (manifestActions.size !== manifest.inputs.length || new Set(manifestActionIds).size !== manifestActionIds.length) {
            diagnostics.push({ code: "INPUT_CONTRACT_DUPLICATE", severity: "error", message: "Manifest input IDs and actionIds must be unique", file: gamePath });
          }
          const stateIds = manifest.inspection.integerStates.map(({ id }) => id);
          if (new Set(stateIds).size !== stateIds.length || declaredStateKeys.size !== manifest.inspection.integerStates.length) {
            diagnostics.push({ code: "INSPECTION_STATE_DUPLICATE", severity: "error", message: "Inspection state IDs and keys must be unique", file: gamePath });
          }
          const contentIds = new Set<string>();
          for (const descriptor of manifest.content ?? []) {
            if (contentIds.has(descriptor.id)) {
              diagnostics.push({ code: "CONTENT_ID_DUPLICATE", severity: "error", message: `Content ID is duplicated: ${descriptor.id}`, file: gamePath });
              continue;
            }
            contentIds.add(descriptor.id);
            const contentPath = resolve(project, descriptor.source);
            const relation = relative(project, contentPath);
            if (relation.startsWith("..") || isAbsolute(relation)) {
              diagnostics.push({ code: "CONTENT_PATH_OUTSIDE_PROJECT", severity: "error", message: `Content escapes the game project: ${descriptor.source}`, file: gamePath });
              continue;
            }
            const contentErrors: ParseError[] = [];
            try {
              const [actualProject, actualContent] = await Promise.all([realpath(project), realpath(contentPath)]);
              const actualRelation = relative(actualProject, actualContent);
              if (actualRelation.startsWith("..") || isAbsolute(actualRelation)) {
                diagnostics.push({ code: "CONTENT_PATH_OUTSIDE_PROJECT", severity: "error", message: `Content symlink escapes the game project: ${descriptor.source}`, file: contentPath });
                continue;
              }
              const document = parse(await readFile(actualContent, "utf8"), contentErrors) as {
                $schema?: string;
                id?: string;
                cards?: Array<{ id: string; action: string }>;
                rooms?: Array<{ id: string }>;
              };
              const contentValidator = schemaValidator.getSchema(descriptor.schema);
              if (contentValidator === undefined) {
                diagnostics.push({ code: "CONTENT_SCHEMA_UNKNOWN", severity: "error", message: `No registered schema for content: ${descriptor.schema}`, file: contentPath });
                continue;
              }
              if (contentErrors.length > 0 || !contentValidator(document)) {
                diagnostics.push({
                  code: "CONTENT_SCHEMA_INVALID",
                  severity: "error",
                  message: contentErrors.length > 0
                    ? "Content is not valid JSONC"
                    : contentValidator.errors?.map((error) => `${error.instancePath} ${error.message}`).join("; ") ?? "Content is invalid",
                  file: contentPath
                });
                continue;
              }
              contentFilesChecked += 1;
              if (document.id !== descriptor.id || document.$schema !== descriptor.schema) {
                diagnostics.push({ code: "CONTENT_DESCRIPTOR_MISMATCH", severity: "error", message: `Content descriptor does not match document ${descriptor.id}`, file: contentPath });
              }
              const cardIds = (document.cards ?? []).map(({ id }) => id);
              const cardActions = (document.cards ?? []).map(({ action }) => action);
              if (new Set(cardIds).size !== cardIds.length || new Set(cardActions).size !== cardActions.length || cardActions.some((action) => !manifestActions.has(action))) {
                diagnostics.push({ code: "CONTENT_CARD_CONTRACT_INVALID", severity: "error", message: "Card IDs/actions must be unique and reference declared content actions", file: contentPath });
              }
              const roomIds = (document.rooms ?? []).map(({ id }) => id);
              if (new Set(roomIds).size !== roomIds.length) {
                diagnostics.push({ code: "CONTENT_ROOM_ID_DUPLICATE", severity: "error", message: "Room IDs must be unique", file: contentPath });
              }
            } catch (error) {
              diagnostics.push({ code: "CONTENT_UNREADABLE", severity: "error", message: error instanceof Error ? error.message : `Unable to read ${descriptor.source}`, file: contentPath });
            }
          }
          for (const [collection, entries] of [
            ["audio", manifest.audio ?? []],
            ["effects", manifest.effects ?? []]
          ] as const) {
            const ids = new Set<string>();
            const eventIds = new Set<number>();
            for (const entry of entries) {
              if (ids.has(entry.id) || eventIds.has(entry.eventId)) {
                diagnostics.push({
                  code: "PRESENTATION_EVENT_ID_DUPLICATE",
                  severity: "error",
                  message: `${collection} IDs and eventIds must be unique`,
                  file: gamePath
                });
              }
              ids.add(entry.id);
              eventIds.add(entry.eventId);
            }
          }
          for (const audio of manifest.audio ?? []) {
            if (audio.source === undefined) continue;
            const source = resolve(project, audio.source);
            const relation = relative(project, source);
            if (relation.startsWith("..") || isAbsolute(relation)) {
              diagnostics.push({
                code: "AUDIO_SOURCE_OUTSIDE_PROJECT",
                severity: "error",
                message: `Audio source escapes the game project: ${audio.source}`,
                file: gamePath
              });
              continue;
            }
            try {
              await readFile(source);
            } catch {
              diagnostics.push({
                code: "AUDIO_SOURCE_MISSING",
                severity: "error",
                message: `Audio source does not exist: ${audio.source}`,
                file: gamePath
              });
            }
          }

          const scenarioValidator = schemaValidator.getSchema("https://ludivra.dev/schemas/scenario/v1");
          const actionIds = new Set(manifest.inputs.map(({ id }) => id));
          const integerKeys = new Set(manifest.inspection.integerStates.map(({ key }) => key));
          for (const scenarioReference of manifest.scenarios) {
            const scenarioPath = resolve(project, scenarioReference);
            const relation = relative(project, scenarioPath);
            if (relation.startsWith("..") || isAbsolute(relation)) {
              diagnostics.push({ code: "SCENARIO_PATH_OUTSIDE_PROJECT", severity: "error", message: `Scenario escapes the game project: ${scenarioReference}`, file: gamePath });
              continue;
            }
            const scenarioErrors: ParseError[] = [];
            try {
              const [actualProject, actualScenario] = await Promise.all([realpath(project), realpath(scenarioPath)]);
              const actualRelation = relative(actualProject, actualScenario);
              if (actualRelation.startsWith("..") || isAbsolute(actualRelation)) {
                diagnostics.push({ code: "SCENARIO_PATH_OUTSIDE_PROJECT", severity: "error", message: `Scenario symlink escapes the game project: ${scenarioReference}`, file: scenarioPath });
                continue;
              }
              const scenario = parse(await readFile(actualScenario, "utf8"), scenarioErrors) as {
                steps?: Array<{ operation?: string; action?: string; condition?: { integer?: { key?: number } } }>;
                assertions?: Array<{ type?: string; key?: number }>;
              };
              if (scenarioErrors.length > 0 || scenarioValidator === undefined || !scenarioValidator(scenario)) {
                diagnostics.push({
                  code: "SCENARIO_SCHEMA_INVALID",
                  severity: "error",
                  message: scenarioErrors.length > 0
                    ? "Scenario is not valid JSONC"
                    : scenarioValidator?.errors?.map((error) => `${error.instancePath} ${error.message}`).join("; ") ?? "Scenario schema is unavailable",
                  file: scenarioPath
                });
                continue;
              }
              for (const step of scenario.steps ?? []) {
                if (step.operation === "act" && (step.action === undefined || !actionIds.has(step.action))) {
                  diagnostics.push({ code: "SCENARIO_ACTION_UNKNOWN", severity: "error", message: `Scenario references unknown action: ${step.action ?? "missing"}`, file: scenarioPath });
                }
                const key = step.condition?.integer?.key;
                if (key !== undefined && !integerKeys.has(key)) {
                  diagnostics.push({ code: "SCENARIO_STATE_KEY_UNKNOWN", severity: "error", message: `Scenario references undeclared integer key: ${key}`, file: scenarioPath });
                }
              }
              for (const assertion of scenario.assertions ?? []) {
                if (assertion.type === "integer-equals" && (assertion.key === undefined || !integerKeys.has(assertion.key))) {
                  diagnostics.push({ code: "SCENARIO_STATE_KEY_UNKNOWN", severity: "error", message: `Scenario assertion references undeclared integer key: ${assertion.key ?? "missing"}`, file: scenarioPath });
                }
              }
            } catch (error) {
              diagnostics.push({ code: "SCENARIO_UNREADABLE", severity: "error", message: error instanceof Error ? error.message : `Unable to read ${scenarioReference}`, file: scenarioPath });
            }
          }

          const statePath = resolve(project, ".ludivra/project-state.json");
          try {
            const stateText = await readFile(statePath, "utf8");
            const state = JSON.parse(stateText) as ProjectState;
            const stateSchema = JSON.parse(await readFile(resolve(root, "contracts/project-state.schema.json"), "utf8"));
            const stateValidator = createContractValidator().compile(stateSchema);
            if (!stateValidator(state)) {
              diagnostics.push({
                code: "PROJECT_STATE_INVALID",
                severity: "error",
                message: stateValidator.errors?.map((error) => `${error.instancePath} ${error.message}`).join("; ") ?? "Project state is invalid",
                file: statePath
              });
            } else {
              const [engineManifest, catalogText, engineRepository, projectRepository] = await Promise.all([
                readFile(resolve(root, "package.json"), "utf8").then(JSON.parse),
                readFile(resolve(root, "CAPABILITIES.json"), "utf8"),
                repositoryFingerprint(root),
                repositoryFingerprint(project)
              ]);
              const stale = state.project.id !== manifest.id || state.project.name !== manifest.name ||
                state.engine.version !== String(engineManifest.version) || state.capabilities.sha256 !== sha256(catalogText) ||
                !repositoriesMatch(state.engine.repository, engineRepository) ||
                !repositoriesMatch(state.project.repository, projectRepository);
              if (stale) {
                diagnostics.push({
                  code: "PROJECT_STATE_STALE",
                  severity: "error",
                  message: "Generated project state does not match the current project, engine, catalog or worktree",
                  file: statePath
                });
              }
            }
          } catch (error) {
            const invalid = error instanceof SyntaxError;
            diagnostics.push({
              code: invalid ? "PROJECT_STATE_INVALID" : "PROJECT_STATE_MISSING",
              severity: "error",
              message: invalid
                ? error.message
                : error instanceof Error ? error.message : "Run game status to generate project state",
              file: statePath
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
      contractSchemasChecked: contractSchemaFiles.length,
      contentFilesChecked,
      generationChecks: generationChecks.length,
      workspacePackagesChecked,
      cmakeTargetsChecked,
      gameProjectChecked: projectArgument !== undefined
    },
    nextActions: diagnostics.length === 0
      ? ["Run pnpm test"]
      : ["Resolve validation diagnostics and run game validate again"]
  };
}
