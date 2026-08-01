const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { mkdtemp, rm } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createStorageService } = require("../src/services/storage.cjs");
const { captureWebPreferences, readCaptureOptions } = require("../src/services/capture.cjs");
const { createAvailableAdapter, prepareSteam } = require("../src/services/steam.cjs");
const { createUpdateService } = require("../src/services/updates.cjs");

const logger = Object.freeze({ info() {}, warn() {}, error() {} });

test("storage writes atomically and preserves the previous checkpoint", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ludivra-storage-test-"));
  try {
    const storage = createStorageService(directory);
    await storage.write("autosave", new Uint8Array([1, 2, 3]));
    await storage.write("autosave", new Uint8Array([4, 5]));
    assert.deepEqual(await storage.read("autosave"), new Uint8Array([4, 5]));
    assert.deepEqual(await storage.readBackup("autosave"), new Uint8Array([1, 2, 3]));
    assert.throws(() => storage.read("../escape"), /STORAGE_SLOT_INVALID/);
    await storage.delete("autosave");
    assert.equal(await storage.read("autosave"), null);
    assert.equal(await storage.readBackup("autosave"), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Steam absence is explicit and never reports false success", () => {
  const steam = prepareSteam(null, logger).initialize();
  assert.equal(steam.available, false);
  assert.throws(() => steam.unlock("FIRST_WIN"), /STEAM_UNAVAILABLE/);
});

test("Steam P2P adapter bounds and labels raw transport packets", () => {
  const sent = [];
  const client = {
    cloud: { isEnabledForAccount: () => true, isEnabledForApp: () => true, fileExists: () => false },
    achievement: { activate: () => true },
    localplayer: { getSteamId: () => ({ steamId64: 1n }), getName: () => "Host" },
    overlay: { activateDialog: () => {} },
    networking: {
      acceptP2PSession: (peer) => { sent.push({ accept: peer }); },
      sendP2PPacket: (peer, mode, data) => { sent.push({ peer, mode, data: Buffer.from(data) }); return true; },
      isP2PPacketAvailable: () => 2,
      readP2PPacket: () => ({ data: Buffer.from([7, 8]), size: 2, steamId: { steamId64: 99n } })
    }
  };
  const steam = createAvailableAdapter(client);
  steam.networkAccept("99");
  steam.networkSend("99", "reliable", new Uint8Array([1, 2, 3]));
  assert.equal(steam.networkAvailable, true);
  assert.deepEqual(steam.networkRead(64), { peerId: "99", data: new Uint8Array([7, 8]) });
  assert.equal(sent[0].accept, 99n);
  assert.equal(sent[1].mode, 2);
  assert.throws(() => steam.networkSend("99", "realtime", new Uint8Array(1201)), /STEAM_NETWORK_PACKET_INVALID/);
});

test("desktop updates are disabled unless every release precondition exists", async () => {
  const disabled = createUpdateService({
    autoUpdater: new EventEmitter(),
    config: { updatesEnabled: false },
    packaged: true,
    platform: "darwin",
    logger
  });
  assert.equal(disabled.available, false);
  assert.equal(await disabled.check(), "disabled");

  const updater = new EventEmitter();
  updater.setFeedURL = () => {};
  updater.checkForUpdates = () => queueMicrotask(() => updater.emit("update-not-available"));
  const enabled = createUpdateService({
    autoUpdater: updater,
    config: { updatesEnabled: true, updateFeedUrl: "https://updates.example.test/game" },
    packaged: true,
    platform: "win32",
    logger
  });
  assert.equal(enabled.available, true);
  assert.equal(await enabled.check(), "current");
});

test("raster capture declares text and device scales in Electron offscreen output", () => {
  const options = readCaptureOptions({
    LUDIVRA_CAPTURE_BUNDLE: "bundle/index.html",
    LUDIVRA_CAPTURE_OUTPUT: "reports/capture",
    LUDIVRA_CAPTURE_TEXT_SCALE: "1.5",
    LUDIVRA_CAPTURE_DEVICE_SCALE: "2"
  });
  assert.equal(options.textScale, 1.5);
  assert.equal(options.deviceScale, 2);

  assert.deepEqual(captureWebPreferences(options).offscreen, { deviceScaleFactor: 2 });
  assert.equal(captureWebPreferences({ ...options, deviceScale: undefined }).offscreen, true);
  assert.throws(
    () => readCaptureOptions({
      LUDIVRA_CAPTURE_BUNDLE: "bundle/index.html",
      LUDIVRA_CAPTURE_OUTPUT: "reports/capture",
      LUDIVRA_CAPTURE_TEXT_SCALE: "0"
    }),
    /CAPTURE_PROFILE_UNDECLARED/
  );
});
