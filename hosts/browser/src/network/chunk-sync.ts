import type { NetworkPacket } from "./webrtc-transport.js";
import type { RuntimeRegionDelta } from "@ludivra/runtime-web";

const chunkWireVersion = 1;
const chunkDeltaKind = 1;
const chunkAckKind = 2;
const deltaHeaderBytes = 52;
const ackBytes = 48;
const maximumDeltaPayloadBytes = 64 * 1024;
const maximumUint64 = 0xffff_ffff_ffff_ffffn;
const fnvOffset = 14695981039346656037n;
const fnvPrime = 1099511628211n;

export interface NetworkChunkKey {
  dimension: number;
  regionX: number;
  regionY: number;
  regionZ: number;
  chunkX: number;
  chunkY: number;
  chunkZ: number;
}

export interface NetworkChunkDelta {
  key: NetworkChunkKey;
  revision: bigint;
  contentHash: bigint;
  payload: Uint8Array;
}

export interface NetworkChunkDivergence {
  code: "NETWORK_WORLD_HASH_MISMATCH";
  peerId?: string;
  key: NetworkChunkKey;
  revision: bigint;
  hostContentHash: bigint;
  clientContentHash: bigint;
}

export interface HostedChunkSyncOptions {
  send(peerId: string, packet: NetworkPacket): void | Promise<void>;
  maximumPendingDeltas?: number;
  onDivergence?: (divergence: NetworkChunkDivergence) => void | Promise<void>;
}

export interface RemoteChunkSyncOptions {
  apply(delta: NetworkChunkDelta): void | Promise<void>;
  send(packet: NetworkPacket): void | Promise<void>;
  onDivergence?: (divergence: NetworkChunkDivergence) => void | Promise<void>;
}

export class NetworkChunkSyncFailure extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new NetworkChunkSyncFailure(code, message);
}

function isUint16(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xffff;
}

function isInt32(value: number): boolean {
  return Number.isInteger(value) && value >= -0x8000_0000 && value <= 0x7fff_ffff;
}

function keyIsValid(key: NetworkChunkKey): boolean {
  return isUint16(key.dimension) && isInt32(key.regionX) && isInt32(key.regionY) && isInt32(key.regionZ) &&
    isInt32(key.chunkX) && isInt32(key.chunkY) && isInt32(key.chunkZ);
}

function keyText(key: NetworkChunkKey): string {
  return `${key.dimension}:${key.regionX}:${key.regionY}:${key.regionZ}:${key.chunkX}:${key.chunkY}:${key.chunkZ}`;
}

function writeKey(view: DataView, offset: number, key: NetworkChunkKey): void {
  view.setUint16(offset, key.dimension, true);
  view.setInt32(offset + 4, key.regionX, true);
  view.setInt32(offset + 8, key.regionY, true);
  view.setInt32(offset + 12, key.regionZ, true);
  view.setInt32(offset + 16, key.chunkX, true);
  view.setInt32(offset + 20, key.chunkY, true);
  view.setInt32(offset + 24, key.chunkZ, true);
}

function readKey(view: DataView, offset: number): NetworkChunkKey {
  return {
    dimension: view.getUint16(offset, true),
    regionX: view.getInt32(offset + 4, true),
    regionY: view.getInt32(offset + 8, true),
    regionZ: view.getInt32(offset + 12, true),
    chunkX: view.getInt32(offset + 16, true),
    chunkY: view.getInt32(offset + 20, true),
    chunkZ: view.getInt32(offset + 24, true)
  };
}

function validateDelta(delta: NetworkChunkDelta): void {
  if (!keyIsValid(delta.key) || delta.revision < 1n || delta.revision > maximumUint64 ||
      delta.contentHash < 0n || delta.contentHash > maximumUint64 || delta.payload.byteLength > maximumDeltaPayloadBytes) {
    fail("NETWORK_CHUNK_INVALID", "chunk key, revision, hash, or payload budget is invalid");
  }
}

/** FNV-1a over the semantic address, revision and opaque delta bytes. This is
 * an integrity/fingerprint check, not a claim of cryptographic authenticity. */
export function networkChunkContentHash(key: NetworkChunkKey, revision: bigint, payload: Uint8Array): bigint {
  if (!keyIsValid(key) || revision < 1n || revision > maximumUint64 || payload.byteLength > maximumDeltaPayloadBytes) {
    return fail("NETWORK_CHUNK_INVALID", "chunk hash input is invalid");
  }
  const metadata = new Uint8Array(36);
  const view = new DataView(metadata.buffer);
  writeKey(view, 0, key);
  view.setBigUint64(28, revision, true);
  let hash = fnvOffset;
  for (const byte of metadata) hash = ((hash ^ BigInt(byte)) * fnvPrime) & maximumUint64;
  for (const byte of payload) hash = ((hash ^ BigInt(byte)) * fnvPrime) & maximumUint64;
  return hash;
}

export function createNetworkChunkDelta(key: NetworkChunkKey, revision: bigint, payload: Uint8Array): NetworkChunkDelta {
  return { key, revision, contentHash: networkChunkContentHash(key, revision, payload), payload: payload.slice() };
}

/** Converts the Runtime's committed overlay feed to the transport-neutral
 * chunk record. Callers publish the result only after an authoritative tick. */
export function networkChunkDeltaFromRuntime(delta: RuntimeRegionDelta): NetworkChunkDelta {
  return createNetworkChunkDelta({
    dimension: delta.dimension,
    regionX: delta.regionX,
    regionY: delta.regionY,
    regionZ: delta.regionZ,
    chunkX: delta.chunkX,
    chunkY: delta.chunkY,
    chunkZ: delta.chunkZ
  }, delta.revision, delta.payload);
}

/** A chunk packet carries deltas only: generated terrain is intentionally never
 * put on the wire. Ack packets contain only the observed hash. */
export function encodeNetworkChunkDelta(delta: NetworkChunkDelta): NetworkPacket {
  validateDelta(delta);
  if (networkChunkContentHash(delta.key, delta.revision, delta.payload) !== delta.contentHash) {
    return fail("NETWORK_CHUNK_HASH_MISMATCH", "declared chunk hash does not match its delta bytes");
  }
  const payload = new Uint8Array(deltaHeaderBytes + delta.payload.byteLength);
  const view = new DataView(payload.buffer);
  view.setUint8(0, chunkWireVersion);
  view.setUint8(1, chunkDeltaKind);
  writeKey(view, 4, delta.key);
  view.setBigUint64(32, delta.revision, true);
  view.setBigUint64(40, delta.contentHash, true);
  view.setUint32(48, delta.payload.byteLength, true);
  payload.set(delta.payload, deltaHeaderBytes);
  return { kind: "chunk", payload };
}

interface NetworkChunkAck {
  key: NetworkChunkKey;
  revision: bigint;
  contentHash: bigint;
}

function encodeNetworkChunkAck(ack: NetworkChunkAck): NetworkPacket {
  if (!keyIsValid(ack.key) || ack.revision < 1n || ack.revision > maximumUint64 || ack.contentHash < 0n || ack.contentHash > maximumUint64) {
    return fail("NETWORK_CHUNK_INVALID", "chunk ack is invalid");
  }
  const payload = new Uint8Array(ackBytes);
  const view = new DataView(payload.buffer);
  view.setUint8(0, chunkWireVersion);
  view.setUint8(1, chunkAckKind);
  writeKey(view, 4, ack.key);
  view.setBigUint64(32, ack.revision, true);
  view.setBigUint64(40, ack.contentHash, true);
  return { kind: "chunk", payload };
}

type DecodedChunkPacket =
  | { type: "delta"; delta: NetworkChunkDelta }
  | { type: "ack"; ack: NetworkChunkAck };

function decodeNetworkChunkPacket(packet: NetworkPacket): DecodedChunkPacket {
  if (packet.kind !== "chunk" || packet.payload.byteLength < ackBytes || packet.payload.byteLength > deltaHeaderBytes + maximumDeltaPayloadBytes) {
    return fail("NETWORK_CHUNK_INVALID", "chunk packet kind or size is invalid");
  }
  const view = new DataView(packet.payload.buffer, packet.payload.byteOffset, packet.payload.byteLength);
  if (view.getUint8(0) !== chunkWireVersion) return fail("NETWORK_PROTOCOL_VERSION_UNSUPPORTED", "chunk wire version is unsupported");
  const key = readKey(view, 4);
  const revision = view.getBigUint64(32, true);
  const contentHash = view.getBigUint64(40, true);
  if (!keyIsValid(key) || revision < 1n) return fail("NETWORK_CHUNK_INVALID", "chunk address or revision is invalid");
  if (view.getUint8(1) === chunkAckKind) {
    if (packet.payload.byteLength !== ackBytes) return fail("NETWORK_CHUNK_INVALID", "chunk ack size is invalid");
    return { type: "ack", ack: { key, revision, contentHash } };
  }
  if (view.getUint8(1) !== chunkDeltaKind || packet.payload.byteLength < deltaHeaderBytes) {
    return fail("NETWORK_CHUNK_INVALID", "chunk packet type is invalid");
  }
  const payloadBytes = view.getUint32(48, true);
  if (payloadBytes !== packet.payload.byteLength - deltaHeaderBytes) return fail("NETWORK_CHUNK_INVALID", "chunk delta length is invalid");
  return { type: "delta", delta: { key, revision, contentHash, payload: packet.payload.slice(deltaHeaderBytes) } };
}

/** Host-owned pending queues are bounded per peer. A full queue is explicit
 * `NETWORK_CHUNK_DELTA_BACKLOG`, never an ever-growing retransmission list. */
export class HostedChunkSync {
  private readonly pending = new Map<string, Map<string, NetworkChunkDelta>>();
  private readonly maximumPendingDeltas: number;

  constructor(private readonly options: HostedChunkSyncOptions) {
    const maximumPendingDeltas = options.maximumPendingDeltas ?? 64;
    if (!Number.isInteger(maximumPendingDeltas) || maximumPendingDeltas < 1 || maximumPendingDeltas > 1024) {
      fail("NETWORK_CHUNK_INVALID", "maximumPendingDeltas must be an integer from 1 through 1024");
    }
    this.maximumPendingDeltas = maximumPendingDeltas;
  }

  async publish(peerIds: readonly string[], deltas: readonly NetworkChunkDelta[]): Promise<void> {
    const verified = deltas.map((delta) => {
      validateDelta(delta);
      if (networkChunkContentHash(delta.key, delta.revision, delta.payload) !== delta.contentHash) {
        return fail("NETWORK_CHUNK_HASH_MISMATCH", "host delta hash does not match its bytes");
      }
      return { key: keyText(delta.key), delta: { ...delta, payload: delta.payload.slice() } };
    });
    const peers = Array.from(new Set(peerIds));
    for (const peerId of peers) {
      if (peerId.length === 0) fail("NETWORK_PEER_INVALID", "peer id must not be empty");
      const queue = this.pending.get(peerId) ?? new Map<string, NetworkChunkDelta>();
      const newKeys = verified.filter(({ key }) => !queue.has(key)).length;
      if (queue.size + newKeys > this.maximumPendingDeltas) {
        return fail("NETWORK_CHUNK_DELTA_BACKLOG", `peer ${peerId} exceeds ${this.maximumPendingDeltas} pending chunk deltas`);
      }
    }
    for (const peerId of peers) {
      let queue = this.pending.get(peerId);
      if (queue === undefined) {
        queue = new Map();
        this.pending.set(peerId, queue);
      }
      for (const { key, delta } of verified) queue.set(key, delta);
    }
    await Promise.all(peers.flatMap((peerId) => verified.map(async ({ delta }) => this.options.send(peerId, encodeNetworkChunkDelta(delta)))));
  }

  async resend(peerId: string): Promise<void> {
    const queue = this.pending.get(peerId);
    if (queue === undefined) return;
    await Promise.all(Array.from(queue.values(), async (delta) => this.options.send(peerId, encodeNetworkChunkDelta(delta))));
  }

  pendingCount(peerId: string): number {
    return this.pending.get(peerId)?.size ?? 0;
  }

  async receive(peerId: string, packet: NetworkPacket): Promise<void> {
    const decoded = decodeNetworkChunkPacket(packet);
    if (decoded.type !== "ack") fail("NETWORK_CLIENT_SENT_STATE", "clients may acknowledge chunks but cannot submit chunk deltas");
    const queue = this.pending.get(peerId);
    const expected = queue?.get(keyText(decoded.ack.key));
    if (expected === undefined || expected.revision !== decoded.ack.revision) {
      fail("NETWORK_CHUNK_ACK_UNKNOWN", "chunk ack is not pending for this peer");
    }
    if (expected.contentHash === decoded.ack.contentHash) {
      queue?.delete(keyText(decoded.ack.key));
      return;
    }
    await this.options.onDivergence?.({
      code: "NETWORK_WORLD_HASH_MISMATCH",
      peerId,
      key: expected.key,
      revision: expected.revision,
      hostContentHash: expected.contentHash,
      clientContentHash: decoded.ack.contentHash
    });
  }
}

/** Remote side applies only validated host deltas, then acknowledges the
 * observed hash. An invalid payload is reported but never applied. */
export class RemoteChunkSync {
  constructor(private readonly options: RemoteChunkSyncOptions) {}

  async receive(packet: NetworkPacket): Promise<void> {
    const decoded = decodeNetworkChunkPacket(packet);
    if (decoded.type !== "delta") fail("NETWORK_PACKET_UNEXPECTED", "host must not send chunk acknowledgements");
    const observed = networkChunkContentHash(decoded.delta.key, decoded.delta.revision, decoded.delta.payload);
    if (observed !== decoded.delta.contentHash) {
      await this.options.send(encodeNetworkChunkAck({ key: decoded.delta.key, revision: decoded.delta.revision, contentHash: observed }));
      await this.options.onDivergence?.({
        code: "NETWORK_WORLD_HASH_MISMATCH",
        key: decoded.delta.key,
        revision: decoded.delta.revision,
        hostContentHash: decoded.delta.contentHash,
        clientContentHash: observed
      });
      return fail("NETWORK_CHUNK_HASH_MISMATCH", "received chunk delta fails its hash check");
    }
    await this.options.apply(decoded.delta);
    await this.options.send(encodeNetworkChunkAck({ key: decoded.delta.key, revision: decoded.delta.revision, contentHash: observed }));
  }
}
