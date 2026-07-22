import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const schemaPath = resolve(root, "contracts/control-protocol.schema.json");
const outputPath = resolve(root, "cli/src/generated/control-protocol.ts");
const schema = JSON.parse(await readFile(schemaPath, "utf8"));
const version = schema.$defs?.request?.properties?.protocolVersion?.const;
const operations = schema.$defs?.request?.properties?.operation?.enum;
const statuses = schema.$defs?.response?.properties?.status?.enum;
if (!Number.isInteger(version) || !Array.isArray(operations) || !Array.isArray(statuses)) {
  throw new Error("CONTROL_PROTOCOL_SCHEMA_UNSUPPORTED");
}
const union = (values) => values.map((value) => JSON.stringify(value)).join(" | ");
const output = `// Generated from control-protocol.schema.json. Do not edit.\n\n` +
  `export const CONTROL_PROTOCOL_VERSION = ${version} as const;\n` +
  `export type ControlOperation = ${union(operations)};\n` +
  `export type ControlStatus = ${union(statuses)};\n` +
  `export type ControlPayload = Record<string, unknown>;\n` +
  `export interface ControlRequest { protocolVersion: typeof CONTROL_PROTOCOL_VERSION; requestId: number; token: string; operation: ControlOperation; payload: ControlPayload; }\n` +
  `export interface ControlResponse { protocolVersion: typeof CONTROL_PROTOCOL_VERSION; requestId: number; status: ControlStatus; data?: unknown; diagnostic?: { code: string; message: string }; }\n`;

if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== output) throw new Error("CONTROL_PROTOCOL_BINDINGS_STALE: run pnpm contracts");
} else {
  await writeFile(outputPath, output, "utf8");
}
