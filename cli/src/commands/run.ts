import type { CacheFamilyId } from "../artifact-cache.js";
import { ensureProjectAudio } from "../audio-forge.js";
import { ensureContentPack } from "../content-forge.js";
import { ensureProjectVisuals } from "../visual-forge.js";
import { parseBuildOptions, runFamilies, summarizeDecisions } from "../build-runner.js";
import { runProcess } from "../process-runner.js";
import { resolveProjectDirectory } from "../project.js";
import { findEngineRoot } from "../repository.js";
import type { CommandContext, CommandOutcome } from "../result.js";
import { runScenarioCommand } from "../scenario-harness.js";

const runtimeFamilies: CacheFamilyId[] = ["contracts", "packages", "wasm"];

export async function runGame(context: CommandContext, arguments_: string[]): Promise<CommandOutcome> {
  if (arguments_.includes("--control")) {
    return runScenarioCommand(context, arguments_, false);
  }
  const root = await findEngineRoot();
  const project = await resolveProjectDirectory(arguments_);
  const options = parseBuildOptions(arguments_);
  const content = await ensureContentPack(project);
  const audio = await ensureProjectAudio(root, project);
  const visual = await ensureProjectVisuals(root, project);
  const prepared = await runFamilies({
    runId: context.runId,
    root,
    evidenceRoot: project,
    project,
    families: runtimeFamilies,
    environment: { ...process.env, LUDIVRA_GAME_DIR: project },
    watch: false,
    force: options.force,
    debounceMs: options.debounceMs
  });
  if ([...content.diagnostics, ...audio.diagnostics, ...visual.diagnostics, ...prepared.diagnostics].some(({ severity }) => severity === "error")) {
    return {
      diagnostics: [
        ...content.diagnostics,
        ...audio.diagnostics,
        ...visual.diagnostics,
        ...prepared.diagnostics.map((diagnostic) => ({ ...diagnostic, code: "RUN_PREPARATION_FAILED" }))
      ],
      artifacts: prepared.artifacts,
      data: { project, cache: summarizeDecisions(prepared.decisions) },
      nextActions: ["Run game doctor and repair the toolchain"]
    };
  }
  // The dev server is declared unbounded; the runner still owns its process group
  // and terminates it when the CLI exits.
  const server = await runProcess(
    "pnpm",
    ["--filter", "@ludivra/browser-host", "dev", "--host", "127.0.0.1"],
    {
      id: "browser-host-dev",
      cwd: root,
      timeoutMs: "unbounded",
      env: { ...process.env, LUDIVRA_GAME_DIR: project },
      interactive: true
    }
  );
  return {
    diagnostics: server.exitCode === 0 ? [] : [{
      code: "GAME_RUN_FAILED",
      severity: "error",
      message: `Browser host exited with code ${server.exitCode}`
    }],
    artifacts: prepared.artifacts,
    data: { project, cache: summarizeDecisions(prepared.decisions) },
    nextActions: ["Run game build --target web"]
  };
}
