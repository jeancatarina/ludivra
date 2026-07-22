import { runProcess } from "../process-runner.js";
import { resolveProjectDirectory } from "../project.js";
import { findEngineRoot } from "../repository.js";
import type { CommandContext, CommandOutcome } from "../result.js";
import { runScenarioCommand } from "../scenario-harness.js";

export async function runGame(context: CommandContext, arguments_: string[]): Promise<CommandOutcome> {
  if (arguments_.includes("--control")) {
    return runScenarioCommand(context, arguments_, false);
  }
  const root = await findEngineRoot();
  const project = await resolveProjectDirectory(arguments_);
  for (const script of ["build:packages", "build:wasm"]) {
    const prepared = await runProcess("pnpm", [script], { cwd: root, env: process.env });
    if (prepared.exitCode !== 0) {
      return {
        diagnostics: [{ code: "RUN_PREPARATION_FAILED", severity: "error", message: prepared.output.trim() }],
        nextActions: ["Run game doctor and repair the toolchain"]
      };
    }
  }
  const server = await runProcess(
    "pnpm",
    ["--filter", "@ludivra/browser-host", "dev", "--host", "127.0.0.1"],
    { cwd: root, env: { ...process.env, LUDIVRA_GAME_DIR: project }, interactive: true }
  );
  return {
    diagnostics: server.exitCode === 0 ? [] : [{
      code: "GAME_RUN_FAILED",
      severity: "error",
      message: `Browser host exited with code ${server.exitCode}`
    }],
    data: { project },
    nextActions: ["Run game build --target web"]
  };
}
