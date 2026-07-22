import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(toolDirectory, "../..");
const sourcePath = resolve(root, "contracts/capability-catalog.source.json");
const manifestSchemaPath = resolve(root, "contracts/capability-manifest.schema.json");
const catalogSchemaPath = resolve(root, "contracts/capability-catalog.schema.json");
const capabilitiesDirectory = resolve(root, "capabilities");
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const [manifestSchema, catalogSchema] = await Promise.all([
  readFile(manifestSchemaPath, "utf8").then(JSON.parse),
  readFile(catalogSchemaPath, "utf8").then(JSON.parse)
]);
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(manifestSchema);
const validateManifest = ajv.getSchema(manifestSchema.$id);
const validateCatalog = ajv.compile(catalogSchema);
const entries = await readdir(capabilitiesDirectory, { withFileTypes: true });
const manifests = [];

for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
  if (!entry.isDirectory()) {
    continue;
  }

  const manifestPath = resolve(capabilitiesDirectory, entry.name, "capability.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (validateManifest === undefined || !validateManifest(manifest)) {
    throw new Error(`CAPABILITY_MANIFEST_INVALID:${entry.name}:${ajv.errorsText(validateManifest?.errors)}`);
  }
  for (const path of [manifest.owner, ...manifest.contracts, ...manifest.examples]) {
    await access(resolve(root, path)).catch(() => {
      throw new Error(`CAPABILITY_PATH_MISSING:${manifest.id}:${path}`);
    });
  }
  manifests.push(manifest);
}

const ids = new Set(manifests.map((manifest) => manifest.id));
if (ids.size !== manifests.length) {
  throw new Error("CAPABILITY_ID_DUPLICATE");
}
for (const manifest of manifests) {
  for (const dependency of manifest.dependencies) {
    if (!ids.has(dependency)) {
      throw new Error(`CAPABILITY_DEPENDENCY_MISSING:${manifest.id}:${dependency}`);
    }
  }
}

const output = {
  _generated: "tools/contracts/generate-capabilities.mjs",
  schemaVersion: source.schemaVersion,
  engineVersion: source.engineVersion,
  capabilities: manifests,
  platforms: source.platforms
};
if (!validateCatalog(output)) {
  throw new Error(`CAPABILITY_CATALOG_INVALID:${ajv.errorsText(validateCatalog.errors)}`);
}

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
