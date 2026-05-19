const path = require("node:path");
const {
  loadActionDeskEnv,
  loadActionDeskRuntimeConfig,
} = require("./utils/env.cjs");

const envLoadResult = loadActionDeskEnv();

const { app, BrowserWindow, dialog, ipcMain } = require("electron");

let startDesktopAppServer = null;

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
  aliasSessionContext,
  getAccessTokenForAvailableSession,
  getAccessTokenForSession,
  getSessionLookupState,
  hasSessionContext,
  signInWithMicrosoft,
  signOutSession,
} = require("./auth.cjs");

const {
  createBackendApiClient,
  getActionDeskApiUrl,
} = require("./backendApiClient.cjs");

const isDev = !app.isPackaged;
const DESKTOP_DEV_ORIGIN = "https://localhost:5173";

let queueManager = null;
let desktopAppServer = null;
let desktopAppOrigin = isDev ? DESKTOP_DEV_ORIGIN : null;
let desktopApiOrigin = null;
let desktopLogFilePath = null;
let mainWindowRef = null;
let backendApiClient = null;
let runtimeConfigLoadResult = null;

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
    recommendedRepositoryBackend: "api",
    actionDeskApiUrl: backendApiClient?.baseUrl ?? null,
    runtimeConfigPath: runtimeConfigLoadResult?.configPath ?? null,
    inboxSource: process.env.VITE_INBOX_SOURCE || "dev",
    appOrigin: desktopAppOrigin,
    apiOrigin: desktopApiOrigin,
    logFilePath: desktopLogFilePath,
  };
}

function normalizeRawEmailArray(input) {
  if (Array.isArray(input)) return input;

  if (input && typeof input === "object") {
    if (Array.isArray(input.items)) return input.items;
    if (Array.isArray(input.emails)) return input.emails;
    if (Array.isArray(input.value)) return input.value;
    if (Array.isArray(input.messages)) return input.messages;
    if (Array.isArray(input.results)) return input.results;
    if (Array.isArray(input.data)) return input.data;
  }

  return [];
}

function getBackendSignInErrorMessage(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = error instanceof Error ? error.message : String(error || "");
  const normalizedMessage = message.toLowerCase();

  if (
    code.includes("inactive") ||
    normalizedMessage.includes("inactive")
  ) {
    return "Your Action Desk account is inactive.";
  }

  if (
    code.includes("not_found") ||
    code.includes("missing") ||
    code.includes("not_setup") ||
    normalizedMessage.includes("not set up") ||
    normalizedMessage.includes("not authorized") ||
    normalizedMessage.includes("not found")
  ) {
    return "Your Microsoft account is not set up in Action Desk.";
  }

  return message || "Sign-in failed. Please try again.";
}

function syncLocalSessionFromBackendSession(session) {
  if (!session?.sessionId || !session.currentUser) {
    return;
  }

  const startLocalSession =
    desktopAppServer?.store?.startRuntimeSession ??
    desktopAppServer?.store?.startSessionForRepProfile;

  startLocalSession?.call(
    desktopAppServer.store,
    session.sessionId,
    session.currentUser,
  );
}

function normalizeIdentityText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeIdentityEmail(value) {
  return normalizeIdentityText(value).toLowerCase();
}

function removeEmptyIdentityFields(identity) {
  return Object.fromEntries(
    Object.entries(identity).filter(([, value]) => normalizeIdentityText(value)),
  );
}

function buildBackendMicrosoftIdentity(identity = {}) {
  const email =
    normalizeIdentityEmail(identity.email) ||
    normalizeIdentityEmail(identity.accountUsername);
  const accountUsername =
    normalizeIdentityEmail(identity.accountUsername) ||
    normalizeIdentityEmail(identity.email);
  const homeAccountId = normalizeIdentityText(identity.homeAccountId);
  const localAccountId = normalizeIdentityText(identity.localAccountId);
  const microsoftUserId =
    normalizeIdentityText(identity.microsoftUserId) ||
    normalizeIdentityText(identity.microsoft_user_id) ||
    normalizeIdentityText(identity.entraObjectId) ||
    localAccountId ||
    homeAccountId;
  const displayName = normalizeIdentityText(identity.displayName);

  return removeEmptyIdentityFields({
    accountUsername,
    displayName,
    email,
    entraObjectId: normalizeIdentityText(identity.entraObjectId) || microsoftUserId,
    homeAccountId,
    localAccountId,
    microsoft_user_id: microsoftUserId,
    microsoftUserId,
  });
}

function getBackendIdentityLogMetadata(identity) {
  return {
    email: identity.email || identity.accountUsername || undefined,
    hasHomeAccountId: Boolean(identity.homeAccountId),
    hasLocalAccountId: Boolean(identity.localAccountId),
    hasMicrosoftUserId: Boolean(identity.microsoftUserId || identity.microsoft_user_id),
  };
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

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[Renderer console][${level}] ${message} (${sourceId}:${line})`);
  });

  if (!desktopAppOrigin) {
    throw new Error("Desktop app origin was not initialized before window creation.");
  }

  mainWindow.loadURL(desktopAppOrigin);
  mainWindowRef = mainWindow;

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log("[Electron][popup] window.open requested:", url);
    return { action: "allow" };
  });
}

app.whenReady().then(async () => {
  try {
    const userDataPath = app.getPath("userData");
    runtimeConfigLoadResult = loadActionDeskRuntimeConfig({ userDataPath });
    const resolvedBackendApiUrl = getActionDeskApiUrl({
      runtimeConfigPath: runtimeConfigLoadResult.configPath,
    });

    console.log("[Action Desk] Resolved backend API URL:", resolvedBackendApiUrl);
    console.log("[Action Desk] Backend API env source:", envLoadResult.envPath || "process environment");
    console.log(
      "[Action Desk] Runtime config source:",
      runtimeConfigLoadResult.loaded ? runtimeConfigLoadResult.configPath : "not found",
    );

    backendApiClient = createBackendApiClient({
      baseUrl: resolvedBackendApiUrl,
    });

    if (!startDesktopAppServer) {
      ({ startDesktopAppServer } = require("./appServer.cjs"));
    }

    desktopAppServer = await startDesktopAppServer({
      distDir: path.join(__dirname, "../dist"),
      databasePath: path.join(userDataPath, "action-desk-shared.sqlite"),
      backendApi: backendApiClient,
      authProvider: {
        aliasSessionContext,
        getAccessTokenForAvailableSession,
        getAccessTokenForSession,
        getSessionLookupState,
        hasSessionContext,
        signOutSession,
      },
    });

    desktopApiOrigin = desktopAppServer.origin;
    desktopLogFilePath = desktopAppServer.logger?.getLogFilePath?.() ?? null;
    backendApiClient.setLogger?.(desktopAppServer.logger);
    desktopAppServer.logger?.info?.("startup", "Resolved backend API URL.", {
      actionDeskApiUrl: backendApiClient.baseUrl,
      envPath: envLoadResult.envPath || undefined,
      envLoaded: envLoadResult.loaded,
      runtimeConfigPath: runtimeConfigLoadResult.configPath,
      runtimeConfigLoaded: runtimeConfigLoadResult.loaded,
      runtimeConfigSourceKey: runtimeConfigLoadResult.sourceKey || undefined,
    });

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
    const microsoftSession = await signInWithMicrosoft(desktopAppServer?.logger);
    const backendIdentity = buildBackendMicrosoftIdentity(microsoftSession.identity);
    const identityLogMetadata = getBackendIdentityLogMetadata(backendIdentity);

    desktopAppServer?.logger?.info("auth", "Sending Microsoft identity to backend.", {
      ...identityLogMetadata,
      microsoftAuthSessionId: microsoftSession.sessionId,
    });

    try {
      const backendSession = await backendApiClient.requestJson(
        "/api/auth/microsoft-session",
        {
          method: "POST",
          body: {
            microsoftSessionId: microsoftSession.sessionId,
            identity: backendIdentity,
            ...backendIdentity,
          },
        },
      );

      if (!backendSession?.sessionId || !backendSession.currentUser) {
        const error = new Error("Your Microsoft account is not set up in Action Desk.");
        error.code = "microsoft_account_not_setup";
        throw error;
      }

      const aliasCreated = aliasSessionContext(
        microsoftSession.sessionId,
        backendSession.sessionId,
      );
      syncLocalSessionFromBackendSession(backendSession);

      desktopAppServer?.logger?.info("auth", "Backend session resolved.", {
        ...getSessionLookupState(backendSession.sessionId),
        microsoftAuthSessionId: microsoftSession.sessionId,
        backendSessionId: backendSession.sessionId,
        aliasCreated,
        repId: backendSession.currentUser.id,
        role: backendSession.currentUser.role,
      });

      return backendSession;
    } catch (error) {
      signOutSession(microsoftSession.sessionId);
      desktopAppServer?.logger?.warn("auth", "Backend session was not resolved.", {
        ...identityLogMetadata,
        code: error?.code,
        statusCode: error?.statusCode,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(getBackendSignInErrorMessage(error));
    }
  });

  ipcMain.handle("actionDesk:auth:signOut", async (_, sessionId) => {
    signOutSession(sessionId);
    desktopAppServer.store.logout(sessionId, {
      reason: "userRequestedSignOut",
      source: "desktop_ipc_sign_out",
    });
    await backendApiClient.requestJson("/api/auth/logout", {
      method: "POST",
      sessionId,
      body: {},
    }).catch((error) => {
      desktopAppServer.logger?.warn("auth", "Backend sign-out request failed.", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    desktopAppServer.logger?.info("auth", "Microsoft sign-out completed.", {
      sessionId,
    });
    return { sessionId };
  });

  ipcMain.handle("actionDesk:queue:ingestRawEmails", async (_, rawInput) => {
    const rawEmails = normalizeRawEmailArray(rawInput);
    const mailboxMessages = rawEmails.map(mapRawInboxEmailToMailboxMessage);
    const manager = getQueueManager();

    await manager.ingestMessages(mailboxMessages);

    return {
      queueItems: await manager.listActiveQueue(),
    };
  });

  ipcMain.handle("actionDesk:queue:load", async (_, options) => {
    const rawInbox = await loadRawInboxQueue(options);
    const rawEmails = normalizeRawEmailArray(rawInbox);
    const mailboxMessages = rawEmails.map(mapRawInboxEmailToMailboxMessage);
    const manager = getQueueManager();

    await manager.ingestMessages(mailboxMessages);

    return {
      queueItems: await manager.listActiveQueue(),
      nextCursor: rawInbox?.nextCursor ?? null,
    };
  });

  ipcMain.handle("actionDesk:queue:loadMore", async (_, options) => {
    const rawInbox = await loadRawInboxQueue(options);
    const rawEmails = normalizeRawEmailArray(rawInbox);
    const mailboxMessages = rawEmails.map(mapRawInboxEmailToMailboxMessage);
    const manager = getQueueManager();

    await manager.ingestMessages(mailboxMessages);

    return {
      queueItems: await manager.listActiveQueue(),
      nextCursor: rawInbox?.nextCursor ?? null,
    };
  });

  ipcMain.handle("actionDesk:queue:recomputePriority", async (_, queueItemId) => {
    const manager = getQueueManager();
    return manager.recomputePriority(queueItemId);
  });

  ipcMain.handle("actionDesk:queue:updateWorkStatus", async (_, payload) => {
    const manager = getQueueManager();
    return manager.updateWorkStatus(payload.queueItemId, payload.status);
  });

  ipcMain.handle("actionDesk:queue:markResolved", async (_, queueItemId) => {
    const manager = getQueueManager();
    return manager.markResolved(queueItemId);
  });

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
