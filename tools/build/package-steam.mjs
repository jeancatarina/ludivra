import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import {
  cp, lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, writeFile
} from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { parse } from "jsonc-parser";

const engineRoot = resolve(import.meta.dirname, "../..");
const electronVersion = "43.1.1";
const steamworksVersion = "0.4.0";
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

const manifestSource = await readFile(resolve(projectDirectory, "game.jsonc"), "utf8");
const manifest = parse(manifestSource);
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
const desktopWebIndex = await readFile(resolve(engineRoot, "hosts/browser/dist/index.html"), "utf8");
if (/(?:src|href)="\/assets\//.test(desktopWebIndex)) {
  throw new Error("desktop web build must use LUDIVRA_BASE=./ before packaging");
}
for (const file of ["main.cjs", "preload.cjs"]) {
  await cp(resolve(engineRoot, "hosts/electron/src", file), resolve(staging, file));
}
for (const directory of ["generated", "services"]) {
  await cp(
    resolve(engineRoot, "hosts/electron/src", directory),
    resolve(staging, directory),
    { recursive: true }
  );
}
await cp(resolve(engineRoot, "hosts/browser/dist"), resolve(staging, "web"), { recursive: true });
await cp(resolve(engineRoot, "LICENSE"), resolve(staging, "LICENSE"));
await cp(resolve(engineRoot, "THIRD_PARTY_NOTICES.md"), resolve(staging, "THIRD_PARTY_NOTICES.md"));
await mkdir(resolve(staging, "node_modules"), { recursive: true });
await cp(
  resolve(engineRoot, "hosts/electron/node_modules/steamworks.js"),
  resolve(staging, "node_modules/steamworks.js"),
  { recursive: true, dereference: true }
);
const updateConfiguration = manifest.desktop?.updates;
await writeFile(resolve(staging, "desktop-config.json"), `${JSON.stringify({
  protocolVersion: 1,
  steamAppId: Number.isInteger(manifest.steam?.appId) ? manifest.steam.appId : null,
  updatesEnabled: updateConfiguration?.enabled === true,
  updateFeedUrl: typeof updateConfiguration?.feedUrl === "string"
    ? updateConfiguration.feedUrl
    : null
}, null, 2)}\n`);
await writeFile(resolve(staging, "package.json"), `${JSON.stringify({
  name: manifest.id,
  productName: manifest.name,
  version: "0.1.0",
  main: "main.cjs",
  dependencies: { "steamworks.js": steamworksVersion }
}, null, 2)}\n`);

const output = resolve(engineRoot, "build/steam");
await mkdir(output, { recursive: true });
await run("pnpm", [
  "--filter",
  "@ludivra/electron-host",
  "exec",
  "electron-packager",
  staging,
  manifest.name,
  `--platform=${platform}`,
  "--arch=x64",
  `--electron-version=${electronVersion}`,
  `--out=${output}`,
  "--overwrite",
  "--prune=false"
], { cwd: engineRoot, stdio: "inherit" });

const packageDirectory = resolve(output, `${manifest.name}-${platform}-x64`);
const steamMetadata = resolve(output, `${manifest.id}-steam`);
await rm(steamMetadata, { recursive: true, force: true });
await mkdir(steamMetadata, { recursive: true });
const packageHashes = await hashDirectory(packageDirectory);
await writeFile(resolve(steamMetadata, "SHA256SUMS"),
  `${packageHashes.files.map((file) => `${file.hash}  ${file.path}`).join("\n")}\n`);

const lockHash = await hashFile(resolve(engineRoot, "pnpm-lock.yaml"));
const toolchainHash = await hashFile(resolve(engineRoot, "toolchain.lock"));
const manifestHash = hashBytes(Buffer.from(manifestSource));
const git = gitState();
const smoke = await smokeTest(packageDirectory, platform, manifest.name);
const provenance = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  subject: { path: packageDirectory, sha256: packageHashes.aggregate },
  source: { repository: git.repository, commit: git.commit, dirty: git.dirty },
  inputs: { gameManifestSha256: manifestHash, pnpmLockSha256: lockHash, toolchainLockSha256: toolchainHash },
  build: { platform, architecture: "x64", electronVersion, command: "game package" },
  verification: { smoke }
};
await writeFile(resolve(steamMetadata, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);
await writeFile(resolve(steamMetadata, "sbom.cdx.json"), `${JSON.stringify(
  createSbom(manifest, lockHash, toolchainHash), null, 2
)}\n`);

if (Number.isInteger(manifest.steam?.appId) && Number.isInteger(manifest.steam?.depotId)) {
  const appId = manifest.steam.appId;
  const depotId = manifest.steam.depotId;
  const depotFile = resolve(steamMetadata, `depot_build_${depotId}.vdf`);
  await writeFile(resolve(steamMetadata, `app_build_${appId}.vdf`), `"AppBuild"\n{\n  "AppID" "${appId}"\n  "Desc" "Ludivra verified local build ${git.commit}"\n  "Depots"\n  {\n    "${depotId}" "${vdf(depotFile)}"\n  }\n}\n`);
  await writeFile(depotFile, `"DepotBuildConfig"\n{\n  "DepotID" "${depotId}"\n  "ContentRoot" "${vdf(packageDirectory)}"\n  "FileMapping"\n  {\n    "LocalPath" "*"\n    "DepotPath" "."\n    "recursive" "1"\n  }\n}\n`);
} else {
  await writeFile(resolve(steamMetadata, "STEAMWORKS_REQUIRED.txt"),
    "Defina steam.appId e steam.depotId em game.jsonc para gerar os scripts SteamPipe.\n" +
    "Assinatura e upload exigem conta Steamworks autorizada, SDK oficial e validação no OS alvo.\n");
}

process.stdout.write(`${packageDirectory}\n`);

async function run(command, arguments_, options) {
  await new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, arguments_, options);
    child.once("error", rejectProcess);
    child.once("exit", (code) => code === 0 ? resolveProcess() : rejectProcess(
      new Error(`${command} failed with exit code ${code}`)
    ));
  });
}

function hashBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function hashFile(file) {
  const hash = createHash("sha256");
  await new Promise((resolveStream, rejectStream) => {
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", rejectStream);
    stream.once("end", resolveStream);
  });
  return hash.digest("hex");
}

async function hashDirectory(directory) {
  const entriesForHash = [];
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const file = join(current, entry.name);
      const name = relative(directory, file).split("\\").join("/");
      if (entry.isDirectory()) {
        await visit(file);
      } else if (entry.isSymbolicLink()) {
        entriesForHash.push({ path: name, hash: hashBytes(Buffer.from(`link:${await readlink(file)}`)), kind: "link" });
      } else if ((await lstat(file)).isFile()) {
        entriesForHash.push({ path: name, hash: await hashFile(file), kind: "file" });
      }
    }
  }
  await visit(directory);
  const files = entriesForHash.filter((entry) => entry.kind === "file");
  return {
    files,
    aggregate: hashBytes(Buffer.from(
      entriesForHash.map((entry) => `${entry.kind}:${entry.hash}  ${entry.path}`).join("\n")
    ))
  };
}

function gitState() {
  const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: engineRoot, encoding: "utf8" });
  const status = spawnSync("git", ["status", "--porcelain"], { cwd: engineRoot, encoding: "utf8" });
  const remote = spawnSync("git", ["remote", "get-url", "origin"], { cwd: engineRoot, encoding: "utf8" });
  return {
    repository: remote.status === 0 ? remote.stdout.trim() : "unknown",
    commit: commit.status === 0 ? commit.stdout.trim() : "unknown",
    dirty: status.status !== 0 || status.stdout.trim().length > 0
  };
}

async function smokeTest(directory, targetPlatform, productName) {
  if (targetPlatform !== process.platform) {
    return { status: "not-run", reason: `cross-packaged on ${process.platform}` };
  }
  const executable = targetPlatform === "darwin"
    ? resolve(directory, `${productName}.app/Contents/MacOS/${productName}`)
    : targetPlatform === "win32"
      ? resolve(directory, `${productName}.exe`)
      : resolve(directory, productName);
  const smokeRoot = await mkdtemp(resolve(engineRoot, "build/desktop-smoke-"));
  try {
    await run(executable, targetPlatform === "linux" ? ["--no-sandbox"] : [], {
      cwd: directory,
      env: { ...process.env, LUDIVRA_SMOKE_TEST: "1", LUDIVRA_SMOKE_USER_DATA: smokeRoot },
      stdio: "inherit"
    });
    return { status: "passed", executable };
  } finally {
    await rm(smokeRoot, { recursive: true, force: true });
  }
}

function createSbom(game, lockfileHash, lockedToolchainHash) {
  const components = [
    ["Lua", "5.4.8", "library", "pkg:generic/lua@5.4.8", "MIT"],
    ["three", "0.185.1", "library", "pkg:npm/three@0.185.1", "MIT"],
    ["Electron", electronVersion, "framework", `pkg:npm/electron@${electronVersion}`, "MIT"],
    ["steamworks.js", steamworksVersion, "library", `pkg:npm/steamworks.js@${steamworksVersion}`, "MIT"]
  ].map(([name, version, type, purl, license]) => ({
    type, name, version, purl, licenses: [{ license: { id: license } }]
  }));
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    serialNumber: `urn:uuid:${randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      component: { type: "application", name: game.name, version: "0.1.0" },
      properties: [
        { name: "ludivra:pnpm-lock:sha256", value: lockfileHash },
        { name: "ludivra:toolchain-lock:sha256", value: lockedToolchainHash }
      ]
    },
    components
  };
}

function vdf(value) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
