import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const schemaPath = resolve(root, "contracts/presentation-events.schema.json");
const headerPath = resolve(root, "runtime-c-api/include/ludivra/presentation_events.h");
const typesPath = resolve(root, "runtime-web/src/generated/presentation-events.ts");
const kernelPath = resolve(root, "kernel/src/generated/presentation_events.hpp");
const schema = JSON.parse(await readFile(schemaPath, "utf8"));
const version = schema.properties?.protocolVersion?.const;
const recordSize = schema.properties?.recordSize?.const;
const maximum = schema.properties?.maxBufferedEvents?.const;
const events = schema.properties?.eventTypes?.const;
if (!Number.isInteger(version) || !Number.isInteger(recordSize) || !Number.isInteger(maximum) ||
    typeof events !== "object" || events === null || Object.values(events).some((value) => !Number.isInteger(value))) {
  throw new Error("PRESENTATION_EVENT_SCHEMA_UNSUPPORTED");
}

const header = `// Generated from contracts/presentation-events.schema.json. Do not edit.\n` +
  `#ifndef LUDIVRA_PRESENTATION_EVENTS_H\n#define LUDIVRA_PRESENTATION_EVENTS_H\n\n` +
  `#include <stdint.h>\n\n` +
  `#define LUDIVRA_PRESENTATION_PROTOCOL_VERSION ${version}U\n` +
  `#define LUDIVRA_PRESENTATION_EVENT_RECORD_SIZE ${recordSize}U\n` +
  `#define LUDIVRA_MAX_BUFFERED_PRESENTATION_EVENTS ${maximum}U\n\n` +
  `typedef enum ludivra_presentation_event_type {\n` +
  `  LUDIVRA_PRESENTATION_AUDIO_PLAY = ${events.audioPlay},\n` +
  `  LUDIVRA_PRESENTATION_AUDIO_STOP = ${events.audioStop},\n` +
  `  LUDIVRA_PRESENTATION_EFFECT_SPAWN = ${events.effectSpawn}\n` +
  `} ludivra_presentation_event_type;\n\n` +
  `typedef struct ludivra_presentation_event {\n` +
  `  uint32_t struct_size;\n  uint32_t type;\n  uint32_t id;\n  int32_t value_milli;\n` +
  `  int32_t x_milli;\n  int32_t y_milli;\n  int32_t z_milli;\n  uint32_t reserved;\n` +
  `  uint64_t sequence;\n} ludivra_presentation_event;\n\n#endif\n`;

const types = `// Generated from contracts/presentation-events.schema.json. Do not edit.\n\n` +
  `export const PRESENTATION_PROTOCOL_VERSION = ${version} as const;\n` +
  `export const PRESENTATION_EVENT_RECORD_SIZE = ${recordSize} as const;\n` +
  `export const MAX_BUFFERED_PRESENTATION_EVENTS = ${maximum} as const;\n` +
  `export const PRESENTATION_EVENT_TYPES = ${JSON.stringify(events, null, 2)} as const;\n\n` +
  `export interface AudioPlayEvent { type: \"audio-play\"; id: number; volumeMilli: number; sequence: bigint; }\n` +
  `export interface AudioStopEvent { type: \"audio-stop\"; id: number; sequence: bigint; }\n` +
  `export interface EffectSpawnEvent { type: \"effect-spawn\"; id: number; intensityMilli: number; position: readonly [number, number, number]; sequence: bigint; }\n` +
  `export type PresentationEvent = AudioPlayEvent | AudioStopEvent | EffectSpawnEvent;\n`;
const kernel = `// Generated from contracts/presentation-events.schema.json. Do not edit.\n` +
  `#pragma once\n\n#include <cstddef>\n\nnamespace ludivra::kernel::contract {\n` +
  `inline constexpr std::size_t maximum_presentation_events = ${maximum};\n` +
  `}  // namespace ludivra::kernel::contract\n`;

await Promise.all([
  mkdir(resolve(headerPath, ".."), { recursive: true }),
  mkdir(resolve(typesPath, ".."), { recursive: true }),
  mkdir(resolve(kernelPath, ".."), { recursive: true })
]);
if (process.argv.includes("--check")) {
  const [currentHeader, currentTypes, currentKernel] = await Promise.all([
    readFile(headerPath, "utf8").catch(() => ""),
    readFile(typesPath, "utf8").catch(() => ""),
    readFile(kernelPath, "utf8").catch(() => "")
  ]);
  if (currentHeader !== header || currentTypes !== types || currentKernel !== kernel) {
    throw new Error("PRESENTATION_EVENT_BINDINGS_STALE: run pnpm contracts");
  }
} else {
  await Promise.all([writeFile(headerPath, header), writeFile(typesPath, types), writeFile(kernelPath, kernel)]);
}
