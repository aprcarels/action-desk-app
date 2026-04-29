const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("actionDeskDesktop", {
  isElectron: true,

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

  signInWithMicrosoft: () =>
    ipcRenderer.invoke("actionDesk:auth:signInWithMicrosoft"),

  signOut: (sessionId) =>
    ipcRenderer.invoke("actionDesk:auth:signOut", sessionId),
});
