import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { optionValue } from "../arguments.js";
import { resolveProjectDirectory } from "../project.js";
import { findEngineRoot } from "../repository.js";
import type { CommandContext, CommandOutcome } from "../result.js";

export async function runTest(context: CommandContext, arguments_: string[]): Promise<CommandOutcome> {
  const root = await findEngineRoot();
  const project = optionValue(arguments_, "--project");
  const evidenceRoot = project === undefined ? root : await resolveProjectDirectory(arguments_);
  const execution = spawnSync("pnpm", ["test"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: 10 * 60 * 1000
  });
  const log = [execution.stdout, execution.stderr].filter(Boolean).join("\n");
  const runDirectory = resolve(evidenceRoot, "reports/runs", context.runId);
  const logPath = resolve(runDirectory, "test.log");
  await mkdir(runDirectory, { recursive: true });
  await writeFile(logPath, log, "utf8");

  const artifact = {
    kind: "test-log",
    path: relative(root, logPath),
    sha256: createHash("sha256").update(log).digest("hex")
  };

  if (execution.status !== 0) {
    const executionCode = execution.error !== undefined && "code" in execution.error
      ? execution.error.code
      : undefined;
    return {
      diagnostics: [{
        code: executionCode === "ETIMEDOUT" ? "TEST_TIMEOUT" : "TEST_FAILED",
        severity: "error",
        message: `Test command exited with status ${execution.status ?? "unknown"}`
      }],
      artifacts: [artifact],
      data: { command: "pnpm test", status: execution.status },
      nextActions: ["Inspect the test log, fix the first failure and run game test again"]
    };
  }

  return {
    diagnostics: [],
    artifacts: [artifact],
    data: { command: "pnpm test", status: execution.status },
    nextActions: ["Run game validate --format json"]
  };
}
