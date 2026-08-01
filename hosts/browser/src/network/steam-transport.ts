import type { DesktopBridge } from "@ludivra/platform-contracts";
import { decodeNetworkPacket, encodeNetworkPacket, type NetworkPacket } from "./webrtc-transport";

/** Electron-only Steam P2P carrier for the same logical wire envelope as
 * WebRTC. It deliberately contains no game rules and makes no relay decision. */
export class SteamP2PTransport {
  constructor(
    private readonly bridge: DesktopBridge,
    private readonly peerId: string
  ) {}

  async accept(): Promise<void> {
    await this.bridge.network.accept(this.peerId);
  }

  async send(packet: NetworkPacket): Promise<void> {
    const mode = packet.kind === "input" ? "realtime" : "reliable";
    await this.bridge.network.send(this.peerId, mode, encodeNetworkPacket(packet));
  }

  /** Polling preserves the Steam P2P API's explicit availability semantics: no
   * packet is `null`, never a fabricated keepalive or fallback transport. */
  async read(maximumBytes = 1024 * 1024): Promise<{ peerId: string; packet: NetworkPacket } | null> {
    const received = await this.bridge.network.read(maximumBytes);
    if (received === null) return null;
    return { peerId: received.peerId, packet: decodeNetworkPacket(received.data) };
  }
}
