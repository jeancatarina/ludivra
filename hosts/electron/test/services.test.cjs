const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { mkdtemp, rm } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createStorageService } = require("../src/services/storage.cjs");
const { prepareSteam } = require("../src/services/steam.cjs");
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
