// Generated from contracts/desktop-host.schema.json. Do not edit.

export const DESKTOP_HOST_PROTOCOL_VERSION = 1 as const;
export type DesktopPlatform = "darwin" | "linux" | "win32";
export type DesktopServiceId = "storage.local" | "diagnostics.crash" | "diagnostics.logs" | "steam.achievements" | "steam.cloud" | "steam.overlay" | "steam.user" | "updates.desktop";
export type ServiceAvailability = "available" | "unavailable";
export type DesktopUpdateStatus = "disabled" | "checking" | "available" | "current" | "error";
export type DesktopLifecycleEvent = "suspend" | "resume";

export interface DesktopServiceStatus { id: DesktopServiceId; availability: ServiceAvailability; reason?: string; }
export interface DesktopHostInfo { protocolVersion: typeof DESKTOP_HOST_PROTOCOL_VERSION; platform: DesktopPlatform; packaged: boolean; services: DesktopServiceStatus[]; }
export interface DesktopCurrentUser { id: string; displayName: string; }
export interface DesktopBridge {
  info(): Promise<DesktopHostInfo>;
  storage: { read(slot: string): Promise<Uint8Array | null>; readBackup(slot: string): Promise<Uint8Array | null>; write(slot: string, data: Uint8Array): Promise<void>; delete(slot: string): Promise<void>; };
  achievements: { unlock(id: string): Promise<void>; };
  cloud: { read(slot: string): Promise<Uint8Array | null>; write(slot: string, data: Uint8Array): Promise<void>; delete(slot: string): Promise<void>; };
  user: { current(): Promise<DesktopCurrentUser>; };
  overlay: { activate(dialog: string): Promise<void>; };
  updates: { check(): Promise<DesktopUpdateStatus>; };
  onLifecycle(listener: (event: DesktopLifecycleEvent) => void): () => void;
  onCheckpointRequested(listener: () => Promise<void>): () => void;
}
