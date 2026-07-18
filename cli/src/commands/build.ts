import { resolve } from "node:path";
import { optionValue } from "../arguments.js";
import { runProcess } from "../process-runner.js";
import { resolveProjectDirectory } from "../project.js";
import { findEngineRoot } from "../repository.js";
import type { CommandOutcome } from "../result.js";

const supportedTargets = new Set(["web", "steam-macos", "steam-windows", "steam-linux"]);

export async function runBuild(arguments_: string[]): Promise<CommandOutcome> {
  const target = optionValue(arguments_, "--target") ?? "web";
  if (!supportedTargets.has(target)) {
    return {
      diagnostics: [{ code: "BUILD_TARGET_UNSUPPORTED", severity: "error", message: `Unsupported target: ${target}` }],
      nextActions: ["Use web, steam-macos, steam-windows, or steam-linux"]
    };
  }
  const root = await findEngineRoot();
  const project = await resolveProjectDirectory(arguments_);
  for (const [command, commandArguments] of [
    ["pnpm", ["build:packages"]],
    ["pnpm", ["build:wasm"]]
  ] as const) {
    const result = await runProcess(command, [...commandArguments], { cwd: root, env: process.env });
    if (result.exitCode !== 0) {
      return {
        diagnostics: [{ code: "BUILD_TOOL_FAILED", severity: "error", message: result.output.trim() }],
        nextActions: ["Run game doctor and inspect the failed build tool"]
      };
    }
  }
  const web = await runProcess(
    "pnpm",
    ["--filter", "@ludivra/browser-host", "build"],
    {
      cwd: root,
      env: {
        ...process.env,
        LUDIVRA_GAME_DIR: project,
        LUDIVRA_BASE: target === "web" ? "/" : "./"
      }
    }
  );
  if (web.exitCode !== 0) {
    return {
      diagnostics: [{ code: "WEB_BUILD_FAILED", severity: "error", message: web.output.trim() }],
      nextActions: ["Inspect the game presentation and retry"]
    };
  }
  return {
    diagnostics: [],
    artifacts: [{ kind: "web-build", path: resolve(root, "hosts/browser/dist") }],
    data: { project, target },
    nextActions: target === "web" ? ["Run game run to inspect the build"] : ["Run game package with the same target"]
  };
}
