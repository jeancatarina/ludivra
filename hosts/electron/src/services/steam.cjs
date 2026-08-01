const { validateArchive, validateSlot } = require("./storage.cjs");

const achievementPattern = /^[A-Z][A-Z0-9_]{0,127}$/;
const steamIdPattern = /^[1-9][0-9]{0,19}$/;
const maximumReliablePacketBytes = 1024 * 1024;
const maximumRealtimePacketBytes = 1200;
const networkModes = Object.freeze({ realtime: 1, reliable: 2 });
const overlayDialogs = Object.freeze({
  friends: 0,
  community: 1,
  players: 2,
  settings: 3,
  group: 4,
  stats: 5,
  achievements: 6
});

function unavailable(reason) {
  const fail = () => { throw new Error(`STEAM_UNAVAILABLE: ${reason}`); };
  return Object.freeze({ available: false, reason, unlock: fail, cloudRead: fail,
    cloudAvailable: false, cloudReason: reason, cloudWrite: fail, cloudDelete: fail,
    currentUser: fail, activateOverlay: fail, networkAvailable: false, networkReason: reason,
    networkAccept: fail, networkSend: fail, networkRead: fail });
}

function networkPeer(peerId) {
  if (typeof peerId !== "string" || !steamIdPattern.test(peerId)) throw new Error("STEAM_NETWORK_PEER_INVALID");
  return BigInt(peerId);
}

function networkData(data, maximum) {
  if (!(data instanceof Uint8Array) || data.byteLength === 0 || data.byteLength > maximum) {
    throw new Error("STEAM_NETWORK_PACKET_INVALID");
  }
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

function networkMaximum(value) {
  if (!Number.isInteger(value) || value <= 0 || value > maximumReliablePacketBytes) {
    throw new Error("STEAM_NETWORK_PACKET_INVALID");
  }
  return value;
}

function prepareSteam(appId, logger) {
  if (!Number.isInteger(appId) || appId <= 0) {
    return { initialize: () => unavailable("steam.appId is not configured") };
  }
  try {
    const steamworks = require("steamworks.js");
    steamworks.electronEnableSteamOverlay(true);
    if (steamworks.restartAppIfNecessary(appId)) {
      return {
        restartRequired: true,
        initialize: () => unavailable("Steam requested relaunch through the client")
      };
    }
    return {
      restartRequired: false,
      initialize() {
        try {
          const client = steamworks.init(appId);
          logger.info("steam.initialized", { appId });
          return createAvailableAdapter(client);
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Steam initialization failed";
          logger.warn("steam.unavailable", { reason });
          return unavailable(reason);
        }
      }
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "steamworks.js is unavailable";
    logger.warn("steam.binding-unavailable", { reason });
    return { restartRequired: false, initialize: () => unavailable(reason) };
  }
}

function createAvailableAdapter(client) {
  const cloudAvailable = client.cloud.isEnabledForAccount() && client.cloud.isEnabledForApp();
  const cloudReason = cloudAvailable ? undefined : "Steam Cloud is disabled for this account or app";
  function cloudName(slot) {
    return `${validateSlot(slot)}.ldsv.base64`;
  }
  function requireCloud() {
    if (!client.cloud.isEnabledForAccount() || !client.cloud.isEnabledForApp()) {
      throw new Error("STEAM_CLOUD_DISABLED");
    }
  }
  const networkAvailable = client.networking !== undefined &&
    typeof client.networking.sendP2PPacket === "function" &&
    typeof client.networking.isP2PPacketAvailable === "function" &&
    typeof client.networking.readP2PPacket === "function" &&
    typeof client.networking.acceptP2PSession === "function";
  const networkReason = networkAvailable ? undefined : "Steam Networking P2P is unavailable in this Steam client";
  function requireNetwork() {
    if (!networkAvailable) throw new Error(`STEAM_UNAVAILABLE: ${networkReason}`);
  }
  return Object.freeze({
    available: true,
    reason: undefined,
    cloudAvailable,
    cloudReason,
    networkAvailable,
    networkReason,
    unlock(id) {
      if (typeof id !== "string" || !achievementPattern.test(id)) {
        throw new Error("STEAM_ACHIEVEMENT_ID_INVALID");
      }
      if (!client.achievement.activate(id)) {
        throw new Error("STEAM_ACHIEVEMENT_UNLOCK_FAILED");
      }
    },
    cloudRead(slot) {
      requireCloud();
      const name = cloudName(slot);
      return client.cloud.fileExists(name)
        ? new Uint8Array(Buffer.from(client.cloud.readFile(name), "base64"))
        : null;
    },
    cloudWrite(slot, data) {
      requireCloud();
      const content = validateArchive(data);
      if (!client.cloud.writeFile(cloudName(slot), content.toString("base64"))) {
        throw new Error("STEAM_CLOUD_WRITE_FAILED");
      }
    },
    cloudDelete(slot) {
      requireCloud();
      const name = cloudName(slot);
      if (client.cloud.fileExists(name) && !client.cloud.deleteFile(name)) {
        throw new Error("STEAM_CLOUD_DELETE_FAILED");
      }
    },
    currentUser() {
      const steamId = client.localplayer.getSteamId();
      return { id: steamId.steamId64.toString(), displayName: client.localplayer.getName() };
    },
    activateOverlay(dialog) {
      const value = overlayDialogs[dialog];
      if (value === undefined) {
        throw new Error("STEAM_OVERLAY_DIALOG_INVALID");
      }
      client.overlay.activateDialog(value);
    },
    networkAccept(peerId) {
      requireNetwork();
      client.networking.acceptP2PSession(networkPeer(peerId));
    },
    networkSend(peerId, mode, data) {
      requireNetwork();
      const sendType = networkModes[mode];
      if (sendType === undefined) throw new Error("STEAM_NETWORK_MODE_INVALID");
      const maximum = mode === "realtime" ? maximumRealtimePacketBytes : maximumReliablePacketBytes;
      if (!client.networking.sendP2PPacket(networkPeer(peerId), sendType, networkData(data, maximum))) {
        throw new Error("STEAM_NETWORK_SEND_FAILED");
      }
    },
    networkRead(maximumBytes) {
      requireNetwork();
      const available = client.networking.isP2PPacketAvailable();
      if (!Number.isInteger(available) || available <= 0) return null;
      const maximum = networkMaximum(maximumBytes);
      if (available > maximum) throw new Error("STEAM_NETWORK_PACKET_INVALID");
      const packet = client.networking.readP2PPacket(available);
      if (!(packet.data instanceof Uint8Array) || !Number.isInteger(packet.size) || packet.size <= 0 || packet.size > maximum) {
        throw new Error("STEAM_NETWORK_PACKET_INVALID");
      }
      return Object.freeze({ peerId: packet.steamId.steamId64.toString(), data: new Uint8Array(packet.data.subarray(0, packet.size)) });
    }
  });
}

module.exports = { prepareSteam, createAvailableAdapter };
