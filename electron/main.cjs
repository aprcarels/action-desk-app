const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { startDesktopAppServer } = require("./appServer.cjs");

const {
  createRepositoryBundle,
} = require("../dist-electron/repositories/repositoryFactory");

const {
  QueueManager,
} = require("../dist-electron/services/queue/queueManager");

const {
  loadRawInboxQueue,
} = require("../dist-electron/services/loadInboxQueue");

const {
  mapRawInboxEmailToMailboxMessage,
} = require("../dist-electron/mappers/mapRawInboxEmailToMailboxMessage");

const {
  getAccessTokenForAvailableSession,
  getAccessTokenForSession,
  hasSessionContext,
  signInWithMicrosoft,
  signOutSession,
} = require("./auth.cjs");

const isDev = !app.isPackaged;
const DESKTOP_DEV_ORIGIN = "https://localhost:5173";

let queueManager = null;
let desktopAppServer = null;
let desktopAppOrigin = isDev ? DESKTOP_DEV_ORIGIN : null;
let desktopApiOrigin = null;
let desktopLogFilePath = null;
let mainWindowRef = null;

function getQueueManager() {
  if (!queueManager) {
    const repositories = createRepositoryBundle({ backend: "sqlite" });
    queueManager = new QueueManager(repositories);
  }

  return queueManager;
}

function getDesktopRuntimeInfo() {
  const userDataPath = app.getPath("userData");

  return {
    isElectron: true,
    isDev,
    userDataPath,
    recommendedRepositoryBackend: "sqlite",
    inboxSource: process.env.VITE_INBOX_SOURCE || "dev",
    appOrigin: desktopAppOrigin,
    apiOrigin: desktopApiOrigin,
    logFilePath: desktopLogFilePath,
  };
}

function normalizeRawEmailArray(input) {
  if (Array.isArray(input)) {
    return input;
  }

  if (input && typeof input === "object") {
    if (Array.isArray(input.items)) {
      return input.items;
    }

    if (Array.isArray(input.emails)) {
      return input.emails;
    }

    if (Array.isArray(input.value)) {
      return input.value;
    }

    if (Array.isArray(input.messages)) {
      return input.messages;
    }

    if (Array.isArray(input.results)) {
      return input.results;
    }

    if (Array.isArray(input.data)) {
      return input.data;
    }
  }

  return [];
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 700,
    minHeight: 500,
    resizable: true,
    maximizable: true,
    minimizable: true,
    movable: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.on(
    "console-message",
    (_event, level, message, line, sourceId) => {
      console.log(
        `[Renderer console][${level}] ${message} (${sourceId}:${line})`,
      );
    },
  );

  if (!desktopAppOrigin) {
    throw new Error("Desktop app origin was not initialized before window creation.");
  }

  mainWindow.loadURL(desktopAppOrigin);
  mainWindowRef = mainWindow;

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log("[Electron][popup] window.open requested:", url);
    return { action: "allow" };
  });

  mainWindow.webContents.on("did-create-window", (childWindow) => {
    console.log("[Electron][popup] popup window created");

    childWindow.webContents.on("did-start-navigation", (_event, url) => {
      console.log("[Electron][popup] did-start-navigation:", url);
    });

    childWindow.webContents.on("did-navigate", (_event, url) => {
      console.log("[Electron][popup] did-navigate:", url);
    });

    childWindow.webContents.on("did-frame-finish-load", (_event, isMainFrame) => {
      if (isMainFrame) {
        console.log("[Electron][popup] did-frame-finish-load:", childWindow.webContents.getURL());
      }
    });

    childWindow.webContents.on(
      "console-message",
      (_event, level, message, line, sourceId) => {
        console.log(
          `[Popup console][${level}] ${message} (${sourceId}:${line})`,
        );
      },
    );

    childWindow.on("closed", () => {
      console.log("[Electron][popup] popup window closed");
    });
  });
}

app.whenReady().then(async () => {
  try {
    desktopAppServer = await startDesktopAppServer({
      distDir: path.join(__dirname, "../dist"),
      databasePath: path.join(app.getPath("userData"), "action-desk-shared.sqlite"),
      authProvider: {
        getAccessTokenForAvailableSession,
        getAccessTokenForSession,
        hasSessionContext,
        signOutSession,
      },
    });
    desktopApiOrigin = desktopAppServer.origin;
    desktopLogFilePath = desktopAppServer.logger?.getLogFilePath?.() ?? null;

    if (!isDev) {
      desktopAppOrigin = desktopAppServer.origin;
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The packaged desktop app server could not be started.";

    dialog.showErrorBox("Action Desk startup failed", message);
    app.quit();
    return;
  }

  ipcMain.handle("actionDesk:getDesktopRuntimeInfo", async () => {
    return getDesktopRuntimeInfo();
  });

  ipcMain.handle("actionDesk:auth:signInWithMicrosoft", async () => {
    try {
      const authResult = await signInWithMicrosoft();
      const session = desktopAppServer.store.startSessionForIdentity(
        authResult.sessionId,
        authResult.identity,
      );
      desktopAppServer.logger?.info("auth", "Microsoft sign-in completed.", {
        sessionId: session.sessionId,
        repId: session.currentUser?.id,
      });
      return session;
    } catch (error) {
      desktopAppServer.logger?.error("auth", "Microsoft sign-in failed.", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  ipcMain.handle("actionDesk:auth:signOut", async (_, sessionId) => {
    signOutSession(sessionId);
    desktopAppServer.store.logout(sessionId);
    desktopAppServer.logger?.info("auth", "Microsoft sign-out completed.", {
      sessionId,
    });
    return { sessionId };
  });

  ipcMain.handle("actionDesk:queue:ingestRawEmails", async (_, rawInput) => {
    const rawEmails = normalizeRawEmailArray(rawInput);

    console.log(
      "[Electron] ingestRawEmails received:",
      Array.isArray(rawInput) ? "array" : typeof rawInput,
      "normalized count:",
      rawEmails.length,
    );

    const mailboxMessages = rawEmails.map(mapRawInboxEmailToMailboxMessage);

    console.log("[Electron] mailboxMessages count:", mailboxMessages.length);

    const manager = getQueueManager();
    await manager.ingestMessages(mailboxMessages);

    const queueItems = await manager.listActiveQueue();

    console.log("[Electron] queueItems after ingest:", queueItems.length);
    console.log(
      "[Electron] first queue item:",
      queueItems.length > 0 ? JSON.stringify(queueItems[0], null, 2) : "none",
    );

    return {
      queueItems,
    };
  });

  ipcMain.handle("actionDesk:queue:load", async (_, options) => {
    const rawInbox = await loadRawInboxQueue(options);
    const rawEmails = normalizeRawEmailArray(rawInbox);

    console.log("[Electron] queue:load normalized count:", rawEmails.length);

    const mailboxMessages = rawEmails.map(mapRawInboxEmailToMailboxMessage);

    const manager = getQueueManager();
    await manager.ingestMessages(mailboxMessages);

    const queueItems = await manager.listActiveQueue();

    return {
      queueItems,
      nextCursor: rawInbox?.nextCursor ?? null,
    };
  });

  ipcMain.handle("actionDesk:queue:loadMore", async (_, options) => {
    const rawInbox = await loadRawInboxQueue(options);
    const rawEmails = normalizeRawEmailArray(rawInbox);

    console.log(
      "[Electron] queue:loadMore normalized count:",
      rawEmails.length,
    );

    const mailboxMessages = rawEmails.map(mapRawInboxEmailToMailboxMessage);

    const manager = getQueueManager();
    await manager.ingestMessages(mailboxMessages);

    const queueItems = await manager.listActiveQueue();

    return {
      queueItems,
      nextCursor: rawInbox?.nextCursor ?? null,
    };
  });

  ipcMain.handle(
    "actionDesk:queue:recomputePriority",
    async (_, queueItemId) => {
      const manager = getQueueManager();
      return manager.recomputePriority(queueItemId);
    },
  );

  ipcMain.handle(
    "actionDesk:queue:updateWorkStatus",
    async (_, payload) => {
      const manager = getQueueManager();
      return manager.updateWorkStatus(payload.queueItemId, payload.status);
    },
  );

  ipcMain.handle(
    "actionDesk:queue:markResolved",
    async (_, queueItemId) => {
      const manager = getQueueManager();
      return manager.markResolved(queueItemId);
    },
  );

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", async () => {
  if (desktopAppServer) {
    try {
      await desktopAppServer.close();
    } catch (error) {
      console.warn("[Electron] desktop app server close failed:", error);
    } finally {
      desktopAppServer = null;
    }
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
