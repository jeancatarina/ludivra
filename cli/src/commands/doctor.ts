import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type { Diagnostic } from "../generated/cli-result.js";
import { findEngineRoot } from "../repository.js";
import type { CommandOutcome } from "../result.js";

interface ToolProbe {
  id: string;
  command: string;
  arguments: string[];
  required: boolean;
  lockKey?: string;
}

const probes: ToolProbe[] = [
  { id: "cmake", command: "cmake", arguments: ["--version"], required: true, lockKey: "cmake" },
  { id: "ninja", command: "ninja", arguments: ["--version"], required: true, lockKey: "ninja" },
  { id: "cxx", command: "c++", arguments: ["--version"], required: true },
  { id: "node", command: "node", arguments: ["--version"], required: true, lockKey: "node" },
  { id: "pnpm", command: "pnpm", arguments: ["--version"], required: true, lockKey: "pnpm" },
  { id: "emscripten", command: "emcmake", arguments: ["--version"], required: false },
  { id: "lua", command: "lua", arguments: ["-v"], required: false }
];

function extractVersion(output: string): string | undefined {
  return output.match(/\d+\.\d+(?:\.\d+)?/)?.[0];
}

export async function runDoctor(): Promise<CommandOutcome> {
  const root = await findEngineRoot();
  const lock = JSON.parse(await readFile(resolve(root, "toolchain.lock"), "utf8"));
  const diagnostics: Diagnostic[] = [];
  const tools: Record<string, unknown> = {};

  for (const probe of probes) {
    const execution = spawnSync(probe.command, probe.arguments, {
      encoding: "utf8",
      timeout: 5_000
    });
    const output = `${execution.stdout ?? ""}\n${execution.stderr ?? ""}`.trim();
    const available = execution.status === 0;
    const version = available ? extractVersion(output) : undefined;
    tools[probe.id] = { available, ...(version === undefined ? {} : { version }) };

    if (!available) {
      diagnostics.push({
        code: probe.required ? "TOOL_REQUIRED_MISSING" : "TOOL_OPTIONAL_MISSING",
        severity: probe.required ? "error" : "warning",
        message: `${probe.id} is not available`
      });
      continue;
    }

    const expected = probe.lockKey === undefined ? undefined : lock.tools?.[probe.lockKey];
    if (typeof expected === "string" && version !== expected) {
      diagnostics.push({
        code: "TOOL_VERSION_MISMATCH",
        severity: "error",
        message: `${probe.id} ${version ?? "unknown"} does not match locked version ${expected}`
      });
    }
  }

  return {
    diagnostics,
    data: { root, profile: lock.profile, tools },
    nextActions: diagnostics.some((item) => item.severity === "error")
      ? ["Install the locked required toolchain and run game doctor again"]
      : ["Run game validate --format json"]
  };
}

