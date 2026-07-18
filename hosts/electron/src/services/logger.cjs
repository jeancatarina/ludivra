const { appendFile, mkdir } = require("node:fs/promises");
const path = require("node:path");

function createLogger(logDirectory) {
  const logFile = path.join(logDirectory, "desktop-host.jsonl");

  function write(level, event, details = {}) {
    const record = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...details });
    const stream = level === "error" ? process.stderr : process.stdout;
    stream.write(`${record}\n`);
    void mkdir(logDirectory, { recursive: true })
      .then(() => appendFile(logFile, `${record}\n`, { encoding: "utf8", mode: 0o600 }))
      .catch((error) => process.stderr.write(`desktop log write failed: ${error.message}\n`));
  }

  return Object.freeze({
    info(event, details) { write("info", event, details); },
    warn(event, details) { write("warning", event, details); },
    error(event, details) { write("error", event, details); }
  });
}

module.exports = { createLogger };
