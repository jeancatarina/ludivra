const { open, mkdir, readFile, rename, copyFile, rm } = require("node:fs/promises");
const path = require("node:path");

const maximumArchiveBytes = 64 * 1024 * 1024;
const slotPattern = /^[a-z][a-z0-9._-]{0,63}$/;

function validateSlot(slot) {
  if (typeof slot !== "string" || !slotPattern.test(slot)) {
    throw new Error("STORAGE_SLOT_INVALID");
  }
  return slot;
}

function validateArchive(data) {
  if (!(data instanceof Uint8Array) || data.byteLength === 0 || data.byteLength > maximumArchiveBytes) {
    throw new Error("STORAGE_ARCHIVE_INVALID");
  }
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

async function optionalRead(file) {
  try {
    return new Uint8Array(await readFile(file));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function createStorageService(directory) {
  let writeSequence = 0;

  function files(slot) {
    const safeSlot = validateSlot(slot);
    return {
      primary: path.join(directory, `${safeSlot}.save`),
      backup: path.join(directory, `${safeSlot}.save.bak`)
    };
  }

  async function write(slot, data) {
    const { primary, backup } = files(slot);
    const content = validateArchive(data);
    await mkdir(directory, { recursive: true });
    writeSequence += 1;
    const temporary = path.join(directory, `.${path.basename(primary)}.${process.pid}.${writeSequence}.tmp`);
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await copyFile(primary, backup);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        await rm(temporary, { force: true });
        throw error;
      }
    }
    try {
      await rename(temporary, primary);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    try {
      const directoryHandle = await open(directory, "r");
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }
    } catch {
      // Some platforms cannot fsync directories; the file itself is already durable.
    }
  }

  return Object.freeze({
    read(slot) {
      return optionalRead(files(slot).primary);
    },
    readBackup(slot) {
      return optionalRead(files(slot).backup);
    },
    write,
    async delete(slot) {
      const { primary, backup } = files(slot);
      await Promise.all([rm(primary, { force: true }), rm(backup, { force: true })]);
    }
  });
}

module.exports = { createStorageService, validateArchive, validateSlot };
