// Generated from contracts/presentation-events.schema.json. Do not edit.

export const PRESENTATION_PROTOCOL_VERSION = 1 as const;
export const PRESENTATION_EVENT_RECORD_SIZE = 40 as const;
export const MAX_BUFFERED_PRESENTATION_EVENTS = 4096 as const;
export const PRESENTATION_EVENT_TYPES = {
  "audioPlay": 1,
  "audioStop": 2,
  "effectSpawn": 3
} as const;

export interface AudioPlayEvent { type: "audio-play"; id: number; volumeMilli: number; sequence: bigint; }
export interface AudioStopEvent { type: "audio-stop"; id: number; sequence: bigint; }
export interface EffectSpawnEvent { type: "effect-spawn"; id: number; intensityMilli: number; position: readonly [number, number, number]; sequence: bigint; }
export type PresentationEvent = AudioPlayEvent | AudioStopEvent | EffectSpawnEvent;
