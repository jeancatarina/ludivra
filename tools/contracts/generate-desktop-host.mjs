import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const schemaPath = resolve(root, "contracts/desktop-host.schema.json");
const typesPath = resolve(root, "platform-contracts/src/generated/desktop-host.ts");
const channelsPath = resolve(root, "hosts/electron/src/generated/desktop-channels.cjs");
const preloadTemplatePath = resolve(root, "hosts/electron/src/preload.template.cjs");
const preloadPath = resolve(root, "hosts/electron/src/preload.cjs");
const schema = JSON.parse(await readFile(schemaPath, "utf8"));
const version = schema.properties?.protocolVersion?.const;
const platforms = schema.properties?.platform?.enum;
const serviceIds = schema.$defs?.serviceId?.enum;
const availabilities = schema.$defs?.serviceStatus?.properties?.availability?.enum;
const updateStatuses = schema.$defs?.updateStatus?.enum;
const lifecycleEvents = schema.$defs?.lifecycleEvent?.enum;
const channels = schema["x-channels"];

if (!Number.isInteger(version) || !Array.isArray(platforms) || !Array.isArray(serviceIds) ||
    !Array.isArray(availabilities) || !Array.isArray(updateStatuses) ||
    !Array.isArray(lifecycleEvents) || typeof channels !== "object" || channels === null) {
  throw new Error("DESKTOP_HOST_SCHEMA_UNSUPPORTED");
}

const union = (values) => values.map((value) => JSON.stringify(value)).join(" | ");
const typeOutput = `// Generated from contracts/desktop-host.schema.json. Do not edit.\n\n` +
  `export const DESKTOP_HOST_PROTOCOL_VERSION = ${version} as const;\n` +
  `export type DesktopPlatform = ${union(platforms)};\n` +
  `export type DesktopServiceId = ${union(serviceIds)};\n` +
  `export type ServiceAvailability = ${union(availabilities)};\n` +
  `export type DesktopUpdateStatus = ${union(updateStatuses)};\n` +
  `export type DesktopLifecycleEvent = ${union(lifecycleEvents)};\n\n` +
  `export interface DesktopServiceStatus { id: DesktopServiceId; availability: ServiceAvailability; reason?: string; }\n` +
  `export interface DesktopHostInfo { protocolVersion: typeof DESKTOP_HOST_PROTOCOL_VERSION; platform: DesktopPlatform; packaged: boolean; services: DesktopServiceStatus[]; }\n` +
  `export interface DesktopCurrentUser { id: string; displayName: string; }\n` +
  `export interface DesktopBridge {\n` +
  `  info(): Promise<DesktopHostInfo>;\n` +
  `  storage: { read(slot: string): Promise<Uint8Array | null>; readBackup(slot: string): Promise<Uint8Array | null>; write(slot: string, data: Uint8Array): Promise<void>; delete(slot: string): Promise<void>; };\n` +
  `  achievements: { unlock(id: string): Promise<void>; };\n` +
  `  cloud: { read(slot: string): Promise<Uint8Array | null>; write(slot: string, data: Uint8Array): Promise<void>; delete(slot: string): Promise<void>; };\n` +
  `  user: { current(): Promise<DesktopCurrentUser>; };\n` +
  `  overlay: { activate(dialog: string): Promise<void>; };\n` +
  `  updates: { check(): Promise<DesktopUpdateStatus>; };\n` +
  `  onLifecycle(listener: (event: DesktopLifecycleEvent) => void): () => void;\n` +
  `  onCheckpointRequested(listener: () => Promise<void>): () => void;\n` +
  `}\n`;
const channelOutput = `// Generated from contracts/desktop-host.schema.json. Do not edit.\n` +
  `module.exports = Object.freeze(${JSON.stringify(channels, null, 2)});\n`;
const preloadTemplate = await readFile(preloadTemplatePath, "utf8");
const preloadOutput = `// Generated from desktop-host.schema.json and preload.template.cjs. Do not edit.\n` +
  preloadTemplate.replace("__LUDIVRA_DESKTOP_CHANNELS__", JSON.stringify(channels, null, 2));

await mkdir(resolve(typesPath, ".."), { recursive: true });
await mkdir(resolve(channelsPath, ".."), { recursive: true });
if (process.argv.includes("--check")) {
  const [currentTypes, currentChannels, currentPreload] = await Promise.all([
    readFile(typesPath, "utf8").catch(() => ""),
    readFile(channelsPath, "utf8").catch(() => ""),
    readFile(preloadPath, "utf8").catch(() => "")
  ]);
  if (currentTypes !== typeOutput || currentChannels !== channelOutput || currentPreload !== preloadOutput) {
    throw new Error("DESKTOP_HOST_BINDINGS_STALE: run pnpm contracts");
  }
} else {
  await Promise.all([
    writeFile(typesPath, typeOutput),
    writeFile(channelsPath, channelOutput),
    writeFile(preloadPath, preloadOutput)
  ]);
}
