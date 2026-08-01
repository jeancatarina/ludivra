import {
  type LogicalInput,
  type LudivraNetworkRoom,
  type NetworkPeerHello,
  type NetworkRoomSnapshot,
  type NetworkWorldIdentity
} from "@ludivra/runtime-web";
import type { NetworkPacket } from "./webrtc-transport.js";

const logicalProtocolVersion = 1;
const snapshotHeaderBytes = 16;
const hashReportHeaderBytes = 4;
const hashSampleBytes = 16;
const maximumLogicalPacketBytes = 4 * 1024 * 1024;
const maximumUint64 = 0xffff_ffff_ffff_ffffn;

export interface HostedRoomCarrier {
  send(packet: NetworkPacket): void | Promise<void>;
  onPacket(handler: (packet: NetworkPacket) => void, onError: (error: Error) => void): void;
}

export interface HostedRoomBridgeOptions {
  room: LudivraNetworkRoom;
  /** Sends to an opaque, player-owned transport identity. It may be WebRTC,
   * Steam P2P, LAN, or a test carrier; no game state crosses this boundary. */
  send(peerId: string, packet: NetworkPacket): void | Promise<void>;
  /** Number of authoritative snapshots retained for a peer's later hash report.
   * The default is two seconds at the standard 60 Hz tick rate. */
  historyTicks?: number;
  onDivergence?: (divergence: HostedRoomDivergence) => void | Promise<void>;
  onChunkPacket?: (peerId: string, packet: NetworkPacket) => void | Promise<void>;
}

export interface DecodedSnapshot {
  tick: bigint;
  stateHash: bigint;
  archive: Uint8Array;
}

export interface NetworkHashSample {
  tick: bigint;
  stateHash: bigint;
}

export interface HostedRoomDivergence {
  code: "NETWORK_WORLD_HASH_MISMATCH";
  peerId: string;
  firstDivergentTick: bigint;
  hostStateHash: bigint;
  clientStateHash: bigint;
  correctionTick: bigint;
}

export interface RemoteRoomRuntime {
  tick(): bigint;
  stateHash(): bigint;
  loadSave(archive: Uint8Array): void;
}

export interface RemoteRoomClientBridgeOptions {
  runtime: RemoteRoomRuntime;
  send(packet: NetworkPacket): void | Promise<void>;
  historyTicks?: number;
  onDivergence?: (divergence: RemoteSnapshotDivergence) => void | Promise<void>;
  onChunkPacket?: (packet: NetworkPacket) => void | Promise<void>;
}

export interface RemoteSnapshotDivergence {
  code: "NETWORK_WORLD_HASH_MISMATCH";
  tick: bigint;
  hostStateHash: bigint;
  clientStateHash: bigint;
}

/** Stable, inspectable error code for the semantic room layer. */
export class HostedRoomBridgeFailure extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new HostedRoomBridgeFailure(code, message);
}

function isUint32(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff;
}

function parseUnsigned(value: unknown, field: string): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    return fail("NETWORK_PAYLOAD_INVALID", `${field} must be an unsigned decimal string`);
  }
  try {
    const parsed = BigInt(value);
    if (parsed > maximumUint64) return fail("NETWORK_PAYLOAD_INVALID", `${field} exceeds uint64`);
    return parsed;
  } catch {
    return fail("NETWORK_PAYLOAD_INVALID", `${field} is outside the supported unsigned range`);
  }
}

function parseJson(payload: Uint8Array, expected: string): Record<string, unknown> {
  if (payload.byteLength === 0 || payload.byteLength > 4096) fail("NETWORK_PAYLOAD_INVALID", `${expected} payload size is invalid`);
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(payload));
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return fail("NETWORK_PAYLOAD_INVALID", `${expected} payload must be an object`);
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HostedRoomBridgeFailure) throw error;
    return fail("NETWORK_PAYLOAD_INVALID", `${expected} payload is not valid UTF-8 JSON`);
  }
}

function encodeJson(value: Record<string, unknown>): Uint8Array {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  if (encoded.byteLength > 4096) fail("NETWORK_PAYLOAD_INVALID", "logical JSON payload exceeds 4 KiB");
  return encoded;
}

function decodeWorld(value: unknown): NetworkWorldIdentity {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail("NETWORK_PAYLOAD_INVALID", "handshake world must be an object");
  }
  const world = value as Record<string, unknown>;
  if (typeof world.generatorId !== "string" || new TextEncoder().encode(world.generatorId).byteLength === 0 || new TextEncoder().encode(world.generatorId).byteLength > 128) {
    return fail("NETWORK_PAYLOAD_INVALID", "handshake generatorId must contain 1 through 128 UTF-8 bytes");
  }
  if (!isUint32(world.generatorVersion)) return fail("NETWORK_PAYLOAD_INVALID", "handshake generatorVersion must be an unsigned 32-bit integer");
  return {
    seed: parseUnsigned(world.seed, "handshake seed"),
    generatorId: world.generatorId,
    generatorVersion: world.generatorVersion,
    contentHash: parseUnsigned(world.contentHash, "handshake contentHash")
  };
}

/** Serializes a peer's immutable world identity. The JSON form keeps every
 * uint64 exact and is deliberately distinct from game-protocol serialization. */
export function encodeNetworkHello(hello: NetworkPeerHello): NetworkPacket {
  if (!isUint32(hello.protocolVersion) || !isUint32(hello.world.generatorVersion) || hello.world.seed < 0n || hello.world.seed > maximumUint64 || hello.world.contentHash < 0n || hello.world.contentHash > maximumUint64) {
    return fail("NETWORK_PAYLOAD_INVALID", "handshake fields are outside their ABI ranges");
  }
  const generatorBytes = new TextEncoder().encode(hello.world.generatorId).byteLength;
  if (generatorBytes === 0 || generatorBytes > 128) return fail("NETWORK_PAYLOAD_INVALID", "handshake generatorId must contain 1 through 128 UTF-8 bytes");
  return {
    kind: "handshake",
    payload: encodeJson({
      version: logicalProtocolVersion,
      protocolVersion: hello.protocolVersion,
      world: {
        seed: hello.world.seed.toString(),
        generatorId: hello.world.generatorId,
        generatorVersion: hello.world.generatorVersion,
        contentHash: hello.world.contentHash.toString()
      }
    })
  };
}

export function decodeNetworkHello(packet: NetworkPacket): NetworkPeerHello {
  if (packet.kind !== "handshake") return fail("NETWORK_PACKET_UNEXPECTED", "expected a handshake packet");
  const value = parseJson(packet.payload, "handshake");
  if (value.version !== logicalProtocolVersion || !isUint32(value.protocolVersion)) {
    return fail("NETWORK_PAYLOAD_INVALID", "handshake protocol version is invalid");
  }
  return { protocolVersion: value.protocolVersion, world: decodeWorld(value.world) };
}

export function encodeNetworkInput(input: LogicalInput): NetworkPacket {
  if (!isUint32(input.actionId) || !Number.isInteger(input.valueMilli) || input.valueMilli < -0x8000_0000 || input.valueMilli > 0x7fff_ffff || input.sequence < 0n) {
    return fail("NETWORK_PAYLOAD_INVALID", "logical input fields are outside their ABI ranges");
  }
  return {
    kind: "input",
    payload: encodeJson({ version: logicalProtocolVersion, actionId: input.actionId, valueMilli: input.valueMilli, sequence: input.sequence.toString() })
  };
}

export function decodeNetworkInput(packet: NetworkPacket): LogicalInput {
  if (packet.kind !== "input") return fail("NETWORK_PACKET_UNEXPECTED", "expected an input packet");
  const value = parseJson(packet.payload, "input");
  if (value.version !== logicalProtocolVersion || !isUint32(value.actionId) || typeof value.valueMilli !== "number" || !Number.isInteger(value.valueMilli) || value.valueMilli < -0x8000_0000 || value.valueMilli > 0x7fff_ffff) {
    return fail("NETWORK_PAYLOAD_INVALID", "logical input fields are invalid");
  }
  return { actionId: value.actionId, valueMilli: value.valueMilli, sequence: parseUnsigned(value.sequence, "input sequence") };
}

/** Snapshots stay byte-exact: little-endian tick/hash header then the canonical
 * runtime archive. The carrier marks these packets reliable. */
export function encodeNetworkSnapshot(snapshot: NetworkRoomSnapshot): NetworkPacket {
  if (snapshot.tick < 0n || snapshot.tick > maximumUint64 || snapshot.stateHash < 0n || snapshot.stateHash > maximumUint64 || snapshot.archive.byteLength === 0 || snapshot.archive.byteLength > maximumLogicalPacketBytes - snapshotHeaderBytes) {
    return fail("NETWORK_PAYLOAD_INVALID", "snapshot fields exceed the logical wire budget");
  }
  const payload = new Uint8Array(snapshotHeaderBytes + snapshot.archive.byteLength);
  const view = new DataView(payload.buffer);
  view.setBigUint64(0, snapshot.tick, true);
  view.setBigUint64(8, snapshot.stateHash, true);
  payload.set(snapshot.archive, snapshotHeaderBytes);
  return { kind: "snapshot", payload };
}

export function decodeNetworkSnapshot(packet: NetworkPacket): DecodedSnapshot {
  if (packet.kind !== "snapshot") return fail("NETWORK_PACKET_UNEXPECTED", "expected a snapshot packet");
  if (packet.payload.byteLength <= snapshotHeaderBytes || packet.payload.byteLength > maximumLogicalPacketBytes) {
    return fail("NETWORK_PAYLOAD_INVALID", "snapshot payload size is invalid");
  }
  const view = new DataView(packet.payload.buffer, packet.payload.byteOffset, packet.payload.byteLength);
  return {
    tick: view.getBigUint64(0, true),
    stateHash: view.getBigUint64(8, true),
    archive: packet.payload.slice(snapshotHeaderBytes)
  };
}

/** A client reports its recent local state hashes on the reliable correction
 * lane. The host compares the ordered samples against its bounded canonical
 * history and can name the first mismatching tick before resyncing. */
export function encodeNetworkHashReport(samples: readonly NetworkHashSample[]): NetworkPacket {
  if (samples.length === 0 || samples.length > 255 || hashReportHeaderBytes + samples.length * hashSampleBytes > maximumLogicalPacketBytes) {
    return fail("NETWORK_PAYLOAD_INVALID", "hash report sample count is invalid");
  }
  const payload = new Uint8Array(hashReportHeaderBytes + samples.length * hashSampleBytes);
  const view = new DataView(payload.buffer);
  view.setUint8(0, logicalProtocolVersion);
  view.setUint8(1, 1); // correction payload kind: ordered state-hash samples
  view.setUint16(2, samples.length, true);
  let previousTick = -1n;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (sample === undefined || sample.tick < 0n || sample.tick > maximumUint64 || sample.stateHash < 0n || sample.stateHash > maximumUint64 || sample.tick <= previousTick) {
      return fail("NETWORK_PAYLOAD_INVALID", "hash report samples must be strictly tick-ordered uint64 values");
    }
    const offset = hashReportHeaderBytes + index * hashSampleBytes;
    view.setBigUint64(offset, sample.tick, true);
    view.setBigUint64(offset + 8, sample.stateHash, true);
    previousTick = sample.tick;
  }
  return { kind: "correction", payload };
}

export function decodeNetworkHashReport(packet: NetworkPacket): NetworkHashSample[] {
  if (packet.kind !== "correction") return fail("NETWORK_PACKET_UNEXPECTED", "expected a correction/hash-report packet");
  if (packet.payload.byteLength < hashReportHeaderBytes || packet.payload.byteLength > maximumLogicalPacketBytes) {
    return fail("NETWORK_PAYLOAD_INVALID", "hash report payload size is invalid");
  }
  const view = new DataView(packet.payload.buffer, packet.payload.byteOffset, packet.payload.byteLength);
  const count = view.getUint16(2, true);
  if (view.getUint8(0) !== logicalProtocolVersion || view.getUint8(1) !== 1 || count === 0 || count > 255 || packet.payload.byteLength !== hashReportHeaderBytes + count * hashSampleBytes) {
    return fail("NETWORK_PAYLOAD_INVALID", "hash report header is invalid");
  }
  const samples: NetworkHashSample[] = [];
  let previousTick = -1n;
  for (let index = 0; index < count; index += 1) {
    const offset = hashReportHeaderBytes + index * hashSampleBytes;
    const sample = { tick: view.getBigUint64(offset, true), stateHash: view.getBigUint64(offset + 8, true) };
    if (sample.tick <= previousTick) return fail("NETWORK_PAYLOAD_INVALID", "hash report samples are not strictly tick-ordered");
    samples.push(sample);
    previousTick = sample.tick;
  }
  return samples;
}

/** Connects real transport envelopes to the C++ host-authoritative room.
 * Call `advance` from the host's deterministic tick. Incoming client snapshots
 * are rejected at the room boundary, never used as authoritative state. */
export class HostedRoomBridge {
  private readonly clients = new Map<string, number>();
  private readonly history = new Map<bigint, NetworkRoomSnapshot>();
  private readonly historyTicks: number;

  constructor(private readonly options: HostedRoomBridgeOptions) {
    const historyTicks = options.historyTicks ?? 120;
    if (!Number.isInteger(historyTicks) || historyTicks < 1 || historyTicks > 255) {
      fail("NETWORK_HISTORY_INVALID", "historyTicks must be an integer from 1 through 255");
    }
    this.historyTicks = historyTicks;
    this.remember(options.room.snapshot());
  }

  /** Attaches a WebRTC-style carrier. Steam callers can pass packets returned
   * by its explicit `read()` loop to `receive` instead. */
  bind(peerId: string, carrier: HostedRoomCarrier, onError: (error: Error) => void): void {
    carrier.onPacket((packet) => {
      void this.receive(peerId, packet).catch(onError);
    }, onError);
  }

  async receive(peerId: string, packet: NetworkPacket): Promise<void> {
    if (peerId.length === 0) fail("NETWORK_PEER_INVALID", "peer id must not be empty");
    if (packet.kind === "handshake") {
      const hello = decodeNetworkHello(packet);
      let clientId = this.clients.get(peerId);
      if (clientId === undefined) {
        clientId = this.options.room.connect(hello);
        this.clients.set(peerId, clientId);
      }
      await this.sendSnapshot(peerId);
      return;
    }

    const clientId = this.clients.get(peerId);
    if (clientId === undefined) fail("NETWORK_CLIENT_UNKNOWN", "handshake is required before room traffic");
    if (packet.kind === "input") {
      this.options.room.submitInput(clientId, decodeNetworkInput(packet));
      return;
    }

    if (packet.kind === "correction") {
      const divergence = this.findFirstDivergence(peerId, decodeNetworkHashReport(packet));
      if (divergence === undefined) return;
      // Recovery is sent before optional diagnostics so an observer cannot
      // accidentally turn mismatch reporting into a stalled game session.
      await this.sendSnapshot(peerId);
      await this.options.onDivergence?.(divergence);
      return;
    }

    if (packet.kind === "chunk") {
      if (this.options.onChunkPacket === undefined) fail("NETWORK_CHUNK_SYNC_UNAVAILABLE", "host has no chunk-sync handler");
      await this.options.onChunkPacket(peerId, packet);
      return;
    }

    // Any client-provided state/control envelope is diagnostic only. Preserve
    // the kernel's explicit rejection path before reporting it to the carrier.
    this.options.room.rejectClientState(clientId);
    fail("NETWORK_CLIENT_STATE_REJECTED", `${packet.kind} packets are host-only`);
  }

  /** Advances one authoritative tick and publishes the resulting canonical
   * snapshot to every connected peer. */
  async advance(): Promise<NetworkRoomSnapshot> {
    const snapshot = this.options.room.advance();
    this.remember(snapshot);
    const packet = encodeNetworkSnapshot(snapshot);
    await Promise.all(Array.from(this.clients.keys(), async (peerId) => this.options.send(peerId, packet)));
    return snapshot;
  }

  async publishSnapshot(peerId?: string): Promise<void> {
    if (peerId === undefined) {
      await Promise.all(Array.from(this.clients.keys(), async (id) => this.sendSnapshot(id)));
      return;
    }
    if (!this.clients.has(peerId)) fail("NETWORK_CLIENT_UNKNOWN", "cannot publish to an unknown peer");
    await this.sendSnapshot(peerId);
  }

  clientId(peerId: string): number | undefined {
    return this.clients.get(peerId);
  }

  peerIds(): string[] {
    return Array.from(this.clients.keys());
  }

  private async sendSnapshot(peerId: string): Promise<void> {
    await this.options.send(peerId, encodeNetworkSnapshot(this.options.room.snapshot()));
  }

  private remember(snapshot: NetworkRoomSnapshot): void {
    this.history.set(snapshot.tick, { tick: snapshot.tick, stateHash: snapshot.stateHash, archive: snapshot.archive.slice() });
    while (this.history.size > this.historyTicks) {
      const oldest = this.history.keys().next();
      if (oldest.done) break;
      this.history.delete(oldest.value);
    }
  }

  private findFirstDivergence(peerId: string, samples: readonly NetworkHashSample[]): HostedRoomDivergence | undefined {
    for (const sample of samples) {
      const host = this.history.get(sample.tick);
      if (host !== undefined && host.stateHash !== sample.stateHash) {
        const correction = this.options.room.snapshot();
        return {
          code: "NETWORK_WORLD_HASH_MISMATCH",
          peerId,
          firstDivergentTick: sample.tick,
          hostStateHash: host.stateHash,
          clientStateHash: sample.stateHash,
          correctionTick: correction.tick
        };
      }
    }
    return undefined;
  }
}

/** Client-side counterpart for a hosted room. It records local hashes supplied
 * by the game's client prediction, reports the first observed mismatch, then
 * restores the host's canonical LDSV archive. It never treats local state as
 * authority. */
export class RemoteRoomClientBridge {
  private readonly history = new Map<bigint, NetworkHashSample>();
  private readonly historyTicks: number;

  constructor(private readonly options: RemoteRoomClientBridgeOptions) {
    const historyTicks = options.historyTicks ?? 120;
    if (!Number.isInteger(historyTicks) || historyTicks < 1 || historyTicks > 255) {
      fail("NETWORK_HISTORY_INVALID", "historyTicks must be an integer from 1 through 255");
    }
    this.historyTicks = historyTicks;
  }

  recordLocalState(): NetworkHashSample {
    const sample = { tick: this.options.runtime.tick(), stateHash: this.options.runtime.stateHash() };
    if (sample.tick < 0n || sample.tick > maximumUint64 || sample.stateHash < 0n || sample.stateHash > maximumUint64) {
      return fail("NETWORK_PAYLOAD_INVALID", "runtime state hash is outside uint64");
    }
    this.remember(sample);
    return sample;
  }

  async receive(packet: NetworkPacket): Promise<void> {
    if (packet.kind === "chunk") {
      if (this.options.onChunkPacket === undefined) fail("NETWORK_CHUNK_SYNC_UNAVAILABLE", "client has no chunk-sync handler");
      await this.options.onChunkPacket(packet);
      return;
    }
    const snapshot = decodeNetworkSnapshot(packet);
    const local = this.recordLocalState();
    if (local.tick === snapshot.tick && local.stateHash !== snapshot.stateHash) {
      const samples = Array.from(this.history.values()).filter((sample) => sample.tick <= snapshot.tick);
      await this.options.send(encodeNetworkHashReport(samples));
      await this.options.onDivergence?.({ code: "NETWORK_WORLD_HASH_MISMATCH", tick: snapshot.tick, hostStateHash: snapshot.stateHash, clientStateHash: local.stateHash });
    }
    try {
      this.options.runtime.loadSave(snapshot.archive);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return fail("NETWORK_SNAPSHOT_INVALID", detail);
    }
    const restored = this.recordLocalState();
    if (restored.tick !== snapshot.tick || restored.stateHash !== snapshot.stateHash) {
      return fail("NETWORK_SNAPSHOT_INVALID", "loaded archive does not match its tick/hash header");
    }
  }

  private remember(sample: NetworkHashSample): void {
    this.history.set(sample.tick, sample);
    while (this.history.size > this.historyTicks) {
      const oldest = this.history.keys().next();
      if (oldest.done) break;
      this.history.delete(oldest.value);
    }
  }
}
