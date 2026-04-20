const { contextBridge, ipcRenderer } = require("electron");

const deviceCodeAuthEnabled =
  process.env.ACTION_DESK_ENABLE_DEVICE_CODE_AUTH === "true";

contextBridge.exposeInMainWorld("actionDeskDesktop", {
  isElectron: true,
  deviceCodeAuthEnabled,

  ingestRawEmails: (rawEmails) =>
    ipcRenderer.invoke("actionDesk:queue:ingestRawEmails", rawEmails),

  getDesktopRuntimeInfo: () =>
    ipcRenderer.invoke("actionDesk:getDesktopRuntimeInfo"),

  loadQueue: (options) =>
    ipcRenderer.invoke("actionDesk:queue:load", options),

  loadQueueMore: (options) =>
    ipcRenderer.invoke("actionDesk:queue:loadMore", options),

  recomputePriority: (queueItemId) =>
    ipcRenderer.invoke("actionDesk:queue:recomputePriority", queueItemId),

  updateWorkStatus: (queueItemId, status) =>
    ipcRenderer.invoke("actionDesk:queue:updateWorkStatus", {
      queueItemId,
      status,
    }),

  markResolved: (queueItemId) =>
    ipcRenderer.invoke("actionDesk:queue:markResolved", queueItemId),

  signIn: deviceCodeAuthEnabled
    ? () => ipcRenderer.invoke("actionDesk:auth:signIn")
    : undefined,

  getAccessToken: deviceCodeAuthEnabled
    ? () => ipcRenderer.invoke("actionDesk:auth:getAccessToken")
    : undefined,
});
