import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(toolDirectory, "../..");
const viewModelPath = resolve(root, "contracts/ui-view-model.schema.json");
const snapshotPath = resolve(root, "contracts/rendered-ui-snapshot.schema.json");
const outputPath = resolve(root, "presentation-protocol/src/generated/ui.ts");

const viewModel = JSON.parse(await readFile(viewModelPath, "utf8"));
const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));

const viewModelVersion = viewModel.properties?.protocolVersion?.const;
const snapshotVersion = snapshot.properties?.protocolVersion?.const;
const roles = viewModel.$defs?.role?.enum;
const states = viewModel.$defs?.presentationState?.enum;
const actions = viewModel.$defs?.action?.enum;
const renderers = snapshot.properties?.renderer?.enum;

if (
  !Number.isInteger(viewModelVersion) ||
  !Number.isInteger(snapshotVersion) ||
  !Array.isArray(roles) ||
  !Array.isArray(states) ||
  !Array.isArray(actions) ||
  !Array.isArray(renderers)
) {
  throw new Error("UI_CONTRACT_SCHEMA_UNSUPPORTED: expected protocolVersion, role, state, action and renderer enums");
}

const union = (values) => values.map((value) => JSON.stringify(value)).join(" | ");
const output = `// Generated from contracts/ui-view-model.schema.json and contracts/rendered-ui-snapshot.schema.json. Do not edit.\n\n` +
`export const UI_VIEW_MODEL_PROTOCOL_VERSION = ${viewModelVersion} as const;\n` +
`export const RENDERED_UI_SNAPSHOT_PROTOCOL_VERSION = ${snapshotVersion} as const;\n\n` +
`export type UiRole = ${union(roles)};\n` +
`export type UiPresentationState = ${union(states)};\n` +
`export type UiAction = ${union(actions)};\n` +
`export type UiRendererId = ${union(renderers)};\n\n` +
`export interface UiIntent {\n` +
`  actionId: number;\n` +
`  valueMilli: number;\n` +
`}\n\n` +
`export interface UiNavigation {\n` +
`  previous?: string;\n` +
`  next?: string;\n` +
`}\n\n` +
`export interface UiNode {\n` +
`  id: string;\n` +
`  role: UiRole;\n` +
`  labelKey: string;\n` +
`  labelParams: Record<string, string>;\n` +
`  state: UiPresentationState;\n` +
`  enabled: boolean;\n` +
`  selected: boolean;\n` +
`  actions: UiAction[];\n` +
`  intent?: UiIntent;\n` +
`  navigation?: UiNavigation;\n` +
`}\n\n` +
`export interface UiViewModel {\n` +
`  protocolVersion: typeof UI_VIEW_MODEL_PROTOCOL_VERSION;\n` +
`  screen: string;\n` +
`  focus: string | null;\n` +
`  nodes: UiNode[];\n` +
`}\n\n` +
`export interface UiBounds {\n` +
`  x: number;\n` +
`  y: number;\n` +
`  width: number;\n` +
`  height: number;\n` +
`}\n\n` +
`export interface RenderedUiNode {\n` +
`  id: string;\n` +
`  bounds: UiBounds;\n` +
`  visible: boolean;\n` +
`  clipped: boolean;\n` +
`  focused: boolean;\n` +
`  text: string;\n` +
`  accessibleRole: string;\n` +
`  contrastRatio?: number;\n` +
`}\n\n` +
`export interface RenderedUiSnapshot {\n` +
`  protocolVersion: typeof RENDERED_UI_SNAPSHOT_PROTOCOL_VERSION;\n` +
`  renderer: UiRendererId;\n` +
`  viewport: { width: number; height: number };\n` +
`  textScale: number;\n` +
`  locale: string;\n` +
`  breakpoint: string;\n` +
`  nodes: RenderedUiNode[];\n` +
`}\n`;

if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== output) {
    throw new Error("UI_CONTRACT_BINDING_STALE: run pnpm contracts");
  }
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, "utf8");
}
