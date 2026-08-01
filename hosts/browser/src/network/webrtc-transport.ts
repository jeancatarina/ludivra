/**
 * Wire-neutral WebRTC DataChannel adapter. Signalling intentionally stays with
 * the game: callers exchange the SDP text through a channel of their choice
 * before giving the connected channels to this adapter. The reliable channel
 * carries handshake/snapshots/migration; realtime input never silently falls
 * back to reliable delivery.
 */
export const NETWORK_WIRE_VERSION = 1;
export type NetworkPacketKind = "handshake" | "input" | "snapshot" | "migration" | "correction";

const packetCodes: Readonly<Record<NetworkPacketKind, number>> = {
  handshake: 1,
  input: 2,
  snapshot: 3,
  migration: 4,
  correction: 5
};
const packetKinds = new Map<number, NetworkPacketKind>(Object.entries(packetCodes).map(([kind, code]) => [code, kind as NetworkPacketKind]));
const maximumPacketBytes = 4 * 1024 * 1024;

export interface NetworkPacket {
  kind: NetworkPacketKind;
  payload: Uint8Array;
}

export interface DataChannelPort {
  readonly readyState: RTCDataChannelState;
  binaryType: BinaryType;
  send(data: ArrayBufferView): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

function packetError(code: string, message: string): Error {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

export function encodeNetworkPacket(packet: NetworkPacket): Uint8Array {
  if (packet.payload.byteLength > maximumPacketBytes) throw packetError("NETWORK_PACKET_TOO_LARGE", "packet exceeds 4 MiB");
  const output = new Uint8Array(6 + packet.payload.byteLength);
  const view = new DataView(output.buffer);
  view.setUint8(0, NETWORK_WIRE_VERSION);
  view.setUint8(1, packetCodes[packet.kind]);
  view.setUint32(2, packet.payload.byteLength, true);
  output.set(packet.payload, 6);
  return output;
}

export function decodeNetworkPacket(data: ArrayBuffer | ArrayBufferView): NetworkPacket {
  const bytes = ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data);
  if (bytes.byteLength < 6 || bytes.byteLength > maximumPacketBytes + 6) {
    throw packetError("NETWORK_PACKET_INVALID", "packet header or budget is invalid");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint8(0) !== NETWORK_WIRE_VERSION) throw packetError("NETWORK_PROTOCOL_VERSION_UNSUPPORTED", "wire version is unsupported");
  const kind = packetKinds.get(view.getUint8(1));
  const size = view.getUint32(2, true);
  if (kind === undefined || size !== bytes.byteLength - 6) throw packetError("NETWORK_PACKET_INVALID", "packet type or length is invalid");
  return { kind, payload: bytes.slice(6) };
}

/** Builds and validates copyable signalling text without operating a signalling
 * service. The caller remains responsible for `setLocalDescription` and the
 * WebRTC lifecycle. */
export function encodeSignalingDescription(description: RTCSessionDescriptionInit): string {
  if ((description.type !== "offer" && description.type !== "answer") || typeof description.sdp !== "string" || description.sdp.length === 0) {
    throw packetError("NETWORK_SIGNALING_INVALID", "description requires offer/answer type and SDP");
  }
  return btoa(unescape(encodeURIComponent(JSON.stringify({ version: NETWORK_WIRE_VERSION, type: description.type, sdp: description.sdp }))));
}

export function decodeSignalingDescription(text: string): RTCSessionDescriptionInit {
  try {
    const value = JSON.parse(decodeURIComponent(escape(atob(text)))) as { version?: unknown; type?: unknown; sdp?: unknown };
    if (value.version !== NETWORK_WIRE_VERSION || (value.type !== "offer" && value.type !== "answer") || typeof value.sdp !== "string" || value.sdp.length === 0) {
      throw packetError("NETWORK_SIGNALING_INVALID", "description shape is invalid");
    }
    return { type: value.type, sdp: value.sdp };
  } catch (error) {
    if (error instanceof Error && "code" in error) throw error;
    throw packetError("NETWORK_SIGNALING_INVALID", "description is not valid copyable signalling text");
  }
}

export class WebRtcDataChannelTransport {
  private listener: ((event: MessageEvent) => void) | null = null;

  constructor(
    private readonly reliable: DataChannelPort,
    private readonly realtime: DataChannelPort
  ) {
    reliable.binaryType = "arraybuffer";
    realtime.binaryType = "arraybuffer";
  }

  send(packet: NetworkPacket): void {
    const channel = packet.kind === "input" ? this.realtime : this.reliable;
    if (channel.readyState !== "open") throw packetError("NETWORK_TRANSPORT_UNAVAILABLE", `${packet.kind} channel is not open`);
    channel.send(encodeNetworkPacket(packet));
  }

  onPacket(handler: (packet: NetworkPacket) => void, onError: (error: Error) => void): void {
    this.dispose();
    this.listener = (event) => {
      if (!(event.data instanceof ArrayBuffer) && !ArrayBuffer.isView(event.data)) {
        onError(packetError("NETWORK_PACKET_INVALID", "DataChannel must deliver binary packets"));
        return;
      }
      try {
        handler(decodeNetworkPacket(event.data));
      } catch (error) {
        onError(error instanceof Error ? error : packetError("NETWORK_PACKET_INVALID", "packet decoding failed"));
      }
    };
    this.reliable.addEventListener("message", this.listener);
    this.realtime.addEventListener("message", this.listener);
  }

  dispose(): void {
    if (this.listener === null) return;
    this.reliable.removeEventListener("message", this.listener);
    this.realtime.removeEventListener("message", this.listener);
    this.listener = null;
  }
}
