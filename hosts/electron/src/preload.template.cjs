const { contextBridge, ipcRenderer } = require("electron");
const channels = Object.freeze(__LUDIVRA_DESKTOP_CHANNELS__);

const invoke = (channel, ...arguments_) => ipcRenderer.invoke(channel, ...arguments_);

contextBridge.exposeInMainWorld("ludivraDesktop", Object.freeze({
  info: () => invoke(channels.hostInfo),
  storage: Object.freeze({
    read: (slot) => invoke(channels.storageRead, slot),
    readBackup: (slot) => invoke(channels.storageReadBackup, slot),
    write: (slot, data) => invoke(channels.storageWrite, slot, data),
    delete: (slot) => invoke(channels.storageDelete, slot)
  }),
  achievements: Object.freeze({ unlock: (id) => invoke(channels.achievementUnlock, id) }),
  cloud: Object.freeze({
    read: (slot) => invoke(channels.cloudRead, slot),
    write: (slot, data) => invoke(channels.cloudWrite, slot, data),
    delete: (slot) => invoke(channels.cloudDelete, slot)
  }),
  user: Object.freeze({ current: () => invoke(channels.userCurrent) }),
  overlay: Object.freeze({ activate: (dialog) => invoke(channels.overlayActivate, dialog) }),
  updates: Object.freeze({ check: () => invoke(channels.updateCheck) }),
  onLifecycle(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("lifecycle listener must be a function");
    }
    const handler = (_event, lifecycle) => listener(lifecycle);
    ipcRenderer.on(channels.lifecycle, handler);
    return () => ipcRenderer.removeListener(channels.lifecycle, handler);
  },
  onCheckpointRequested(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("checkpoint listener must be a function");
    }
    const handler = async (_event, requestId) => {
      try {
        await listener();
        ipcRenderer.send(channels.checkpointComplete, requestId, true);
      } catch {
        ipcRenderer.send(channels.checkpointComplete, requestId, false);
      }
    };
    ipcRenderer.on(channels.checkpointRequest, handler);
    return () => ipcRenderer.removeListener(channels.checkpointRequest, handler);
  }
}));
