import { resolve } from "node:path";
import { optionValue } from "../arguments.js";
import { runProcess } from "../process-runner.js";
import { readGameManifest, resolveProjectDirectory } from "../project.js";
import { findEngineRoot } from "../repository.js";
import type { CommandOutcome } from "../result.js";
import { runBuild } from "./build.js";

const platforms: Record<string, string> = {
  "steam-macos": "darwin",
  "steam-windows": "win32",
  "steam-linux": "linux"
};

export async function runPackage(arguments_: string[]): Promise<CommandOutcome> {
  const target = optionValue(arguments_, "--target") ?? "steam-macos";
  const platform = platforms[target];
  if (platform === undefined) {
    return {
      diagnostics: [{ code: "PACKAGE_TARGET_UNSUPPORTED", severity: "error", message: `Unsupported target: ${target}` }],
      nextActions: ["Use steam-macos, steam-windows, or steam-linux"]
    };
  }
  const build = await runBuild(arguments_);
  if (build.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return build;
  }
  const root = await findEngineRoot();
  const project = await resolveProjectDirectory(arguments_);
  const manifest = await readGameManifest(project);
  const result = await runProcess(
    "node",
    ["tools/build/package-steam.mjs", "--project", project, "--platform", platform],
    { cwd: root, env: process.env }
  );
  if (result.exitCode !== 0) {
    return {
      diagnostics: [{ code: "STEAM_PACKAGE_FAILED", severity: "error", message: result.output.trim() }],
      nextActions: ["Inspect Electron packaging output and retry"]
    };
  }
  const executableDirectory = resolve(root, "build/steam", `${manifest.name}-${platform}-x64`);
  const steamMetadata = resolve(root, "build/steam", `${manifest.id}-steam`);
  const configured = manifest.steam?.appId !== null && manifest.steam?.appId !== undefined &&
    manifest.steam.depotId !== null && manifest.steam.depotId !== undefined;
  return {
    diagnostics: configured ? [] : [{
      code: "STEAM_IDS_NOT_CONFIGURED",
      severity: "warning",
      message: "Desktop package is ready; SteamPipe scripts require appId and depotId."
    }],
    artifacts: [
      { kind: "steam-desktop-package", path: executableDirectory },
      { kind: "steam-metadata", path: steamMetadata }
    ],
    data: { project, target, steamPipeConfigured: configured },
    nextActions: configured
      ? ["Upload with SteamCMD from an authorized Steamworks SDK environment"]
      : ["Set steam.appId and steam.depotId, then package again"]
  };
}
