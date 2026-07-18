// Generated from desktop-host.schema.json and preload.template.cjs. Do not edit.
const { contextBridge, ipcRenderer } = require("electron");
const channels = Object.freeze({
  "hostInfo": "ludivra:host-info",
  "storageRead": "ludivra:storage-read",
  "storageReadBackup": "ludivra:storage-read-backup",
  "storageWrite": "ludivra:storage-write",
  "storageDelete": "ludivra:storage-delete",
  "achievementUnlock": "ludivra:achievement-unlock",
  "cloudRead": "ludivra:cloud-read",
  "cloudWrite": "ludivra:cloud-write",
  "cloudDelete": "ludivra:cloud-delete",
  "userCurrent": "ludivra:user-current",
  "overlayActivate": "ludivra:overlay-activate",
  "updateCheck": "ludivra:update-check",
  "lifecycle": "ludivra:lifecycle",
  "checkpointRequest": "ludivra:checkpoint-request",
  "checkpointComplete": "ludivra:checkpoint-complete"
});

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
