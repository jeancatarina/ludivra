import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(toolDirectory, "../..");
const sourcePath = resolve(root, "contracts/content-migrations-v1.json");
const outputPath = resolve(root, "content-compiler/src/generated/content-migrations.ts");
const source = JSON.parse(await readFile(sourcePath, "utf8"));

const registryVersion = source.registryVersion;
const migrations = source.migrations;
if (!Number.isInteger(registryVersion) || !Array.isArray(migrations)) {
  throw new Error("CONTENT_MIGRATION_REGISTRY_UNSUPPORTED");
}
const identifiers = new Set();
const transitions = new Set();
for (const migration of migrations) {
  if (
    typeof migration?.id !== "string" ||
    typeof migration?.from?.schema !== "string" ||
    !Number.isInteger(migration?.from?.schemaVersion) ||
    typeof migration?.to?.schema !== "string" ||
    !Number.isInteger(migration?.to?.schemaVersion) ||
    !Array.isArray(migration?.operations) ||
    typeof migration?.fixtures?.input !== "string" ||
    typeof migration?.fixtures?.output !== "string"
  ) {
    throw new Error("CONTENT_MIGRATION_REGISTRY_UNSUPPORTED");
  }
  if (identifiers.has(migration.id)) throw new Error(`CONTENT_MIGRATION_ID_DUPLICATE: ${migration.id}`);
  identifiers.add(migration.id);
  const transition = `${migration.from.schema}@${migration.from.schemaVersion}`;
  if (transitions.has(transition)) throw new Error(`CONTENT_MIGRATION_AMBIGUOUS: ${transition}`);
  transitions.add(transition);
  for (const operation of migration.operations) {
    if (operation?.op !== "rename" || typeof operation.from !== "string" || typeof operation.to !== "string") {
      throw new Error(`CONTENT_MIGRATION_OPERATION_UNSUPPORTED: ${migration.id}`);
    }
  }
}

const output = `// Generated from contracts/content-migrations-v1.json. Do not edit.\n\n` +
  `export const CONTENT_MIGRATION_REGISTRY_VERSION = ${registryVersion} as const;\n\n` +
  `export interface ContentSchemaIdentity { schema: string; schemaVersion: number; }\n` +
  `export interface RenameContentMigrationOperation { op: "rename"; from: string; to: string; }\n` +
  `export type ContentMigrationOperation = RenameContentMigrationOperation;\n` +
  `export interface ContentMigrationSpec {\n` +
  `  id: string;\n` +
  `  from: ContentSchemaIdentity;\n` +
  `  to: ContentSchemaIdentity;\n` +
  `  operations: readonly ContentMigrationOperation[];\n` +
  `  fixtures: { input: string; output: string };\n` +
  `}\n\n` +
  `export const CONTENT_MIGRATIONS: readonly ContentMigrationSpec[] = ${JSON.stringify(migrations, null, 2)} as const;\n`;

if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== output) throw new Error("CONTENT_MIGRATION_BINDINGS_STALE: run pnpm contracts");
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, "utf8");
}
