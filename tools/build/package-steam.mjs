import { spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "jsonc-parser";

const engineRoot = resolve(import.meta.dirname, "../..");
const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const projectDirectory = resolve(argument("--project") ?? "examples/first-game");
const platform = argument("--platform") ?? "darwin";
const supportedPlatforms = new Set(["darwin", "win32", "linux"]);
if (!supportedPlatforms.has(platform)) {
  throw new Error(`unsupported Electron platform: ${platform}`);
}

const manifest = parse(await readFile(resolve(projectDirectory, "game.jsonc"), "utf8"));
if (typeof manifest?.id !== "string" || typeof manifest?.name !== "string") {
  throw new Error("game manifest must define id and name");
}

const stagingRoot = resolve(engineRoot, "build/steam-staging");
const staging = resolve(stagingRoot, manifest.id);
if (!staging.startsWith(`${stagingRoot}/`)) {
  throw new Error("invalid staging path");
}
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
await cp(resolve(engineRoot, "hosts/electron/src/main.cjs"), resolve(staging, "main.cjs"));
await cp(resolve(engineRoot, "hosts/browser/dist"), resolve(staging, "web"), { recursive: true });
await cp(resolve(engineRoot, "LICENSE"), resolve(staging, "LICENSE"));
await cp(resolve(engineRoot, "THIRD_PARTY_NOTICES.md"), resolve(staging, "THIRD_PARTY_NOTICES.md"));
await writeFile(resolve(staging, "package.json"), `${JSON.stringify({
  name: manifest.id,
  productName: manifest.name,
  version: "0.1.0",
  main: "main.cjs"
}, null, 2)}\n`);

const output = resolve(engineRoot, "build/steam");
await mkdir(output, { recursive: true });
await new Promise((resolveProcess, rejectProcess) => {
  const child = spawn("pnpm", [
    "--filter",
    "@ludivra/electron-host",
    "exec",
    "electron-packager",
    staging,
    manifest.name,
    `--platform=${platform}`,
    "--arch=x64",
    "--electron-version=43.1.1",
    `--out=${output}`,
    "--overwrite",
    "--prune=false"
  ], { cwd: engineRoot, stdio: "inherit" });
  child.once("error", rejectProcess);
  child.once("exit", (code) => code === 0 ? resolveProcess() : rejectProcess(
    new Error(`electron-packager failed with exit code ${code}`)
  ));
});

const steamMetadata = resolve(output, `${manifest.id}-steam`);
await mkdir(steamMetadata, { recursive: true });
if (Number.isInteger(manifest.steam?.appId) && Number.isInteger(manifest.steam?.depotId)) {
  await writeFile(resolve(steamMetadata, `app_build_${manifest.steam.appId}.vdf`), `"AppBuild"\n{\n  "AppID" "${manifest.steam.appId}"\n  "Desc" "Ludivra local build"\n  "ContentRoot" "${output}"\n  "Depots"\n  {\n    "${manifest.steam.depotId}" "depot_build_${manifest.steam.depotId}.vdf"\n  }\n}\n`);
  await writeFile(resolve(steamMetadata, `depot_build_${manifest.steam.depotId}.vdf`), `"DepotBuildConfig"\n{\n  "DepotID" "${manifest.steam.depotId}"\n  "ContentRoot" "${output}"\n  "FileMapping"\n  {\n    "LocalPath" "*"\n    "DepotPath" "."\n    "recursive" "1"\n  }\n}\n`);
} else {
  await writeFile(resolve(steamMetadata, "STEAMWORKS_REQUIRED.txt"),
    "Defina steam.appId e steam.depotId em game.jsonc para gerar os scripts SteamPipe.\n" +
    "O upload exige uma conta Steamworks autorizada e o SDK oficial.\n");
}

process.stdout.write(`${resolve(output, `${manifest.name}-${platform}-x64`)}\n`);
