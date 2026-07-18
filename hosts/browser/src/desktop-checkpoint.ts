import type { DesktopBridge, DesktopHostInfo } from "@ludivra/platform-contracts";
import type { LudivraRuntime } from "@ludivra/runtime-web";

const saveSlot = "autosave";
const autosaveIntervalMilliseconds = 30_000;

interface SaveCandidate {
  archive: Uint8Array;
  origin: "local" | "backup" | "cloud";
  tick: bigint;
  hash: bigint;
}

export interface DesktopCheckpointManager {
  readonly hostInfo: DesktopHostInfo;
  checkpoint(reason: string): Promise<void>;
  schedule(): void;
  dispose(): void;
}

function metadata(archive: Uint8Array): Pick<SaveCandidate, "tick" | "hash"> | null {
  if (archive.byteLength < 32 || String.fromCharCode(...archive.subarray(0, 4)) !== "LDSV") {
    return null;
  }
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  if (view.getUint32(4, true) !== 1) {
    return null;
  }
  return { tick: view.getBigUint64(8, true), hash: view.getBigUint64(16, true) };
}

function candidate(archive: Uint8Array | null, origin: SaveCandidate["origin"]): SaveCandidate | null {
  if (archive === null) return null;
  const values = metadata(archive);
  return values === null ? null : { archive, origin, ...values };
}

function isAvailable(hostInfo: DesktopHostInfo, id: string): boolean {
  return hostInfo.services.some((service) => service.id === id && service.availability === "available");
}

async function restore(runtime: LudivraRuntime, bridge: DesktopBridge, hostInfo: DesktopHostInfo): Promise<void> {
  const cloudAvailable = isAvailable(hostInfo, "steam.cloud");
  const [local, backup, cloud] = await Promise.all([
    bridge.storage.read(saveSlot),
    bridge.storage.readBackup(saveSlot),
    cloudAvailable ? bridge.cloud.read(saveSlot).catch(() => null) : Promise.resolve(null)
  ]);
  const candidates = [
    candidate(local, "local"),
    candidate(backup, "backup"),
    candidate(cloud, "cloud")
  ].filter((value): value is SaveCandidate => value !== null);
  candidates.sort((left, right) => left.tick === right.tick
    ? ["local", "cloud", "backup"].indexOf(left.origin) - ["local", "cloud", "backup"].indexOf(right.origin)
    : left.tick > right.tick ? -1 : 1);

  for (const selected of candidates) {
    try {
      runtime.loadSave(selected.archive);
      const conflicting = candidates.some((other) =>
        other.tick === selected.tick && other.hash !== selected.hash);
      if (conflicting) {
        console.warn("Ludivra save conflict resolved with local-first policy", {
          selected: selected.origin,
          tick: selected.tick.toString()
        });
      }
      if (selected.origin !== "local") {
        await bridge.storage.write(saveSlot, selected.archive);
      }
      return;
    } catch (error) {
      console.warn("Ludivra rejected a save candidate", { origin: selected.origin, error });
    }
  }
}

export async function createDesktopCheckpointManager(
  runtime: LudivraRuntime
): Promise<DesktopCheckpointManager | null> {
  const bridge = window.ludivraDesktop;
  if (bridge === undefined) return null;
  const hostInfo = await bridge.info();
  if (hostInfo.protocolVersion !== 1) {
    throw new Error(`unsupported desktop host protocol: ${hostInfo.protocolVersion}`);
  }
  await restore(runtime, bridge, hostInfo);

  const cloudAvailable = isAvailable(hostInfo, "steam.cloud");
  let writeChain = Promise.resolve();
  let debounceTimer: number | undefined;
  const checkpoint = async (reason: string): Promise<void> => {
    writeChain = writeChain.catch(() => undefined).then(async () => {
      const archive = runtime.save();
      await bridge.storage.write(saveSlot, archive);
      if (cloudAvailable) {
        await bridge.cloud.write(saveSlot, archive).catch((error) => {
          console.warn("Steam Cloud checkpoint failed; local save is intact", { reason, error });
        });
      }
    });
    await writeChain;
  };
  const interval = window.setInterval(() => void checkpoint("interval"), autosaveIntervalMilliseconds);
  const unsubscribeLifecycle = bridge.onLifecycle((event) => {
    if (event === "suspend") void checkpoint("suspend");
  });
  const unsubscribeCheckpoint = bridge.onCheckpointRequested(() => checkpoint("window-close"));
  const visibility = () => {
    if (document.visibilityState === "hidden") void checkpoint("background");
  };
  document.addEventListener("visibilitychange", visibility);

  return {
    hostInfo,
    checkpoint,
    schedule() {
      if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => void checkpoint("gameplay-change"), 1_000);
    },
    dispose() {
      if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
      window.clearInterval(interval);
      unsubscribeLifecycle();
      unsubscribeCheckpoint();
      document.removeEventListener("visibilitychange", visibility);
    }
  };
}
