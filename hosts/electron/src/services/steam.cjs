const { validateArchive, validateSlot } = require("./storage.cjs");

const achievementPattern = /^[A-Z][A-Z0-9_]{0,127}$/;
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
    currentUser: fail, activateOverlay: fail });
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
  return Object.freeze({
    available: true,
    reason: undefined,
    cloudAvailable,
    cloudReason,
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
    }
  });
}

module.exports = { prepareSteam };
