import assert from "node:assert/strict";
import test from "node:test";
import type { LogicalInput, LudivraNetworkRoom, NetworkPeerHello, NetworkRoomSnapshot } from "@ludivra/runtime-web";
import {
  HostedRoomBridge,
  RemoteRoomClientBridge,
  decodeNetworkHashReport,
  decodeNetworkSnapshot,
  encodeNetworkHashReport,
  encodeNetworkHello,
  encodeNetworkInput,
  encodeNetworkSnapshot,
  type HostedRoomDivergence,
  type RemoteRoomRuntime
} from "../src/network/room-bridge.js";
import type { NetworkPacket } from "../src/network/webrtc-transport.js";
import {
  HostedChunkSync,
  RemoteChunkSync,
  createNetworkChunkDelta,
  type NetworkChunkDelta
} from "../src/network/chunk-sync.js";

const world = { seed: 42n, generatorId: "ember-vault", generatorVersion: 3, contentHash: 0x44aabbccn };

class FakeRoom {
  private tickValue = 0n;
  readonly inputs: Array<{ clientId: number; input: LogicalInput }> = [];
  readonly connected: NetworkPeerHello[] = [];

  connect(hello: NetworkPeerHello): number {
    this.connected.push(hello);
    return this.connected.length;
  }

  submitInput(clientId: number, input: LogicalInput): void {
    this.inputs.push({ clientId, input });
  }

  rejectClientState(): void {
    throw new Error("NETWORK_CLIENT_SENT_STATE");
  }

  advance(): NetworkRoomSnapshot {
    this.tickValue += 1n;
    return this.snapshot();
  }

  snapshot(): NetworkRoomSnapshot {
    return {
      tick: this.tickValue,
      stateHash: 0x100n + this.tickValue,
      archive: Uint8Array.of(Number(this.tickValue + 1n))
    };
  }
}

test("host bridge maps input, identifies the earliest divergent tick, and resends canonical state", async () => {
  const room = new FakeRoom();
  const sent: Array<{ peerId: string; packet: NetworkPacket }> = [];
  const divergences: HostedRoomDivergence[] = [];
  const bridge = new HostedRoomBridge({
    room: room as unknown as LudivraNetworkRoom,
    send: (peerId, packet) => { sent.push({ peerId, packet }); },
    onDivergence: (divergence) => { divergences.push(divergence); }
  });

  await bridge.receive("steam:42", encodeNetworkHello({ protocolVersion: 2, world }));
  assert.equal(room.connected.length, 1);
  assert.deepEqual(decodeNetworkSnapshot(sent[0]?.packet ?? { kind: "input", payload: new Uint8Array() }), room.snapshot());

  await bridge.receive("steam:42", encodeNetworkInput({ actionId: 7, valueMilli: -500, sequence: 8n }));
  assert.deepEqual(room.inputs, [{ clientId: 1, input: { actionId: 7, valueMilli: -500, sequence: 8n } }]);
  await bridge.advance();

  await bridge.receive("steam:42", encodeNetworkHashReport([
    { tick: 0n, stateHash: 0x777n },
    { tick: 1n, stateHash: 0x101n }
  ]));
  assert.deepEqual(divergences, [{
    code: "NETWORK_WORLD_HASH_MISMATCH",
    peerId: "steam:42",
    firstDivergentTick: 0n,
    hostStateHash: 0x100n,
    clientStateHash: 0x777n,
    correctionTick: 1n
  }]);
  assert.equal(sent.length, 3);
  assert.deepEqual(decodeNetworkSnapshot(sent[2]?.packet ?? { kind: "input", payload: new Uint8Array() }), room.snapshot());
});

test("remote bridge reports a local mismatch then restores the checked canonical archive", async () => {
  let tick = 1n;
  let hash = 0x999n;
  const runtime: RemoteRoomRuntime = {
    tick: () => tick,
    stateHash: () => hash,
    loadSave: (archive) => {
      tick = BigInt((archive[0] ?? 0) - 1);
      hash = 0x100n + tick;
    }
  };
  const sent: NetworkPacket[] = [];
  const bridge = new RemoteRoomClientBridge({ runtime, send: (packet) => { sent.push(packet); } });
  await bridge.receive(encodeNetworkSnapshot({ tick: 1n, stateHash: 0x101n, archive: Uint8Array.of(2) }));
  assert.deepEqual(decodeNetworkHashReport(sent[0] ?? { kind: "input", payload: new Uint8Array() }), [{ tick: 1n, stateHash: 0x999n }]);
  assert.equal(runtime.tick(), 1n);
  assert.equal(runtime.stateHash(), 0x101n);
});

test("chunk sync sends deltas only, drains acknowledged backlog, and refuses unbounded queues", async () => {
  const outbound: Array<{ peerId: string; packet: NetworkPacket }> = [];
  const applied: NetworkChunkDelta[] = [];
  const host = new HostedChunkSync({ send: (peerId, packet) => { outbound.push({ peerId, packet }); }, maximumPendingDeltas: 1 });
  const remote = new RemoteChunkSync({
    apply: (delta) => { applied.push(delta); },
    send: async (packet) => host.receive("steam:42", packet)
  });
  const first = createNetworkChunkDelta(
    { dimension: 0, regionX: 1, regionY: 2, regionZ: 3, chunkX: 4, chunkY: 5, chunkZ: 6 },
    1n,
    Uint8Array.of(7, 8, 9)
  );
  await host.publish(["steam:42"], [first]);
  assert.equal(host.pendingCount("steam:42"), 1);
  await remote.receive(outbound[0]?.packet ?? { kind: "input", payload: new Uint8Array() });
  assert.deepEqual(applied, [first]);
  assert.equal(host.pendingCount("steam:42"), 0);

  const second = createNetworkChunkDelta(
    { dimension: 0, regionX: 2, regionY: 2, regionZ: 3, chunkX: 4, chunkY: 5, chunkZ: 6 },
    1n,
    Uint8Array.of(1)
  );
  await host.publish(["steam:42"], [first]);
  await assert.rejects(() => host.publish(["steam:42"], [second]), { message: /NETWORK_CHUNK_DELTA_BACKLOG/ });
});

test("room lifecycle routes chunk acknowledgements to the bounded host queue", async () => {
  const room = new FakeRoom();
  const outbound: Array<{ peerId: string; packet: NetworkPacket }> = [];
  let chunkHost: HostedChunkSync;
  const roomHost = new HostedRoomBridge({
    room: room as unknown as LudivraNetworkRoom,
    send: (peerId, packet) => { outbound.push({ peerId, packet }); },
    onChunkPacket: async (peerId, packet) => chunkHost.receive(peerId, packet)
  });
  chunkHost = new HostedChunkSync({ send: (peerId, packet) => { outbound.push({ peerId, packet }); } });
  await roomHost.receive("webrtc:friend", encodeNetworkHello({ protocolVersion: 2, world }));
  const remote = new RemoteChunkSync({
    apply: () => {},
    send: async (packet) => roomHost.receive("webrtc:friend", packet)
  });
  const delta = createNetworkChunkDelta(
    { dimension: 1, regionX: 0, regionY: 0, regionZ: 0, chunkX: 2, chunkY: 0, chunkZ: 0 },
    1n,
    Uint8Array.of(4, 2)
  );
  await chunkHost.publish(roomHost.peerIds(), [delta]);
  await remote.receive(outbound[1]?.packet ?? { kind: "input", payload: new Uint8Array() });
  assert.equal(chunkHost.pendingCount("webrtc:friend"), 0);
});
