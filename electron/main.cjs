const path = require("path");
const dotenv = require("dotenv");

// Load .env for Electron main process BEFORE importing app code
dotenv.config({ path: path.join(__dirname, "../.env") });

const { app, BrowserWindow, ipcMain } = require("electron");

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
  signInDesktop,
  getDesktopAccessToken,
} = require("./auth.cjs");

const isDev = !app.isPackaged;

let queueManager = null;

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
    minWidth: 1100,
    minHeight: 700,
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

  if (isDev) {
    mainWindow.loadURL("https://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  ipcMain.handle("actionDesk:getDesktopRuntimeInfo", async () => {
    return getDesktopRuntimeInfo();
  });

  ipcMain.handle("actionDesk:auth:signIn", async () => {
    console.log("[Electron] actionDesk:auth:signIn called");
    return signInDesktop();
  });

  ipcMain.handle("actionDesk:auth:getAccessToken", async () => {
    console.log("[Electron] actionDesk:auth:getAccessToken called");
    return getDesktopAccessToken();
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

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});