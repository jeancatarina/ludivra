// Generated from control-protocol.schema.json. Do not edit.

export const CONTROL_PROTOCOL_VERSION = 1 as const;
export type ControlOperation = "health" | "load_scenario" | "act" | "wait_for" | "inspect" | "capture" | "metrics" | "verify_replay" | "shutdown";
export type ControlStatus = "PASS" | "FAIL" | "INCONCLUSIVE";
export type ControlPayload = Record<string, unknown>;
export interface ControlRequest { protocolVersion: typeof CONTROL_PROTOCOL_VERSION; requestId: number; token: string; operation: ControlOperation; payload: ControlPayload; }
export interface ControlResponse { protocolVersion: typeof CONTROL_PROTOCOL_VERSION; requestId: number; status: ControlStatus; data?: unknown; diagnostic?: { code: string; message: string }; }
