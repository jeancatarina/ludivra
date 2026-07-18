const { app, autoUpdater, BrowserWindow, crashReporter, ipcMain, powerMonitor, shell } = require("electron");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const channels = require("./generated/desktop-channels.cjs");
const { createLogger } = require("./services/logger.cjs");
const { createStorageService } = require("./services/storage.cjs");
const { prepareSteam } = require("./services/steam.cjs");
const { createUpdateService } = require("./services/updates.cjs");

if (process.env.LUDIVRA_SMOKE_USER_DATA) {
  const smokeUserData = path.resolve(process.env.LUDIVRA_SMOKE_USER_DATA);
  app.setPath("userData", smokeUserData);
  app.setAppLogsPath(path.join(smokeUserData, "logs"));
}

function readConfiguration() {
  try {
    return JSON.parse(readFileSync(path.join(__dirname, "desktop-config.json"), "utf8"));
  } catch {
    return { protocolVersion: 1, steamAppId: null, updatesEnabled: false };
  }
}

const configuration = readConfiguration();
const logger = createLogger(app.getPath("logs"));
let crashAvailable = true;
try {
  crashReporter.start({
    companyName: "Ludivra",
    productName: app.getName(),
    uploadToServer: false,
    compress: true
  });
} catch (error) {
  crashAvailable = false;
  logger.warn("crash-reporter.unavailable", { message: error.message });
}
const preparedSteam = prepareSteam(
  process.env.LUDIVRA_SMOKE_TEST === "1" ? null : configuration.steamAppId,
  logger
);
if (preparedSteam.restartRequired === true) {
  app.quit();
}
const pendingCheckpoints = new Map();
let checkpointSequence = 0;

function serviceStatus(id, available, reason) {
  return reason === undefined ? { id, availability: available ? "available" : "unavailable" }
    : { id, availability: available ? "available" : "unavailable", reason };
}

function createWindow(visible = true) {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#080711",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs")
    }
  });
  window.removeMenu();
  window.webContents.on("console-message", (details) => {
    logger.info("renderer.console", { message: details.message });
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    logger.error("renderer.gone", { reason: details.reason, exitCode: details.exitCode });
  });
  if (visible) {
    window.once("ready-to-show", () => window.show());
  }
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault();
    }
  });
  let closeApproved = false;
  window.on("close", (event) => {
    if (closeApproved || window.webContents.isDestroyed()) {
      return;
    }
    event.preventDefault();
    void requestCheckpoint(window).finally(() => {
      closeApproved = true;
      window.close();
    });
  });
  void window.loadFile(path.join(__dirname, "web", "index.html"));
  return window;
}

function requestCheckpoint(window) {
  checkpointSequence += 1;
  const requestId = checkpointSequence;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingCheckpoints.delete(requestId);
      logger.warn("checkpoint.timeout", { requestId });
      resolve(false);
    }, 2_000);
    pendingCheckpoints.set(requestId, { webContentsId: window.webContents.id, resolve, timer });
    window.webContents.send(channels.checkpointRequest, requestId);
  });
}

function registerIpc(storage, steam, updates) {
  const handlers = new Map([
    [channels.hostInfo, () => ({
      protocolVersion: 1,
      platform: process.platform,
      packaged: app.isPackaged,
      services: [
        serviceStatus("storage.local", true),
        serviceStatus("diagnostics.crash", crashAvailable,
          crashAvailable ? undefined : "Crashpad failed to initialize"),
        serviceStatus("diagnostics.logs", true),
        serviceStatus("steam.achievements", steam.available, steam.reason),
        serviceStatus("steam.cloud", steam.cloudAvailable, steam.cloudReason),
        serviceStatus("steam.overlay", steam.available, steam.reason),
        serviceStatus("steam.user", steam.available, steam.reason),
        serviceStatus("updates.desktop", updates.available, updates.reason)
      ]
    })],
    [channels.storageRead, (_event, slot) => storage.read(slot)],
    [channels.storageReadBackup, (_event, slot) => storage.readBackup(slot)],
    [channels.storageWrite, (_event, slot, data) => storage.write(slot, data)],
    [channels.storageDelete, (_event, slot) => storage.delete(slot)],
    [channels.achievementUnlock, (_event, id) => steam.unlock(id)],
    [channels.cloudRead, (_event, slot) => steam.cloudRead(slot)],
    [channels.cloudWrite, (_event, slot, data) => steam.cloudWrite(slot, data)],
    [channels.cloudDelete, (_event, slot) => steam.cloudDelete(slot)],
    [channels.userCurrent, () => steam.currentUser()],
    [channels.overlayActivate, (_event, dialog) => steam.activateOverlay(dialog)],
    [channels.updateCheck, () => updates.check()]
  ]);
  for (const [channel, handler] of handlers) {
    ipcMain.handle(channel, async (...arguments_) => {
      try {
        return await handler(...arguments_);
      } catch (error) {
        logger.error("ipc.failed", { channel, message: error.message });
        throw error;
      }
    });
  }
  ipcMain.on(channels.checkpointComplete, (event, requestId, succeeded) => {
    const pending = pendingCheckpoints.get(requestId);
    if (pending === undefined || pending.webContentsId !== event.sender.id) {
      return;
    }
    clearTimeout(pending.timer);
    pendingCheckpoints.delete(requestId);
    pending.resolve(succeeded === true);
  });
}

function broadcastLifecycle(event) {
  logger.info("lifecycle.changed", { event });
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channels.lifecycle, event);
  }
}

app.whenReady().then(() => {
  const storage = createStorageService(path.join(app.getPath("userData"), "saves"));
  const steam = preparedSteam.initialize();
  const updates = createUpdateService({
    autoUpdater,
    config: configuration,
    packaged: app.isPackaged,
    platform: process.platform,
    logger
  });
  registerIpc(storage, steam, updates);
  powerMonitor.on("suspend", () => broadcastLifecycle("suspend"));
  powerMonitor.on("resume", () => broadcastLifecycle("resume"));
  if (process.env.LUDIVRA_SMOKE_TEST === "1") {
    let smokeWindow;
    void storage.write("smoke", new Uint8Array([1, 2, 3]))
      .then(() => storage.read("smoke"))
      .then((archive) => {
        if (archive?.byteLength !== 3) throw new Error("storage smoke test failed");
        smokeWindow = createWindow(false);
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("renderer smoke test timed out")), 10_000);
          smokeWindow.webContents.once("did-fail-load", (_event, code, description) => {
            clearTimeout(timeout);
            reject(new Error(`renderer failed to load: ${code} ${description}`));
          });
          smokeWindow.webContents.once("did-finish-load", () => {
            const inspect = () => {
              void smokeWindow.webContents.executeJavaScript(
                "document.querySelector('#runtime-status')?.textContent ?? ''"
              ).then((status) => {
                if (status.includes("Kernel WASM") && status.includes("autosave desktop")) {
                  clearTimeout(timeout);
                  resolve();
                  return;
                }
                setTimeout(inspect, 200);
              }, (error) => {
                clearTimeout(timeout);
                reject(error);
              });
            };
            inspect();
          });
        });
      })
      .then(() => storage.delete("smoke"))
      .then(() => {
        smokeWindow.destroy();
        process.stdout.write("ludivra_desktop_smoke=ok\n");
        app.quit();
      })
      .catch((error) => {
        if (smokeWindow !== undefined && !smokeWindow.isDestroyed()) smokeWindow.destroy();
        logger.error("desktop-host.smoke-failed", { message: error.message });
        app.exit(1);
      });
    return;
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
  logger.info("desktop-host.ready", { packaged: app.isPackaged, platform: process.platform });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
