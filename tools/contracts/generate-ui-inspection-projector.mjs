import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(toolDirectory, "../..");
const schemaPath = resolve(root, "contracts/ui-inspection-projector.schema.json");
const outputPath = resolve(root, "presentation-protocol/src/generated/ui-inspection-projector.ts");
const schema = JSON.parse(await readFile(schemaPath, "utf8"));

const version = schema.properties?.projectorVersion?.const;
const kind = schema.properties?.kind?.const;
const access = schema["x-ludivra"]?.access;
const execution = schema["x-ludivra"]?.execution;
const stateReads = schema["x-ludivra"]?.measurement?.stateReads;
const uiNodes = schema["x-ludivra"]?.measurement?.uiNodes;
if (
  !Number.isInteger(version) ||
  typeof kind !== "string" ||
  typeof access !== "string" ||
  typeof execution !== "string" ||
  typeof stateReads !== "string" ||
  typeof uiNodes !== "string"
) {
  throw new Error("UI_INSPECTION_PROJECTOR_SCHEMA_UNSUPPORTED");
}

const output = `// Generated from contracts/ui-inspection-projector.schema.json. Do not edit.\n\n` +
  `export const UI_INSPECTION_PROJECTOR_VERSION = ${version} as const;\n` +
  `export const UI_INSPECTION_PROJECTOR_KIND = ${JSON.stringify(kind)} as const;\n` +
  `export const UI_INSPECTION_PROJECTOR_ACCESS = ${JSON.stringify(access)} as const;\n` +
  `export const UI_INSPECTION_PROJECTOR_EXECUTION = ${JSON.stringify(execution)} as const;\n` +
  `export const UI_INSPECTION_PROJECTOR_STATE_READS_FORMULA = ${JSON.stringify(stateReads)} as const;\n` +
  `export const UI_INSPECTION_PROJECTOR_UI_NODES_FORMULA = ${JSON.stringify(uiNodes)} as const;\n\n` +
  `export interface UiInspectionProjectorDeclaration {\n` +
  `  projectorVersion: typeof UI_INSPECTION_PROJECTOR_VERSION;\n` +
  `  id: string;\n` +
  `  kind: typeof UI_INSPECTION_PROJECTOR_KIND;\n` +
  `  screen: string;\n` +
  `  states: string[];\n` +
  `  inputs: string[];\n` +
  `}\n`;

if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== output) throw new Error("UI_INSPECTION_PROJECTOR_BINDINGS_STALE: run pnpm contracts");
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, "utf8");
}
