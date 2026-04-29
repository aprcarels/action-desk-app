const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { SharedWorkflowStore } = require("./sharedWorkflowStore.cjs");
const { createLogger } = require("./logger.cjs");

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = 3960;
const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const DEFAULT_INBOX_PAGE_SIZE = 25;
const EXPIRED_MICROSOFT_SESSION_MESSAGE =
  "Your Microsoft session expired. Please sign in again.";
const ACCESS_CHANGED_SESSION_MESSAGE = "Your access changed. Please sign in again.";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
};

function getContentType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin ?? "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-action-desk-session-id",
  );
}

function sendJson(req, res, statusCode, payload) {
  setCorsHeaders(req, res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function buildApiError(overrides) {
  return {
    code: overrides?.code ?? "shared_workflow_error",
    message: overrides?.message ?? "Shared workflow request failed.",
    retryable: overrides?.retryable ?? false,
    context: overrides?.context,
    details: overrides?.details,
  };
}

function sendApiError(req, res, statusCode, errorPayload) {
  sendJson(req, res, statusCode, {
    error: buildApiError(errorPayload),
  });
}

function clearDesktopSession(store, authProvider, sessionId, reason) {
  if (!sessionId) {
    return;
  }

  authProvider?.signOutSession?.(sessionId);
  store?.invalidateSession?.(sessionId, reason);
}

function sendExpiredMicrosoftSessionError(req, res, context) {
  sendApiError(req, res, 401, {
    code: "stale_microsoft_session",
    message: EXPIRED_MICROSOFT_SESSION_MESSAGE,
    retryable: false,
    context,
  });
}

function buildSessionInvalidationError(sessionCode, context) {
  if (sessionCode === "access_changed" || sessionCode === "deactivated") {
    return {
      code: "access_changed",
      message: ACCESS_CHANGED_SESSION_MESSAGE,
      retryable: false,
      context,
    };
  }

  return {
    code: "stale_microsoft_session",
    message: EXPIRED_MICROSOFT_SESSION_MESSAGE,
    retryable: false,
    context,
  };
}

function sendSessionInvalidationError(req, res, sessionCode, context) {
  sendApiError(req, res, 401, buildSessionInvalidationError(sessionCode, context));
}

function getStaleDesktopSessionState(store, authProvider, sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();

  if (!normalizedSessionId) {
    return null;
  }

  const currentSummary = store.getSessionSummary(normalizedSessionId);

  if (!currentSummary.currentUser) {
    const invalidatedSessionState = store.getInvalidatedSessionState?.(normalizedSessionId);

    if (invalidatedSessionState) {
      return invalidatedSessionState;
    }

    return {
      code: "missing_app_session",
      sessionId: normalizedSessionId,
    };
  }

  if (authProvider?.hasSessionContext?.(normalizedSessionId) === false) {
    return {
      code: "missing_microsoft_context",
      sessionId: normalizedSessionId,
    };
  }

  return null;
}

function normalizeText(value) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeBodyText(body, bodyPreview) {
  const bodyContent = body?.content?.trim();

  if (bodyContent) {
    const normalizedBody =
      body?.contentType?.toLowerCase() === "html" || /<[^>]+>/.test(bodyContent)
        ? stripHtml(bodyContent)
        : bodyContent.replace(/\r\n?/g, "\n").trim();

    if (normalizedBody.length > 0) {
      return normalizedBody;
    }
  }

  return normalizeText(bodyPreview);
}

function normalizeReceivedAt(receivedDateTime) {
  const normalized = receivedDateTime?.trim() ?? "";

  if (!normalized) {
    return "";
  }

  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? normalized : new Date(timestamp).toISOString();
}

function normalizePreviewText(bodyPreview, bodyText) {
  const candidate = normalizeText(bodyPreview) || normalizeText(bodyText);
  return candidate && candidate.length > 0 ? candidate : undefined;
}

function normalizeGraphNextCursor(nextLink) {
  if (!nextLink) {
    return undefined;
  }

  try {
    const url = new URL(nextLink);
    const graphPathPrefix = "/v1.0";
    const normalizedPath = url.pathname.startsWith(graphPathPrefix)
      ? url.pathname.slice(graphPathPrefix.length)
      : url.pathname;

    return `${normalizedPath}${url.search}`;
  } catch {
    return undefined;
  }
}

function normalizeGraphMessagesResponse(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.value)) {
    throw new Error("Invalid Outlook Graph inbox response.");
  }

  return {
    emails: payload.value.map((message) => {
      const id = message.id?.trim() || "";
      const bodyText = normalizeBodyText(message.body, message.bodyPreview);
      const fromEmail = message.from?.emailAddress?.address?.trim() || "";
      const fromName = message.from?.emailAddress?.name?.trim() || fromEmail || "Unknown sender";
      const toRecipients =
        message.toRecipients
          ?.map((recipient) => recipient.emailAddress?.address?.trim() || "")
          .filter((recipient) => recipient.length > 0) ?? [];
      const ccRecipients =
        message.ccRecipients
          ?.map((recipient) => recipient.emailAddress?.address?.trim() || "")
          .filter((recipient) => recipient.length > 0) ?? [];
      const internetMessageHeaders =
        message.internetMessageHeaders
          ?.map((header) => ({
            name: header.name?.trim() || "",
            value: header.value?.trim() || "",
          }))
          .filter((header) => header.name.length > 0 || header.value.length > 0) ?? [];

      return {
        id,
        externalId: id,
        provider: "outlook_graph",
        threadId: message.conversationId?.trim() || undefined,
        subject: message.subject?.trim() || "(no subject)",
        fromName,
        fromEmail,
        receivedAt: normalizeReceivedAt(message.receivedDateTime),
        bodyText,
        bodyHtml: message.body?.content,
        previewText: normalizePreviewText(message.bodyPreview, bodyText),
        outlookWebLink: message.webLink?.trim() || undefined,
        toRecipients: toRecipients.length > 0 ? toRecipients : undefined,
        ccRecipients: ccRecipients.length > 0 ? ccRecipients : undefined,
        internetMessageHeaders:
          internetMessageHeaders.length > 0 ? internetMessageHeaders : undefined,
      };
    }),
    nextCursor: normalizeGraphNextCursor(payload["@odata.nextLink"]),
  };
}

function buildGraphMessagesPath(cursor, limit) {
  if (cursor) {
    return cursor.startsWith("/") ? cursor : `/${cursor}`;
  }

  const searchParams = new URLSearchParams({
    "$top": String(limit ?? DEFAULT_INBOX_PAGE_SIZE),
    "$orderby": "receivedDateTime desc",
    "$select":
      "id,conversationId,subject,from,receivedDateTime,bodyPreview,body,webLink,toRecipients,ccRecipients,internetMessageHeaders",
  });

  return `/me/messages?${searchParams.toString()}`;
}

async function handleInboxMessagesRequest(req, res, logger, authProvider, store) {
  const requestUrl = new URL(req.url, "http://localhost");
  const sessionId =
    requestUrl.searchParams.get("sessionId") ??
    req.headers["x-action-desk-session-id"];
  let authorization = req.headers.authorization?.trim();

  if (!authorization?.startsWith("Bearer ")) {
    if (!authProvider) {
      logger?.warn("inbox", "Rejected inbox request without Outlook token.");
      sendJson(req, res, 401, { error: "Missing Outlook authorization token." });
      return;
    }

    try {
      const accessToken = await authProvider.getAccessTokenForSession(sessionId, {
        interactive: requestUrl.searchParams.get("interactiveAuth") === "true",
      });
      authorization = `Bearer ${accessToken}`;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (((error).code === "microsoft_session_missing") ||
          ((error).code === "microsoft_session_expired"))
      ) {
        clearDesktopSession(store, authProvider, sessionId, String(error.code));
      }
      logger?.warn("inbox", "Microsoft access token could not be acquired.", {
        error: error instanceof Error ? error.message : String(error),
      });
      sendApiError(req, res, 401, {
        code:
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : "microsoft_auth_required",
        message:
          error instanceof Error
            ? error.message
            : "Microsoft sign-in is required to load the inbox.",
        retryable: true,
        context: "/api/inbox/messages",
      });
      return;
    }
  }

  try {
    const cursor = requestUrl.searchParams.get("cursor") ?? undefined;
    const rawLimit = requestUrl.searchParams.get("limit");
    const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;
    const limit = parsedLimit !== undefined && Number.isNaN(parsedLimit) ? undefined : parsedLimit;
    const graphPath = buildGraphMessagesPath(cursor, limit);

    const response = await fetch(`${GRAPH_BASE_URL}${graphPath}`, {
      method: "GET",
      headers: {
        Authorization: authorization,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        clearDesktopSession(store, authProvider, sessionId, "graph_unauthorized");
        logger?.warn("inbox", "Outlook inbox request hit unauthorized Graph response.", {
          status: response.status,
          sessionId: String(sessionId || "") || undefined,
        });
        sendExpiredMicrosoftSessionError(req, res, "/api/inbox/messages");
        return;
      }

      logger?.warn("inbox", "Outlook inbox request failed.", {
        status: response.status,
      });
      sendJson(req, res, 502, {
        error: `Outlook inbox request failed with status ${response.status}.`,
      });
      return;
    }

    const payload = await response.json();
    const normalizedPayload = normalizeGraphMessagesResponse(payload);
    const testQueueEmails = store?.listTestQueueEmails?.(sessionId) ?? [];
    sendJson(req, res, 200, {
      ...normalizedPayload,
      emails: [...testQueueEmails, ...normalizedPayload.emails],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Inbox messages request failed.";
    logger?.error("inbox", "Inbox messages request failed.", {
      error: message,
    });
    sendJson(req, res, 502, { error: message });
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function resolveStaticFilePath(distDir, pathname) {
  const requestedPath =
    pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const normalizedPath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const candidatePath = path.join(distDir, normalizedPath);

  if (!candidatePath.startsWith(distDir)) {
    return null;
  }

  return candidatePath;
}

async function serveStaticRequest(req, res, distDir) {
  const requestUrl = new URL(req.url, "http://localhost");
  const candidatePath = resolveStaticFilePath(distDir, requestUrl.pathname);
  const fallbackIndexPath = path.join(distDir, "index.html");
  const filePath =
    candidatePath && fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()
      ? candidatePath
      : fallbackIndexPath;

  try {
    const fileBuffer = await fs.promises.readFile(filePath);
    setCorsHeaders(req, res);
    res.statusCode = 200;
    res.setHeader("Content-Type", getContentType(filePath));
    res.end(fileBuffer);
  } catch {
    sendJson(req, res, 404, { error: "Desktop asset not found." });
  }
}

function createWorkflowRouteHandler(store, logger) {
  return async (req, res, requestUrl) => {
    const body = req.method === "POST" ? await readRequestBody(req) : {};
    const sessionId =
      requestUrl.searchParams.get("sessionId") ??
      body.sessionId ??
      req.headers["x-action-desk-session-id"];

    if (req.method === "GET" && requestUrl.pathname === "/api/auth/session") {
      const currentSummary = store.getSessionSummary(sessionId);
      const hasLocalSessionId = Boolean(String(sessionId || "").trim());
      const hasStoredSession = Boolean(sessionId && currentSummary.currentUser);
      const invalidatedSessionState = hasLocalSessionId
        ? store.getInvalidatedSessionState?.(sessionId)
        : null;
      const hasLiveMicrosoftSession = hasStoredSession
        ? Boolean(store.authProvider?.hasSessionContext?.(sessionId))
        : true;

      if (hasStoredSession && !hasLiveMicrosoftSession) {
        clearDesktopSession(store, store.authProvider, sessionId, "missing_microsoft_context");
        sendJson(req, res, 200, {
          ...store.getSessionSummary(""),
          staleSessionCleared: true,
          authMessage: EXPIRED_MICROSOFT_SESSION_MESSAGE,
        });
        return true;
      }

      if (hasLocalSessionId && !currentSummary.currentUser) {
        if (!invalidatedSessionState) {
          clearDesktopSession(store, store.authProvider, sessionId, "missing_app_session");
        }
        const invalidationError = buildSessionInvalidationError(
          invalidatedSessionState?.code ?? "missing_app_session",
          requestUrl.pathname,
        );
        sendJson(req, res, 200, {
          ...store.getSessionSummary(""),
          staleSessionCleared: true,
          authMessage: invalidationError.message,
        });
        return true;
      }

      sendJson(req, res, 200, {
        ...currentSummary,
      });
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/auth/logout") {
      store.logout(sessionId);
      sendJson(req, res, 200, { sessionId });
      return true;
    }

    const staleSessionState = getStaleDesktopSessionState(
      store,
      store.authProvider,
      sessionId,
    );

    if (staleSessionState) {
      if (!store.getInvalidatedSessionState?.(staleSessionState.sessionId)) {
        clearDesktopSession(
          store,
          store.authProvider,
          staleSessionState.sessionId,
          staleSessionState.code,
        );
      }
      sendSessionInvalidationError(req, res, staleSessionState.code, requestUrl.pathname);
      return true;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/health") {
      sendJson(req, res, 200, store.getHealth(sessionId));
      return true;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/workflow/bootstrap") {
      sendJson(req, res, 200, store.getBootstrap(sessionId));
      return true;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/workflow/thread-presence") {
      store.requireCurrentUser(sessionId);
      sendJson(req, res, 200, { threadPresence: store.listThreadPresence() });
      return true;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/admin/users") {
      sendJson(req, res, 200, { users: store.listUsers(sessionId) });
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/admin/users/create") {
      sendJson(req, res, 200, { users: store.createUser(sessionId, body) });
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/admin/users/update") {
      sendJson(req, res, 200, { users: store.updateUser(sessionId, body) });
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/admin/users/deactivate") {
      sendJson(req, res, 200, { users: store.deactivateUser(sessionId, body.userId) });
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/workflow/preferences") {
      const preferences = store.savePreferences(sessionId, body.preferences);
      sendJson(req, res, 200, { preferences });
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/workflow/sla-settings") {
      const slaSettings = store.saveSlaSettings(sessionId, body.slaSettings);
      sendJson(req, res, 200, { slaSettings });
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/workflow/customers/upsert") {
      const customers = store.upsertCustomer(sessionId, body.customer);
      sendJson(req, res, 200, { customers });
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/workflow/customers/delete") {
      const customers = store.deleteCustomer(sessionId, body.customerId);
      sendJson(req, res, 200, { customers });
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/workflow/customers/clear") {
      const customers = store.clearCustomers(sessionId);
      sendJson(req, res, 200, { customers });
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/workflow/thread-state") {
      const threadState = store.saveThreadState(sessionId, body.threadId, body.threadState);
      sendJson(req, res, 200, { threadState });
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/workflow/thread-presence") {
      const threadPresence = store.upsertThreadPresence(
        sessionId,
        body.threadId,
        body.presenceType,
      );
      sendJson(req, res, 200, { threadPresence });
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/workflow/thread-presence/clear") {
      const threadPresence = store.clearThreadPresence(sessionId, body.threadId);
      sendJson(req, res, 200, { threadPresence });
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/workflow/thread-bindings/sync") {
      const bindings = store.syncThreadBindings(sessionId, body.items);
      sendJson(req, res, 200, { bindings });
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/admin/backup") {
      const backupPath = await store.createBackup(sessionId);
      logger?.info("backup", "Backup endpoint completed.", {
        sessionId,
        backupPath,
      });
      sendJson(req, res, 200, { backupPath });
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/admin/test-queue-data/create") {
      sendJson(req, res, 200, store.createTestQueueData(sessionId));
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/admin/test-queue-data/remove") {
      sendJson(req, res, 200, store.removeTestQueueData(sessionId));
      return true;
    }

    return false;
  };
}

function createRequestHandler(options) {
  const distDir = path.resolve(options.distDir);
  const logger =
    options.logger ?? createLogger(path.join(path.dirname(options.databasePath), "logs", "action-desk.log"));
  const store = options.store ?? new SharedWorkflowStore(options.databasePath, { logger });
  store.authProvider = options.authProvider;
  const authProvider = options.authProvider;
  const handleWorkflowRoute = createWorkflowRouteHandler(store, logger);

  return async (req, res) => {
    if (!req.url || !req.method) {
      sendJson(req, res, 400, { error: "Invalid desktop app request." });
      return;
    }

    const requestUrl = new URL(req.url, "http://localhost");

    if (req.method === "OPTIONS") {
      setCorsHeaders(req, res);
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/inbox/messages") {
      await handleInboxMessagesRequest(req, res, logger, authProvider, store);
      return;
    }

    if (requestUrl.pathname.startsWith("/api/")) {
      try {
        const handled = await handleWorkflowRoute(req, res, requestUrl);

        if (!handled) {
          sendApiError(req, res, 404, {
            code: "route_not_found",
            message: "API route not found.",
            context: requestUrl.pathname,
          });
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Workflow API request failed.";
        logger.error("api", "Workflow API request failed.", {
          path: requestUrl.pathname,
          method: req.method,
          error: message,
        });
        const unauthorized =
          message === "You must sign in before using the shared workflow.";
        const forbidden =
          message === "Only supervisors can create backups." ||
          message === "You are not allowed to perform this action.";
        sendApiError(req, res, unauthorized ? 401 : forbidden ? 403 : 400, {
          code: unauthorized
            ? "auth_required"
            : forbidden
              ? "forbidden"
              : "request_failed",
          message,
          retryable: !unauthorized && !forbidden,
          context: requestUrl.pathname,
        });
      }
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(req, res, 405, { error: "Method not allowed." });
      return;
    }

    await serveStaticRequest(req, res, distDir);
  };
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function startDesktopAppServer(options) {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const logger =
    options.logger ?? createLogger(path.join(path.dirname(options.databasePath), "logs", "action-desk.log"));
  const store = options.store ?? new SharedWorkflowStore(options.databasePath, { logger });
  const server = http.createServer(
    createRequestHandler({ ...options, store, logger, authProvider: options.authProvider }),
  );

  await new Promise((resolve, reject) => {
    server.once("error", (error) => {
      logger.error("startup", "Desktop app server failed to start.", {
        host,
        port,
        error: error?.message ?? String(error),
      });
      if (error?.code === "EADDRINUSE") {
        reject(
          new Error(
            `The packaged desktop app could not start because http://${host}:${port} is already in use.`,
          ),
        );
        return;
      }

      reject(error);
    });

    server.listen(port, host, () => {
      logger.info("startup", "Desktop app server started.", {
        host,
        port,
      });
      resolve();
    });
  });

  return {
    origin: `http://${host}:${port}`,
    logger,
    store,
    close: () => closeServer(server),
  };
}

module.exports = {
  createRequestHandler,
  startDesktopAppServer,
};
