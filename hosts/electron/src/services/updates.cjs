function createUpdateService({ autoUpdater, config, packaged, platform, logger }) {
  const feed = config.updateFeedUrl;
  const reason = !config.updatesEnabled
    ? "updates are disabled by the game manifest"
    : !packaged
      ? "updates require a packaged build"
      : platform === "linux"
        ? "Electron autoUpdater has no built-in Linux provider"
        : typeof feed !== "string" || !feed.startsWith("https://")
          ? "an HTTPS update feed is required"
          : undefined;

  async function check() {
    if (reason !== undefined) {
      return "disabled";
    }
    autoUpdater.setFeedURL({ url: feed });
    return new Promise((resolve) => {
      let settled = false;
      const finish = (status) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        autoUpdater.removeListener("update-available", available);
        autoUpdater.removeListener("update-not-available", current);
        autoUpdater.removeListener("error", failed);
        resolve(status);
      };
      const available = () => finish("available");
      const current = () => finish("current");
      const failed = (error) => {
        logger.warn("updates.check-failed", { message: error.message });
        finish("error");
      };
      const timeout = setTimeout(() => finish("error"), 30_000);
      autoUpdater.once("update-available", available);
      autoUpdater.once("update-not-available", current);
      autoUpdater.once("error", failed);
      autoUpdater.checkForUpdates();
    });
  }

  return Object.freeze({ available: reason === undefined, reason, check });
}

module.exports = { createUpdateService };
