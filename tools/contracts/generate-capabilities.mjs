import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(toolDirectory, "../..");
const sourcePath = resolve(root, "contracts/capability-catalog.source.json");
const capabilitiesDirectory = resolve(root, "capabilities");
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const entries = await readdir(capabilitiesDirectory, { withFileTypes: true });
const manifests = [];

for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
  if (!entry.isDirectory()) {
    continue;
  }

  const manifestPath = resolve(capabilitiesDirectory, entry.name, "capability.json");
  manifests.push(JSON.parse(await readFile(manifestPath, "utf8")));
}

const output = {
  _generated: "tools/contracts/generate-capabilities.mjs",
  schemaVersion: source.schemaVersion,
  engineVersion: source.engineVersion,
  capabilities: manifests,
  platforms: source.platforms
};

const outputPath = resolve(root, "CAPABILITIES.json");
const serialized = `${JSON.stringify(output, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== serialized) {
    throw new Error("CAPABILITY_CATALOG_STALE: run pnpm contracts");
  }
} else {
  await writeFile(outputPath, serialized, "utf8");
}
