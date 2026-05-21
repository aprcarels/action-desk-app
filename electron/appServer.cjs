const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { SharedWorkflowStore } = require("./sharedWorkflowStore.cjs");
const { createLogger } = require("./logger.cjs");
const {
  buildSessionSummary,
  getCapabilitiesForRole,
} = require("./sharedAuthPolicy.cjs");
const {
  classifyEmailWithOllama,
  draftReplyWithOllama,
} = require("./ollamaEmailClassifier.cjs");

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = 3960;
const DEFAULT_DEV_APP_PORT = 5173;
const DEFAULT_PREVIEW_APP_PORT = 4173;
const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const DEFAULT_INBOX_PAGE_SIZE = 25;
const DEFAULT_OUTLOOK_WEBHOOK_RESOURCE = "/me/mailFolders('Inbox')/messages";
const OUTLOOK_WEBHOOK_EXPIRATION_MS = (6 * 24 * 60 - 10) * 60 * 1000;
const OUTLOOK_WEBHOOK_SELECT_FIELDS =
  "id,conversationId,subject,from,receivedDateTime,sentDateTime,bodyPreview,body,hasAttachments,webLink,toRecipients,ccRecipients,internetMessageHeaders";
const MAX_STORED_OUTLOOK_NOTIFICATIONS = 100;
const EXPIRED_MICROSOFT_SESSION_MESSAGE =
  "Your Microsoft session expired. Please sign in again.";
const MICROSOFT_TOKEN_CONTEXT_MISSING_MESSAGE =
  "Microsoft token context missing for session";
const ACCESS_CHANGED_SESSION_MESSAGE = "Your access changed. Please sign in again.";
const SETTINGS_MUTATION_ROUTES = [
  "POST /api/customers",
  "PATCH /api/customers/:id",
  "POST /api/users",
  "PATCH /api/users/:id",
  "POST /api/customer-assignments",
  "PATCH /api/customer-assignments/:id",
];
const LEGACY_BACKEND_MUTATION_ROUTES = [
  "POST /api/workflow/customers/upsert",
  "POST /api/workflow/customers/delete",
  "POST /api/workflow/customers/clear",
  "POST /api/admin/users/create",
  "POST /api/admin/users/update",
  "POST /api/admin/users/deactivate",
];

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
};
const ALLOWED_CORS_ORIGINS = new Set([
  `http://localhost:${DEFAULT_PORT}`,
  `http://127.0.0.1:${DEFAULT_PORT}`,
  `http://[::1]:${DEFAULT_PORT}`,
  `http://localhost:${DEFAULT_DEV_APP_PORT}`,
  `http://127.0.0.1:${DEFAULT_DEV_APP_PORT}`,
  `http://[::1]:${DEFAULT_DEV_APP_PORT}`,
  `https://localhost:${DEFAULT_DEV_APP_PORT}`,
  `https://127.0.0.1:${DEFAULT_DEV_APP_PORT}`,
  `https://[::1]:${DEFAULT_DEV_APP_PORT}`,
  `http://localhost:${DEFAULT_PREVIEW_APP_PORT}`,
  `http://127.0.0.1:${DEFAULT_PREVIEW_APP_PORT}`,
  `http://[::1]:${DEFAULT_PREVIEW_APP_PORT}`,
]);

function getContentType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function getHeaderValue(value) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" ? candidate.trim() : "";
}

function getRequestOrigin(req) {
  return getHeaderValue(req.headers.origin);
}

function isAllowedLocalCorsOrigin(origin) {
  try {
    return ALLOWED_CORS_ORIGINS.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

function isCorsRequestAllowed(req) {
  const origin = getRequestOrigin(req);
  return !origin || isAllowedLocalCorsOrigin(origin);
}

function rejectDisallowedCorsOrigin(req, res) {
  if (isCorsRequestAllowed(req)) {
    return false;
  }

  sendText(req, res, 403, "CORS origin not allowed.");
  return true;
}

function setCorsHeaders(req, res) {
  const origin = getRequestOrigin(req);
  if (origin && isAllowedLocalCorsOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
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

function sendText(req, res, statusCode, payload) {
  setCorsHeaders(req, res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/plain");
  res.end(payload);
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

function getMissingMicrosoftContextLookupState(authProvider, sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();

  if (!normalizedSessionId) {
    return null;
  }

  const lookupState = authProvider?.getSessionLookupState?.(normalizedSessionId);

  if (lookupState && typeof lookupState === "object") {
    return lookupState.tokenContextExists === false ? lookupState : null;
  }

  return authProvider?.hasSessionContext?.(normalizedSessionId) === false
    ? getMicrosoftSessionLookupLogMetadata(authProvider, normalizedSessionId)
    : null;
}

function logStalePersistedSessionDetected(logger, authProvider, sessionId, routePath) {
  logger?.warn?.("auth", "stalePersistedSessionDetected", {
    reason: "missing_microsoft_context",
    routePath,
    ...getMicrosoftSessionLookupLogMetadata(authProvider, sessionId),
  });
}

function logClearedLocalSessionState(logger, authProvider, sessionId, routePath, reason) {
  logger?.info?.("auth", "clearedLocalSessionState", {
    reason,
    routePath,
    ...getMicrosoftSessionLookupLogMetadata(authProvider, sessionId),
  });
}

function fireAndForgetBackendLogout(backendApi, sessionId, logger, routePath) {
  logger?.info?.("auth", "skippedBlockingLogout", {
    routePath,
    sessionId: String(sessionId || "").trim() || undefined,
  });

  const logLogoutFailure = (error) => {
    logger?.warn?.("auth", "Backend logout failed.", {
      routePath,
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  };

  try {
    void Promise.resolve(
      backendApi.requestJson("/api/auth/logout", {
        method: "POST",
        sessionId,
        body: {},
      }),
    ).catch(logLogoutFailure);
  } catch (error) {
    logLogoutFailure(error);
  }
}

function logRegisteredMutationRoutes(logger, context = {}) {
  logger?.info?.("startup", "registeredMutationRoutes", {
    ...context,
    routes: SETTINGS_MUTATION_ROUTES,
    legacyBackendFallbackRoutes: LEGACY_BACKEND_MUTATION_ROUTES,
  });
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

  if (
    sessionCode === "missing_microsoft_context" ||
    sessionCode === "microsoft_token_context_missing"
  ) {
    return {
      code: "microsoft_token_context_missing",
      message: MICROSOFT_TOKEN_CONTEXT_MISSING_MESSAGE,
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
  if (typeof value === "string") {
    return value.replace(/\s+/g, " ").trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
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

function normalizeBodyText(body, bodyPreview, hasAttachments) {
  const bodyContent = body?.content?.trim();
  const previewText = normalizeText(bodyPreview);

  if (bodyContent) {
    const isHtmlBody =
      body?.contentType?.toLowerCase() === "html" || /<[^>]+>/.test(bodyContent);
    const normalizedBody =
      isHtmlBody
        ? stripHtml(bodyContent)
        : bodyContent.replace(/\r\n?/g, "\n").trim();

    if (normalizedBody.length > 0) {
      return {
        bodyText: normalizedBody,
      };
    }

    return {
      bodyText: previewText,
      missingBodyReason:
        isHtmlBody && previewText.length === 0 ? "htmlBodyEmptyAfterStrip" : undefined,
    };
  }

  if (previewText.length > 0) {
    return {
      bodyText: previewText,
    };
  }

  return {
    bodyText: "",
    missingBodyReason:
      hasAttachments === true ? "attachmentOnlyMessage" : "graphBodyMissing",
  };
}

function normalizeReceivedAt(receivedDateTime) {
  const normalized = receivedDateTime?.trim() ?? "";

  if (!normalized) {
    return "";
  }

  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? normalized : new Date(timestamp).toISOString();
}

function normalizeSentAt(sentDateTime) {
  const normalized = sentDateTime?.trim() ?? "";

  if (!normalized) {
    return undefined;
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

function logMissingBodyReason(message, reason) {
  if (!reason) {
    return;
  }

  console.info("[Action Desk diagnostics] outlookGraphBodyMissing", {
    reason,
    messageId: message.id?.trim() || undefined,
    subject: message.subject?.trim() || undefined,
    senderEmail: message.from?.emailAddress?.address?.trim() || undefined,
    bodyContentType: message.body?.contentType?.trim() || undefined,
    hasBodyContent: Boolean(message.body?.content?.trim()),
    hasBodyPreview: Boolean(message.bodyPreview?.trim()),
    hasAttachments: message.hasAttachments === true,
  });
}

function normalizeGraphMessagesResponse(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.value)) {
    throw new Error("Invalid Outlook Graph inbox response.");
  }

  return {
    emails: payload.value.map((message) => {
      const id = message.id?.trim() || "";
      const bodyResult = normalizeBodyText(
        message.body,
        message.bodyPreview,
        message.hasAttachments,
      );
      const bodyText = bodyResult.bodyText;
      const fromEmail = message.from?.emailAddress?.address?.trim() || "";
      const fromName = message.from?.emailAddress?.name?.trim() || fromEmail || "Unknown sender";
      const sentAt = normalizeSentAt(message.sentDateTime);
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
      logMissingBodyReason(message, bodyResult.missingBodyReason);

      return {
        id,
        externalId: id,
        provider: "outlook_graph",
        threadId: message.conversationId?.trim() || undefined,
        subject: message.subject?.trim() || "(no subject)",
        fromName,
        fromEmail,
        receivedAt: normalizeReceivedAt(message.receivedDateTime),
        ...(sentAt ? { sentAt } : {}),
        bodyText,
        bodyHtml: message.body?.content,
        previewText: normalizePreviewText(message.bodyPreview, bodyText),
        ...(typeof message.hasAttachments === "boolean"
          ? { hasAttachments: message.hasAttachments }
          : {}),
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
      "id,conversationId,subject,from,receivedDateTime,sentDateTime,bodyPreview,body,hasAttachments,webLink,toRecipients,ccRecipients,internetMessageHeaders",
  });

  return `/me/messages?${searchParams.toString()}`;
}

function getOutlookWebhookStatePath(databasePath) {
  const appDataDirectory = path.dirname(path.resolve(databasePath || "action-desk-shared.sqlite"));
  return path.join(appDataDirectory, "logs", "outlook-webhook-state.json");
}

function normalizeWebhookState(rawState) {
  return {
    subscriptions: Array.isArray(rawState?.subscriptions) ? rawState.subscriptions : [],
    notifications: Array.isArray(rawState?.notifications) ? rawState.notifications : [],
  };
}

function readWebhookState(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return normalizeWebhookState();
    }

    return normalizeWebhookState(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch {
    return normalizeWebhookState();
  }
}

function writeWebhookState(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(normalizeWebhookState(state), null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function getClientStateSummary(clientState) {
  const normalized = String(clientState || "");

  if (!normalized) {
    return {
      clientStateHash: undefined,
      clientStateLast4: undefined,
    };
  }

  return {
    clientStateHash: crypto.createHash("sha256").update(normalized).digest("hex"),
    clientStateLast4: normalized.slice(-4),
  };
}

function createOutlookWebhookStore(filePath) {
  function updateState(updater) {
    const state = readWebhookState(filePath);
    const nextState = normalizeWebhookState(updater(state) ?? state);
    writeWebhookState(filePath, nextState);
    return nextState;
  }

  function listSubscriptions() {
    return readWebhookState(filePath).subscriptions
      .slice()
      .sort((left, right) =>
        String(right.updatedAt || right.createdAt || "").localeCompare(
          String(left.updatedAt || left.createdAt || ""),
        ),
      );
  }

  function getLatestActiveSubscription() {
    return listSubscriptions().find((subscription) => subscription.status !== "deleted") ?? null;
  }

  return {
    filePath,
    getState() {
      return readWebhookState(filePath);
    },
    listSubscriptions,
    getLatestActiveSubscription,
    upsertSubscription(input) {
      const now = new Date().toISOString();
      let savedRecord = null;

      updateState((state) => {
        const existing = state.subscriptions.find(
          (subscription) => subscription.id === input.id,
        );
        const summary = getClientStateSummary(input.clientState);
        const record = {
          id: input.id,
          resource: input.resource,
          expirationDateTime: input.expirationDateTime,
          notificationUrl: input.notificationUrl,
          lifecycleNotificationUrl: input.lifecycleNotificationUrl,
          clientStateHash: summary.clientStateHash ?? existing?.clientStateHash,
          clientStateLast4: summary.clientStateLast4 ?? existing?.clientStateLast4,
          status: "active",
          createdAt: existing?.createdAt ?? input.createdAt ?? now,
          updatedAt: now,
        };
        const nextSubscriptions = existing
          ? state.subscriptions.map((subscription) =>
              subscription.id === input.id ? record : subscription,
            )
          : [...state.subscriptions, record];

        savedRecord = record;
        return {
          ...state,
          subscriptions: nextSubscriptions,
        };
      });

      return savedRecord;
    },
    markSubscriptionDeleted(subscriptionId) {
      const now = new Date().toISOString();
      let savedRecord = null;

      updateState((state) => {
        const existing = state.subscriptions.find(
          (subscription) => subscription.id === subscriptionId,
        );

        if (!existing) {
          const record = {
            id: subscriptionId,
            status: "deleted",
            createdAt: now,
            updatedAt: now,
            deletedAt: now,
          };
          savedRecord = record;
          return {
            ...state,
            subscriptions: [...state.subscriptions, record],
          };
        }

        const record = {
          ...existing,
          status: "deleted",
          updatedAt: now,
          deletedAt: now,
        };
        savedRecord = record;
        return {
          ...state,
          subscriptions: state.subscriptions.map((subscription) =>
            subscription.id === subscriptionId ? record : subscription,
          ),
        };
      });

      return savedRecord;
    },
    recordNotificationAttempt(input) {
      const now = new Date().toISOString();
      const record = {
        id: crypto.randomUUID(),
        endpoint: input.endpoint,
        subscriptionId: normalizeText(input.subscriptionId),
        changeType: normalizeText(input.changeType),
        resource: normalizeText(input.resource),
        resourceDataId: normalizeText(input.resourceDataId),
        status: input.status,
        receivedAt: now,
        updatedAt: now,
        error: input.error,
        ticketId: input.ticketId,
      };

      updateState((state) => ({
        ...state,
        notifications: [record, ...state.notifications].slice(
          0,
          MAX_STORED_OUTLOOK_NOTIFICATIONS,
        ),
      }));

      return record;
    },
    updateNotificationAttempt(attemptId, updates) {
      const now = new Date().toISOString();
      let savedRecord = null;

      updateState((state) => ({
        ...state,
        notifications: state.notifications.map((notification) => {
          if (notification.id !== attemptId) {
            return notification;
          }

          savedRecord = {
            ...notification,
            ...updates,
            updatedAt: now,
          };
          return savedRecord;
        }),
      }));

      return savedRecord;
    },
  };
}

function getOutlookWebhookConfig() {
  const publicBaseUrl = process.env.ACTION_DESK_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "") ?? "";
  const clientState = process.env.ACTION_DESK_OUTLOOK_WEBHOOK_CLIENT_STATE?.trim() ?? "";
  const resource =
    process.env.ACTION_DESK_OUTLOOK_WEBHOOK_RESOURCE?.trim() ||
    DEFAULT_OUTLOOK_WEBHOOK_RESOURCE;

  return {
    enabled: process.env.ACTION_DESK_OUTLOOK_WEBHOOK_ENABLED === "true",
    publicBaseUrl,
    clientState,
    resource,
    notificationUrl: publicBaseUrl ? `${publicBaseUrl}/api/outlook/webhook` : "",
    lifecycleNotificationUrl: publicBaseUrl
      ? `${publicBaseUrl}/api/outlook/lifecycle`
      : "",
  };
}

function getOutlookSubscriptionExpirationDateTime() {
  return new Date(Date.now() + OUTLOOK_WEBHOOK_EXPIRATION_MS).toISOString();
}

function createHttpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function getRequestSessionId(req, requestUrl, body) {
  const headerSessionId = getHeaderValue(req.headers["x-action-desk-session-id"]);
  if (headerSessionId) {
    return headerSessionId;
  }

  const bodySessionId = String(body?.sessionId || "").trim();
  if (bodySessionId) {
    return bodySessionId;
  }

  return requestUrl.searchParams.get("sessionId") ?? "";
}

function getMicrosoftSessionLookupLogMetadata(authProvider, sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();
  const lookupState = authProvider?.getSessionLookupState?.(normalizedSessionId);

  if (lookupState && typeof lookupState === "object") {
    return {
      microsoftAuthSessionId: lookupState.microsoftAuthSessionId || undefined,
      backendSessionId:
        lookupState.backendSessionId ||
        (lookupState.aliasUsed ? lookupState.tokenLookupSessionId : undefined),
      tokenLookupSessionId: lookupState.tokenLookupSessionId || normalizedSessionId || undefined,
      resolvedMicrosoftSessionId:
        lookupState.resolvedMicrosoftSessionId || lookupState.microsoftAuthSessionId || undefined,
      tokenContextExists: Boolean(lookupState.tokenContextExists),
      aliasUsed: Boolean(lookupState.aliasUsed),
    };
  }

  return {
    microsoftAuthSessionId: normalizedSessionId || undefined,
    backendSessionId: undefined,
    tokenLookupSessionId: normalizedSessionId || undefined,
    resolvedMicrosoftSessionId: normalizedSessionId || undefined,
    tokenContextExists: normalizedSessionId
      ? Boolean(authProvider?.hasSessionContext?.(normalizedSessionId))
      : false,
    aliasUsed: false,
  };
}

function logMicrosoftTokenLookup(logger, authProvider, sessionId, routePath, message) {
  logger?.info?.("auth", message, {
    routePath,
    ...getMicrosoftSessionLookupLogMetadata(authProvider, sessionId),
  });
}

function logMicrosoftTokenContextMissing(logger, authProvider, sessionId, routePath) {
  logger?.warn?.("auth", "Microsoft token context missing for session.", {
    routePath,
    ...getMicrosoftSessionLookupLogMetadata(authProvider, sessionId),
  });
}

async function getGraphAuthorizationForRequest(req, requestUrl, body, authProvider, logger) {
  const authorization = req.headers.authorization?.trim();

  if (authorization?.startsWith("Bearer ")) {
    return {
      authorization,
      sessionId: getRequestSessionId(req, requestUrl, body),
    };
  }

  const sessionId = getRequestSessionId(req, requestUrl, body);

  if (!authProvider?.getAccessTokenForSession) {
    throw createHttpError(
      401,
      "microsoft_auth_required",
      "Microsoft sign-in is required to manage Outlook webhook subscriptions.",
    );
  }

  logMicrosoftTokenLookup(
    logger,
    authProvider,
    sessionId,
    requestUrl.pathname,
    "Looking up Microsoft token for Outlook route.",
  );
  const accessToken = await authProvider.getAccessTokenForSession(
    sessionId,
    { interactive: false, routePath: requestUrl.pathname },
    logger,
  );

  return {
    authorization: `Bearer ${accessToken}`,
    sessionId,
  };
}

async function getGraphAuthorizationForWebhook(notification, context) {
  const subscriptionId = normalizeText(notification?.subscriptionId);
  const sessionId = subscriptionId
    ? context.subscriptionAuthSessions.get(subscriptionId)
    : undefined;

  if (sessionId && context.authProvider?.getAccessTokenForSession) {
    logMicrosoftTokenLookup(
      context.logger,
      context.authProvider,
      sessionId,
      "outlook-webhook",
      "Looking up Microsoft token for Outlook webhook.",
    );
    const accessToken = await context.authProvider.getAccessTokenForSession(
      sessionId,
      { interactive: false, routePath: "outlook-webhook" },
      context.logger,
    );
    return `Bearer ${accessToken}`;
  }

  if (context.authProvider?.getAccessTokenForAvailableSession) {
    const accessToken = await context.authProvider.getAccessTokenForAvailableSession(
      { interactive: false, routePath: "outlook-webhook" },
      context.logger,
    );
    return `Bearer ${accessToken}`;
  }

  throw new Error(
    "No active Microsoft session is available to fetch Outlook webhook messages.",
  );
}

async function readGraphResponsePayload(response) {
  if (typeof response.text === "function") {
    const text = await response.text();

    if (!text.trim()) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  if (typeof response.json === "function") {
    return response.json();
  }

  return null;
}

function getGraphPayloadErrorMessage(payload, fallback) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  if (payload && typeof payload === "object") {
    return (
      payload.error?.message ??
      payload.message ??
      fallback
    );
  }

  return fallback;
}

function getGraphReplyDraftPayload(body) {
  const messageId = normalizeText(
    body?.messageId ??
      body?.providerMessageId ??
      body?.externalId ??
      body?.id,
  );
  const replyText =
    typeof body?.replyText === "string" ? body.replyText : "";

  return {
    messageId,
    replyText,
  };
}

function createGraphReplyDraftBody(replyText) {
  return {
    message: {
      body: {
        contentType: "Text",
        content: replyText,
      },
    },
  };
}

function normalizeGraphDraftPayload(payload) {
  return {
    id: normalizeText(payload?.id),
    webLink: normalizeText(payload?.webLink) || undefined,
    subject: normalizeText(payload?.subject) || undefined,
  };
}

function safeCompareText(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function getOutlookNotifications(body) {
  if (Array.isArray(body?.value)) {
    return body.value.filter((notification) => notification && typeof notification === "object");
  }

  if (Array.isArray(body)) {
    return body.filter((notification) => notification && typeof notification === "object");
  }

  return [];
}

function validateOutlookNotificationClientStates(notifications, expectedClientState) {
  return notifications.every((notification) =>
    safeCompareText(notification.clientState, expectedClientState),
  );
}

function trimGraphResourcePath(resource) {
  const normalized = normalizeText(resource);

  if (!normalized) {
    return "";
  }

  const withoutOrigin = normalized.replace(
    /^https:\/\/graph\.microsoft\.com\/v1\.0/i,
    "",
  );
  const withoutQuery = withoutOrigin.split(/[?#]/)[0] ?? "";
  return withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
}

function splitGraphResourcePath(resource) {
  return trimGraphResourcePath(resource)
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
}

function getMessageIdFromNotification(notification) {
  const resourceDataId = normalizeText(notification?.resourceData?.id);

  if (resourceDataId) {
    return resourceDataId;
  }

  const resourceSegments = splitGraphResourcePath(notification?.resource);
  return resourceSegments[resourceSegments.length - 1] ?? "";
}

function getMailboxPrefixFromResource(resource) {
  const resourceSegments = splitGraphResourcePath(resource);
  const firstSegment = resourceSegments[0]?.toLowerCase();

  if (firstSegment === "users" && resourceSegments[1]) {
    return `/users/${encodeURIComponent(resourceSegments[1])}`;
  }

  return "/me";
}

function getMailboxIdFromResource(resource) {
  const resourceSegments = splitGraphResourcePath(resource);
  const firstSegment = resourceSegments[0]?.toLowerCase();

  if (firstSegment === "users" && resourceSegments[1]) {
    return resourceSegments[1];
  }

  if (firstSegment === "me") {
    return "me";
  }

  return "outlook_graph";
}

function buildGraphMessageFetchPath(notification) {
  const messageId = getMessageIdFromNotification(notification);

  if (!messageId) {
    return null;
  }

  const searchParams = new URLSearchParams({
    "$select": OUTLOOK_WEBHOOK_SELECT_FIELDS,
  });

  return `${getMailboxPrefixFromResource(notification.resource)}/messages/${encodeURIComponent(
    messageId,
  )}?${searchParams.toString()}`;
}

function normalizeGraphMessageForIngestion(message, notification) {
  const normalized = normalizeGraphMessagesResponse({ value: [message] }).emails[0];

  return {
    ...normalized,
    messageId: normalized.id,
    conversationId: normalized.threadId,
    mailboxId: getMailboxIdFromResource(notification.resource),
    receivedDateTime: normalized.receivedAt,
    bodyPreview: normalized.previewText,
  };
}

function resolveProcessIncomingEmail(context) {
  if (context.processIncomingEmail) {
    return context.processIncomingEmail;
  }

  throw new Error(
    "Outlook webhook ingestion is not configured in the desktop runtime.",
  );
}

async function fetchOutlookWebhookMessage(notification, context) {
  const graphPath = buildGraphMessageFetchPath(notification);

  if (!graphPath) {
    throw new Error("Outlook webhook notification did not include a message id.");
  }

  const authorization = await getGraphAuthorizationForWebhook(notification, context);
  const response = await fetch(`${GRAPH_BASE_URL}${graphPath}`, {
    method: "GET",
    headers: {
      Authorization: authorization,
      Accept: "application/json",
    },
  });
  const payload = await readGraphResponsePayload(response);

  if (!response.ok) {
    throw new Error(
      getGraphPayloadErrorMessage(
        payload,
        `Outlook webhook message fetch failed with status ${response.status}.`,
      ),
    );
  }

  return payload;
}

async function processOutlookWebhookNotification(notification, context, endpoint) {
  const attempt = context.webhookStore.recordNotificationAttempt({
    endpoint,
    subscriptionId: notification.subscriptionId,
    changeType: notification.changeType,
    resource: notification.resource,
    resourceDataId: getMessageIdFromNotification(notification),
    status: endpoint === "lifecycle" ? "lifecycle_received" : "accepted",
  });

  if (endpoint === "lifecycle") {
    return;
  }

  try {
    const message = await fetchOutlookWebhookMessage(notification, context);
    const email = normalizeGraphMessageForIngestion(message, notification);
    const processIncomingEmail = resolveProcessIncomingEmail(context);
    const ticketId = await processIncomingEmail(email, "webhook");

    if (!ticketId) {
      throw new Error("Incoming email ingestion did not return a ticket id.");
    }

    context.webhookStore.updateNotificationAttempt(attempt.id, {
      status: "ingested",
      ticketId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Outlook webhook notification processing failed.";
    context.webhookStore.updateNotificationAttempt(attempt.id, {
      status: "error",
      error: message,
    });
    context.logger?.error("outlook-webhook", "Outlook webhook processing failed.", {
      subscriptionId: normalizeText(notification.subscriptionId) || undefined,
      resource: normalizeText(notification.resource) || undefined,
      error: message,
    });
  }
}

async function processOutlookWebhookNotifications(notifications, context, endpoint) {
  for (const notification of notifications) {
    await processOutlookWebhookNotification(notification, context, endpoint);
  }
}

async function handleOutlookWebhookEndpoint(req, res, requestUrl, context, endpoint) {
  const validationToken = requestUrl.searchParams.get("validationToken");

  if (validationToken !== null) {
    context.logger?.info("outlook-webhook", "outlook-webhook validation", {
      endpoint,
    });
    sendText(req, res, 200, validationToken);
    return true;
  }

  if (req.method !== "POST") {
    sendApiError(req, res, 405, {
      code: "method_not_allowed",
      message: "Outlook webhook notifications must use POST.",
      context: requestUrl.pathname,
    });
    return true;
  }

  let body;

  try {
    body = await readRequestBody(req);
  } catch {
    sendApiError(req, res, 400, {
      code: "invalid_json",
      message: "Outlook webhook request body must be valid JSON.",
      context: requestUrl.pathname,
    });
    return true;
  }

  const notifications = getOutlookNotifications(body);
  const expectedClientState = getOutlookWebhookConfig().clientState;

  if (notifications.length > 0 && !expectedClientState) {
    sendApiError(req, res, 500, {
      code: "outlook_webhook_not_configured",
      message:
        "ACTION_DESK_OUTLOOK_WEBHOOK_CLIENT_STATE is required to validate Outlook webhook notifications.",
      context: requestUrl.pathname,
    });
    return true;
  }

  if (!validateOutlookNotificationClientStates(notifications, expectedClientState)) {
    context.logger?.warn("outlook-webhook", "outlook-webhook clientState mismatch", {
      endpoint,
      notificationCount: notifications.length,
    });
    sendApiError(req, res, 403, {
      code: "outlook_webhook_client_state_mismatch",
      message: "Outlook webhook clientState did not match the configured secret.",
      context: requestUrl.pathname,
    });
    return true;
  }

  context.logger?.info("outlook-webhook", "outlook-webhook notification accepted", {
    endpoint,
    notificationCount: notifications.length,
  });
  sendJson(req, res, 202, {
    accepted: true,
    notificationCount: notifications.length,
  });

  setImmediate(() => {
    processOutlookWebhookNotifications(notifications, context, endpoint).catch((error) => {
      context.logger?.error("outlook-webhook", "Outlook webhook batch processing failed.", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });

  return true;
}

function validateSubscriptionCreateConfig(config) {
  if (!config.publicBaseUrl) {
    return "ACTION_DESK_PUBLIC_BASE_URL is required to create Outlook webhook subscriptions.";
  }

  if (!config.clientState) {
    return "ACTION_DESK_OUTLOOK_WEBHOOK_CLIENT_STATE is required to create Outlook webhook subscriptions.";
  }

  return null;
}

async function createOutlookSubscription(req, res, requestUrl, context) {
  const body = await readRequestBody(req);
  const config = getOutlookWebhookConfig();
  const configError = validateSubscriptionCreateConfig(config);

  if (configError) {
    sendApiError(req, res, 400, {
      code: "outlook_subscription_not_configured",
      message: configError,
      context: requestUrl.pathname,
    });
    return true;
  }

  const { authorization, sessionId } = await getGraphAuthorizationForRequest(
    req,
    requestUrl,
    body,
    context.authProvider,
    context.logger,
  );
  const expirationDateTime = getOutlookSubscriptionExpirationDateTime();
  const payload = {
    changeType: "created",
    notificationUrl: config.notificationUrl,
    lifecycleNotificationUrl: config.lifecycleNotificationUrl,
    resource: config.resource,
    expirationDateTime,
    clientState: config.clientState,
  };
  const response = await fetch(`${GRAPH_BASE_URL}/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const graphPayload = await readGraphResponsePayload(response);

  if (!response.ok) {
    throw createHttpError(
      502,
      "outlook_subscription_create_failed",
      getGraphPayloadErrorMessage(
        graphPayload,
        `Outlook subscription creation failed with status ${response.status}.`,
      ),
    );
  }

  const subscriptionId = normalizeText(graphPayload?.id);

  if (!subscriptionId) {
    throw createHttpError(
      502,
      "outlook_subscription_create_failed",
      "Outlook subscription creation did not return a subscription id.",
    );
  }

  const subscription = context.webhookStore.upsertSubscription({
    id: subscriptionId,
    resource: normalizeText(graphPayload?.resource) || config.resource,
    expirationDateTime:
      normalizeText(graphPayload?.expirationDateTime) || expirationDateTime,
    notificationUrl: config.notificationUrl,
    lifecycleNotificationUrl: config.lifecycleNotificationUrl,
    clientState: config.clientState,
  });

  if (subscriptionId && sessionId) {
    context.subscriptionAuthSessions.set(subscriptionId, String(sessionId));
  }

  context.logger?.info("outlook-subscription", "outlook-subscription created", {
    subscriptionId,
    resource: subscription?.resource,
    expirationDateTime: subscription?.expirationDateTime,
  });
  sendJson(req, res, 200, {
    subscription,
  });
  return true;
}

function getSubscriptionIdFromBodyOrStore(body, context) {
  return (
    normalizeText(body?.subscriptionId) ||
    normalizeText(body?.id) ||
    normalizeText(context.webhookStore.getLatestActiveSubscription()?.id)
  );
}

async function renewOutlookSubscription(req, res, requestUrl, context) {
  const body = await readRequestBody(req);
  const subscriptionId = getSubscriptionIdFromBodyOrStore(body, context);

  if (!subscriptionId) {
    sendApiError(req, res, 400, {
      code: "missing_subscription_id",
      message: "subscriptionId is required to renew an Outlook webhook subscription.",
      context: requestUrl.pathname,
    });
    return true;
  }

  const { authorization, sessionId } = await getGraphAuthorizationForRequest(
    req,
    requestUrl,
    body,
    context.authProvider,
    context.logger,
  );
  const expirationDateTime = getOutlookSubscriptionExpirationDateTime();
  const response = await fetch(
    `${GRAPH_BASE_URL}/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: authorization,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expirationDateTime }),
    },
  );
  const graphPayload = await readGraphResponsePayload(response);

  if (!response.ok) {
    throw createHttpError(
      502,
      "outlook_subscription_renew_failed",
      getGraphPayloadErrorMessage(
        graphPayload,
        `Outlook subscription renewal failed with status ${response.status}.`,
      ),
    );
  }

  const existing = context.webhookStore
    .listSubscriptions()
    .find((subscription) => subscription.id === subscriptionId);
  const subscription = context.webhookStore.upsertSubscription({
    id: subscriptionId,
    resource: normalizeText(graphPayload?.resource) || existing?.resource,
    expirationDateTime:
      normalizeText(graphPayload?.expirationDateTime) || expirationDateTime,
    notificationUrl: existing?.notificationUrl,
    lifecycleNotificationUrl: existing?.lifecycleNotificationUrl,
  });

  if (sessionId) {
    context.subscriptionAuthSessions.set(subscriptionId, String(sessionId));
  }

  context.logger?.info("outlook-subscription", "outlook-subscription renewed", {
    subscriptionId,
    expirationDateTime: subscription?.expirationDateTime,
  });
  sendJson(req, res, 200, {
    subscription,
  });
  return true;
}

async function deleteOutlookSubscription(req, res, requestUrl, context) {
  const body = await readRequestBody(req);
  const subscriptionId = getSubscriptionIdFromBodyOrStore(body, context);

  if (!subscriptionId) {
    sendApiError(req, res, 400, {
      code: "missing_subscription_id",
      message: "subscriptionId is required to delete an Outlook webhook subscription.",
      context: requestUrl.pathname,
    });
    return true;
  }

  const { authorization } = await getGraphAuthorizationForRequest(
    req,
    requestUrl,
    body,
    context.authProvider,
    context.logger,
  );
  const response = await fetch(
    `${GRAPH_BASE_URL}/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: authorization,
        Accept: "application/json",
      },
    },
  );
  const graphPayload = await readGraphResponsePayload(response);

  if (!response.ok && response.status !== 204) {
    throw createHttpError(
      502,
      "outlook_subscription_delete_failed",
      getGraphPayloadErrorMessage(
        graphPayload,
        `Outlook subscription delete failed with status ${response.status}.`,
      ),
    );
  }

  context.subscriptionAuthSessions.delete(subscriptionId);
  const subscription = context.webhookStore.markSubscriptionDeleted(subscriptionId);

  context.logger?.info("outlook-subscription", "outlook-subscription deleted", {
    subscriptionId,
  });
  sendJson(req, res, 200, {
    deleted: true,
    subscription,
  });
  return true;
}

async function createOutlookReplyDraft(req, res, requestUrl, context) {
  const body = await readRequestBody(req);
  const { messageId, replyText } = getGraphReplyDraftPayload(body);

  if (!messageId) {
    sendApiError(req, res, 400, {
      code: "missing_outlook_message_id",
      message: "An Outlook message id is required to create a reply draft.",
      retryable: false,
      context: requestUrl.pathname,
    });
    return true;
  }

  if (!replyText.trim()) {
    sendApiError(req, res, 400, {
      code: "missing_reply_text",
      message: "Reply text is required to create an Outlook draft.",
      retryable: false,
      context: requestUrl.pathname,
    });
    return true;
  }

  const { authorization, sessionId } = await getGraphAuthorizationForRequest(
    req,
    requestUrl,
    body,
    context.authProvider,
    context.logger,
  );
  const response = await fetch(
    `${GRAPH_BASE_URL}/me/messages/${encodeURIComponent(messageId)}/createReply`,
    {
      method: "POST",
      headers: {
        Authorization: authorization,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createGraphReplyDraftBody(replyText)),
    },
  );
  const graphPayload = await readGraphResponsePayload(response);

  if (!response.ok) {
    if (response.status === 401) {
      throw createHttpError(
        401,
        "stale_microsoft_session",
        EXPIRED_MICROSOFT_SESSION_MESSAGE,
      );
    }

    if (response.status === 403) {
      throw createHttpError(
        403,
        "outlook_draft_permission_missing",
        getGraphPayloadErrorMessage(
          graphPayload,
          "Outlook draft creation is not authorized. Sign in again and approve Mail.ReadWrite access.",
        ),
      );
    }

    throw createHttpError(
      502,
      "outlook_reply_draft_create_failed",
      getGraphPayloadErrorMessage(
        graphPayload,
        `Outlook reply draft creation failed with status ${response.status}.`,
      ),
    );
  }

  const draft = normalizeGraphDraftPayload(graphPayload);

  if (!draft.id) {
    throw createHttpError(
      502,
      "outlook_reply_draft_create_failed",
      "Outlook created a reply draft but did not return a draft id.",
    );
  }

  context.logger?.info("outlook-draft", "outlook-reply-draft created", {
    sessionId: String(sessionId || "") || undefined,
    sourceMessageId: messageId,
    draftId: draft.id,
    hasWebLink: Boolean(draft.webLink),
  });

  sendJson(req, res, 200, {
    draft,
    webLink: draft.webLink,
  });
  return true;
}

function getOutlookSubscriptionStatus(req, res, context) {
  const config = getOutlookWebhookConfig();

  sendJson(req, res, 200, {
    enabled: config.enabled,
    configured: {
      publicBaseUrl: Boolean(config.publicBaseUrl),
      clientState: Boolean(config.clientState),
      resource: config.resource,
      notificationUrl: config.notificationUrl || undefined,
      lifecycleNotificationUrl: config.lifecycleNotificationUrl || undefined,
    },
    subscriptions: context.webhookStore.listSubscriptions(),
    recentNotifications: context.webhookStore.getState().notifications,
    storePath: context.webhookStore.filePath,
  });
  return true;
}

async function handleOutlookRoute(req, res, requestUrl, context) {
  if (
    requestUrl.pathname === "/api/outlook/webhook" ||
    requestUrl.pathname === "/api/outlook/lifecycle"
  ) {
    return handleOutlookWebhookEndpoint(
      req,
      res,
      requestUrl,
      context,
      requestUrl.pathname.endsWith("/lifecycle") ? "lifecycle" : "webhook",
    );
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/outlook/reply-drafts") {
    return createOutlookReplyDraft(req, res, requestUrl, context);
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/outlook/subscriptions/create") {
    return createOutlookSubscription(req, res, requestUrl, context);
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/outlook/subscriptions/status") {
    return getOutlookSubscriptionStatus(req, res, context);
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/outlook/subscriptions/renew") {
    return renewOutlookSubscription(req, res, requestUrl, context);
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/outlook/subscriptions/delete") {
    return deleteOutlookSubscription(req, res, requestUrl, context);
  }

  return false;
}

async function handleAiClassificationRoute(req, res, logger, backendApi) {
  if (req.method !== "POST") {
    sendApiError(req, res, 405, {
      code: "method_not_allowed",
      message: "AI classification only supports POST.",
      retryable: false,
      context: "/api/ai/classify-email",
    });
    return true;
  }

  try {
    const body = await readRequestBody(req);

    if (hasBackendApi(backendApi)) {
      logger?.info?.("ai", "Forwarding AI classification to backend API.", {
        context: "/api/ai/classify-email",
        backendApiUrl: backendApi.baseUrl,
      });

      const classification = await backendApi.requestJson("/api/ai/classify-email", {
        method: "POST",
        body,
      });

      logger?.info?.("ai", "Backend AI classification completed.", {
        context: "/api/ai/classify-email",
        backendApiUrl: backendApi.baseUrl,
        category: classification?.category,
        actionable: classification?.actionable,
        urgency: classification?.urgency,
        confidence: classification?.confidence,
        aiSource: classification?.aiSource,
      });

      sendJson(req, res, 200, classification);
      return true;
    }

    logger?.info?.("ai", "AI classification route called.", {
      context: "/api/ai/classify-email",
      provider: "ollama",
    });
    const classification = await classifyEmailWithOllama(body, {
      onDiagnostic(diagnostic) {
        const level = diagnostic?.level === "warn" ? "warn" : "info";
        const event = diagnostic?.event || "ollamaClassificationDiagnostic";
        const metadata =
          diagnostic && typeof diagnostic.metadata === "object"
            ? diagnostic.metadata
            : {};

        logger?.[level]?.("ai", event, {
          context: "/api/ai/classify-email",
          provider: "ollama",
          ...metadata,
        });
      },
    });

    logger?.info?.("ai", "AI classification route completed.", {
      context: "/api/ai/classify-email",
      provider: "ollama",
      category: classification.category,
      actionable: classification.actionable,
      urgency: classification.urgency,
      confidence: classification.confidence,
      aiSource: classification.aiSource,
    });

    sendJson(req, res, 200, classification);
  } catch (error) {
    const statusCode = Number.isInteger(error?.statusCode)
      ? error.statusCode
      : 503;
    const code = error?.code ?? "ai_unavailable";
    const message =
      error instanceof Error
        ? error.message
        : "AI classification is unavailable.";

    logger?.warn?.("ai", "AI classification route failed.", {
      code,
      statusCode,
      error: message,
      fallbackReason: code,
      context: "/api/ai/classify-email",
      details: error?.details,
    });
    sendApiError(req, res, statusCode, {
      code,
      message,
      retryable: error?.retryable ?? statusCode >= 500,
      context: "/api/ai/classify-email",
      details: error?.details,
    });
  }

  return true;
}

async function handleAiReplyDraftRoute(req, res, logger, backendApi) {
  if (req.method !== "POST") {
    sendApiError(req, res, 405, {
      code: "method_not_allowed",
      message: "AI reply drafting only supports POST.",
      retryable: false,
      context: "/api/ai/draft-reply",
    });
    return true;
  }

  try {
    const body = await readRequestBody(req);

    if (hasBackendApi(backendApi)) {
      try {
        logger?.info?.("ai", "Forwarding AI reply drafting to backend API.", {
          context: "/api/ai/draft-reply",
          backendApiUrl: backendApi.baseUrl,
        });

        const draft = await backendApi.requestJson("/api/ai/draft-reply", {
          method: "POST",
          body,
        });

        logger?.info?.("ai", "Backend AI reply drafting completed.", {
          context: "/api/ai/draft-reply",
          backendApiUrl: backendApi.baseUrl,
          replyDraftLength: draft?.replyDraft?.length,
          aiSource: draft?.aiSource,
        });

        sendJson(req, res, 200, draft);
        return true;
      } catch (backendError) {
        logger?.warn?.("ai", "Backend AI reply drafting unavailable; falling back to local Ollama.", {
          context: "/api/ai/draft-reply",
          backendApiUrl: backendApi.baseUrl,
          code: backendError?.code,
          statusCode: backendError?.statusCode,
          message: backendError instanceof Error ? backendError.message : String(backendError),
        });
      }
    }

    logger?.info?.("ai", "AI reply draft route called.", {
      context: "/api/ai/draft-reply",
      provider: "ollama",
    });
    const draft = await draftReplyWithOllama(body, {
      onDiagnostic(diagnostic) {
        const level = diagnostic?.level === "warn" ? "warn" : "info";
        const event = diagnostic?.event || "ollamaReplyDraftDiagnostic";
        const metadata =
          diagnostic && typeof diagnostic.metadata === "object"
            ? diagnostic.metadata
            : {};

        logger?.[level]?.("ai", event, {
          context: "/api/ai/draft-reply",
          provider: "ollama",
          ...metadata,
        });
      },
    });

    logger?.info?.("ai", "AI reply draft route completed.", {
      context: "/api/ai/draft-reply",
      provider: "ollama",
      replyDraftLength: draft.replyDraft.length,
      aiSource: draft.aiSource,
    });

    sendJson(req, res, 200, draft);
  } catch (error) {
    const statusCode = Number.isInteger(error?.statusCode)
      ? error.statusCode
      : 503;
    const code = error?.code ?? "ai_reply_unavailable";
    const message =
      error instanceof Error
        ? error.message
        : "AI reply drafting is unavailable.";

    logger?.warn?.("ai", "AI reply draft route failed.", {
      code,
      statusCode,
      error: message,
      fallbackReason: code,
      context: "/api/ai/draft-reply",
      details: error?.details,
    });
    sendApiError(req, res, statusCode, {
      code,
      message,
      retryable: error?.retryable ?? statusCode >= 500,
      context: "/api/ai/draft-reply",
      details: error?.details,
    });
  }

  return true;
}

async function handleInboxMessagesRequest(req, res, logger, authProvider, store) {
  const requestUrl = new URL(req.url, "http://localhost");
  const sessionId = getRequestSessionId(req, requestUrl);
  let authorization = req.headers.authorization?.trim();

  if (!authorization?.startsWith("Bearer ")) {
    if (!authProvider) {
      logger?.warn("inbox", "Rejected inbox request without Outlook token.");
      sendJson(req, res, 401, { error: "Missing Outlook authorization token." });
      return;
    }

    try {
      logMicrosoftTokenLookup(
        logger,
        authProvider,
        sessionId,
        "/api/inbox/messages",
        "Looking up Microsoft token for inbox request.",
      );
      const accessToken = await authProvider.getAccessTokenForSession(sessionId, {
        interactive: requestUrl.searchParams.get("interactiveAuth") === "true",
        routePath: "/api/inbox/messages",
      }, logger);
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
        routePath: "/api/inbox/messages",
        ...getMicrosoftSessionLookupLogMetadata(authProvider, sessionId),
        error: error instanceof Error ? error.message : String(error),
        code:
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : undefined,
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

function loadDefaultWorkflowDirectoryRepository(logger) {
  logger?.info?.("database", "Desktop directory repository disabled; using backend API.");
  return null;
}

async function getDirectorySessionState(store, workflowDirectoryRepository, sessionId) {
  const baseSummary = store.getSessionSummary(sessionId);

  if (!workflowDirectoryRepository || !baseSummary.currentUser) {
    return {
      accessChanged: false,
      source: "sharedWorkflowStore",
      summary: baseSummary,
    };
  }

  const currentUser = await workflowDirectoryRepository.resolveCurrentRepProfile(
    baseSummary.currentUser,
  );

  if (!currentUser) {
    return {
      accessChanged: true,
      source: "directory_repository",
      summary: buildSessionSummary(sessionId, null, []),
    };
  }

  const reps = await workflowDirectoryRepository.listVisibleRepProfiles(currentUser);

  return {
    accessChanged: false,
    source: "directory_repository",
    summary: buildSessionSummary(sessionId, currentUser, reps),
  };
}

async function requireDirectorySessionState(
  store,
  workflowDirectoryRepository,
  authProvider,
  sessionId,
) {
  const sessionState = await getDirectorySessionState(
    store,
    workflowDirectoryRepository,
    sessionId,
  );

  if (sessionState.accessChanged) {
    clearDesktopSession(store, authProvider, sessionId, "access_changed");
    throw createHttpError(401, "access_changed", ACCESS_CHANGED_SESSION_MESSAGE);
  }

  if (!sessionState.summary.currentUser) {
    throw new Error("You must sign in before using the shared workflow.");
  }

  return sessionState;
}

function requireSessionCapability(sessionSummary, capability) {
  if (!sessionSummary.currentUser) {
    throw new Error("You must sign in before using the shared workflow.");
  }

  if (!sessionSummary.capabilities.includes(capability)) {
    throw new Error("You are not allowed to perform this action.");
  }

  return sessionSummary.currentUser;
}

async function getDirectoryBootstrap(
  store,
  workflowDirectoryRepository,
  sessionSummary,
) {
  const customers = await workflowDirectoryRepository.listSavedCustomersForUser(
    sessionSummary.currentUser,
  );
  const slaSettings = store.getSlaSettings(sessionSummary.currentUser?.locationId);

  return {
    currentUser: sessionSummary.currentUser,
    capabilities: sessionSummary.capabilities,
    reps: sessionSummary.reps,
    customers,
    slaSettings,
    workflowState: {
      reps: sessionSummary.reps,
      currentRepId: sessionSummary.currentUser?.id || "",
      threadStates: store.listThreadStates(sessionSummary.currentUser),
      threadPresence: store.listThreadPresence(),
      preferences: sessionSummary.currentUser
        ? store.getPreferences(sessionSummary.currentUser.id)
        : undefined,
    },
    directoryDiagnostics: {
      source: "directory_repository",
      customerCount: customers.length,
      csrCount: sessionSummary.reps.filter(
        (rep) => rep.role === "rep" && rep.isActive !== false,
      ).length,
      assignmentCount: customers.reduce(
        (count, customer) =>
          count +
          (customer.assignedCSRs?.filter((assignment) => assignment.isActive).length ?? 0),
        0,
      ),
    },
  };
}

function hasBackendApi(backendApi) {
  return Boolean(backendApi?.requestJson);
}

function getPayloadArray(payload, keys) {
  if (Array.isArray(payload)) {
    return payload;
  }

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) {
      return payload[key];
    }
  }

  return [];
}

function getPayloadObject(payload) {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload
    : {};
}

function getNestedPayloadObject(payload, keys) {
  const source = getPayloadObject(payload);

  for (const key of keys) {
    const value = source[key];

    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
  }

  return {};
}

function hasPayloadProperty(payload, key) {
  return Object.prototype.hasOwnProperty.call(getPayloadObject(payload), key);
}

function hasCurrentUserFieldInPayload(payload) {
  const source = getPayloadObject(payload);
  const sessionPayload = getNestedPayloadObject(source, ["session", "authSession", "auth"]);

  return (
    hasPayloadProperty(source, "currentUser") ||
    hasPayloadProperty(source, "user") ||
    hasPayloadProperty(sessionPayload, "currentUser") ||
    hasPayloadProperty(sessionPayload, "user")
  );
}

function unwrapBackendPayload(payload) {
  const source = getPayloadObject(payload);

  for (const key of ["bootstrap", "workflowBootstrap", "payload", "data"]) {
    const value = source[key];

    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
  }

  return source;
}

function getPayloadKeysForLog(payload) {
  return Object.keys(getPayloadObject(payload)).slice(0, 20);
}

function getFirstPayloadArray(payload, keys, fallback = []) {
  for (const source of [
    payload,
    getNestedPayloadObject(payload, ["directory", "data"]),
    getNestedPayloadObject(payload, ["workflowDirectory", "directoryData"]),
  ]) {
    const values = getPayloadArray(source, keys);

    if (values.length > 0) {
      return values;
    }
  }

  return fallback;
}

function getFirstPayloadArrayOrSingle(payload, arrayKeys, singleKeys, fallback = []) {
  const arrayValue = getFirstPayloadArray(payload, arrayKeys, []);

  if (arrayValue.length > 0) {
    return arrayValue;
  }

  for (const source of [
    payload,
    getNestedPayloadObject(payload, ["directory", "data"]),
    getNestedPayloadObject(payload, ["workflowDirectory", "directoryData"]),
  ]) {
    const sourceObject = getPayloadObject(source);

    for (const key of singleKeys) {
      const value = sourceObject[key];

      if (value && typeof value === "object" && !Array.isArray(value)) {
        return [value];
      }
    }
  }

  return fallback;
}

function normalizeBackendArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function getBackendStringCandidate(value, keys) {
  if (typeof value === "string") {
    return normalizeText(value);
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  for (const key of keys) {
    const candidate = normalizeText(value[key]);

    if (candidate) {
      return candidate;
    }
  }

  return "";
}

function normalizeBackendStringArray(value) {
  return Array.from(
    new Set(
      normalizeBackendArray(value)
        .map((item) =>
          getBackendStringCandidate(item, [
            "id",
            "value",
            "name",
            "email",
            "emailAddress",
            "email_address",
            "address",
            "domain",
            "domainName",
            "domain_name",
            "locationId",
            "location_id",
            "locationName",
            "location_name",
          ]),
        )
        .filter(Boolean),
    ),
  );
}

function normalizeBackendEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeBackendDomain(value) {
  let normalized = normalizeText(value).toLowerCase();

  if (!normalized) {
    return "";
  }

  if (normalized.includes("://")) {
    try {
      normalized = new URL(normalized).hostname.toLowerCase();
    } catch {
      // Keep the raw text and continue with simple cleanup.
    }
  }

  if (normalized.includes("@")) {
    const parts = normalized.split("@");
    normalized = parts[parts.length - 1] || "";
  }

  return normalized
    .replace(/^@+/, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/^\.+|\.+$/g, "");
}

function normalizeBackendDomains(value) {
  return Array.from(
    new Set(
      normalizeBackendArray(value)
        .map((item) => normalizeBackendDomain(item))
        .filter(Boolean),
    ),
  );
}

function normalizeBackendBoolean(value, fallback = true) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  return fallback;
}

function normalizeBackendRole(value) {
  if (value === "admin") {
    return "admin";
  }

  if (value === "supervisor" || value === "team_lead" || value === "manager") {
    return "supervisor";
  }

  return "rep";
}

function deriveBackendInitials(name, email) {
  const words = normalizeText(name)
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
  }

  return (words[0]?.slice(0, 2) || normalizeText(email).slice(0, 2) || "AD").toUpperCase();
}

function getFirstTextValue(source, keys) {
  for (const key of keys) {
    const value = normalizeText(source?.[key]);

    if (value) {
      return value;
    }
  }

  return "";
}

function normalizeBackendRepProfile(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const id = getFirstTextValue(value, [
    "id",
    "userId",
    "user_id",
    "repId",
    "rep_id",
    "employeeId",
    "employee_id",
  ]);
  const email = normalizeBackendEmail(
    getFirstTextValue(value, [
      "email",
      "emailAddress",
      "email_address",
      "mail",
      "userPrincipalName",
      "user_principal_name",
      "employeeEmail",
      "employee_email",
      "userEmail",
      "user_email",
      "repEmail",
      "rep_email",
      "csrEmail",
      "csr_email",
    ]),
  );
  const displayName =
    getFirstTextValue(value, [
      "displayName",
      "display_name",
      "name",
      "fullName",
      "full_name",
    ]) ||
    email ||
    id;
  const name =
    getFirstTextValue(value, [
      "name",
      "displayName",
      "display_name",
      "fullName",
      "full_name",
    ]) || displayName;

  if (!id || !displayName || !email) {
    return null;
  }

  const locationId = getFirstTextValue(value, [
    "locationId",
    "location_id",
    "locationName",
    "location_name",
    "department",
    "location",
  ]);
  const locationName = getFirstTextValue(value, [
    "locationName",
    "location_name",
    "department",
    "location",
  ]);

  return {
    ...value,
    id,
    name,
    displayName,
    initials: normalizeText(value.initials) || deriveBackendInitials(displayName, email),
    email,
    role: normalizeBackendRole(value.role),
    locationId: locationId || undefined,
    locationName: locationName || undefined,
    allowedLocations: normalizeBackendStringArray(
      value.allowedLocations ??
        value.allowed_locations ??
        value.locationIds ??
        value.location_ids ??
        value.locations,
    ),
    isActive: normalizeBackendBoolean(value.isActive ?? value.is_active ?? value.active, true),
  };
}

function normalizeBackendRepProfiles(value, fallback = []) {
  const reps = normalizeBackendArray(value)
    .map((rep) => normalizeBackendRepProfile(rep))
    .filter(Boolean);

  return reps.length > 0 ? reps : fallback;
}

function normalizeBackendCapabilities(value, currentUser, fallback = []) {
  const payloadCapabilities = Array.isArray(value)
    ? value.filter((capability) => typeof capability === "string")
    : [];
  const fallbackCapabilities = Array.isArray(fallback)
    ? fallback.filter((capability) => typeof capability === "string")
    : [];
  const roleCapabilities = currentUser?.role
    ? getCapabilitiesForRole(currentUser.role)
    : [];

  return Array.from(
    new Set([...payloadCapabilities, ...fallbackCapabilities, ...roleCapabilities]),
  );
}

function normalizeBackendAssignedCsr(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const repId = getFirstTextValue(value, [
    "repId",
    "rep_id",
    "employeeId",
    "employee_id",
    "csrId",
    "csr_id",
    "assignedCsrId",
    "assignedCSRId",
    "assigned_csr_id",
  ]);

  if (!repId) {
    return null;
  }

  const assignmentRole =
    value.assignmentRole === "secondary" ||
    value.assignment_role === "secondary" ||
    value.assignmentRole === "backup" ||
    value.assignment_role === "backup"
      ? value.assignmentRole ?? value.assignment_role
      : "primary";
  const locationName = getFirstTextValue(value, [
    "locationName",
    "location_name",
    "location",
    "locationId",
    "location_id",
  ]);
  const repName = getFirstTextValue(value, [
    "repName",
    "rep_name",
    "employeeName",
    "employee_name",
    "csrName",
    "csr_name",
    "name",
    "displayName",
    "display_name",
  ]);
  const repEmail = normalizeBackendEmail(
    getFirstTextValue(value, [
      "repEmail",
      "rep_email",
      "employeeEmail",
      "employee_email",
      "csrEmail",
      "csr_email",
      "email",
      "emailAddress",
      "email_address",
    ]),
  );

  return {
    repId,
    repName: repName || undefined,
    repEmail: repEmail || undefined,
    assignmentRole,
    locationName: locationName || undefined,
    isActive: normalizeBackendBoolean(value.isActive ?? value.is_active ?? value.active, true),
  };
}

function normalizeBackendCustomerAssignments(value, ownerRepId, ownerRepIds) {
  const assignments = normalizeBackendArray(value)
    .map((assignment) => normalizeBackendAssignedCsr(assignment))
    .filter(Boolean);
  const activeIds = new Set(
    assignments
      .filter((assignment) => assignment.isActive)
      .map((assignment) => assignment.repId),
  );

  for (const repId of Array.from(new Set([ownerRepId, ...ownerRepIds].filter(Boolean)))) {
    if (!activeIds.has(repId)) {
      assignments.push({
        repId,
        assignmentRole: repId === ownerRepId || assignments.length === 0 ? "primary" : "secondary",
        isActive: true,
      });
      activeIds.add(repId);
    }
  }

  const seen = new Set();
  return assignments.filter((assignment) => {
    if (seen.has(assignment.repId)) {
      return false;
    }

    seen.add(assignment.repId);
    return true;
  });
}

function getPrimaryBackendAssignmentId(assignments, ownerRepId, ownerRepIds) {
  return (
    assignments.find(
      (assignment) => assignment.isActive && assignment.assignmentRole === "primary",
    )?.repId ||
    ownerRepId ||
    ownerRepIds[0] ||
    ""
  );
}

function createBackendCustomerId(customer, emails, domains) {
  const rawId = getBackendCustomerId(customer);

  if (rawId) {
    return rawId;
  }

  const stableKey =
    getFirstTextValue(customer, ["name", "customerName", "company", "displayName"]) ||
    emails[0] ||
    domains[0] ||
    crypto.randomUUID();

  return `customer-${crypto.createHash("sha1").update(stableKey).digest("hex").slice(0, 12)}`;
}

function getBackendCustomerId(value) {
  return getFirstTextValue(value, [
    "id",
    "customerId",
    "customer_id",
    "companyId",
    "company_id",
  ]);
}

function normalizeBackendCustomer(value, linkedAssignments = []) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const email = normalizeBackendEmail(
    getFirstTextValue(value, ["email", "email_address", "emailAddress"]),
  );
  const emails = Array.from(
    new Set([
      email,
      ...normalizeBackendStringArray(
        value.emails ?? value.emailAddresses ?? value.email_addresses,
      ).map((item) => normalizeBackendEmail(item)),
    ].filter(Boolean)),
  );
  const domain = normalizeBackendDomain(
    getFirstTextValue(value, ["domain", "domain_name", "domainName"]),
  );
  const domains = Array.from(
    new Set([
      domain,
      ...normalizeBackendDomains(
        value.domains ?? value.companyDomains ?? value.company_domains,
      ),
    ].filter(Boolean)),
  );
  const assignedCsrId =
    getFirstTextValue(value, [
      "assignedCsrId",
      "assignedCSRId",
      "assigned_csr_id",
      "csrId",
      "csr_id",
      "repId",
      "rep_id",
      "ownerRepId",
      "owner_rep_id",
    ]) || undefined;
  const ownerRepId =
    normalizeText(value.ownerRepId) ||
    normalizeText(value.owner_rep_id) ||
    assignedCsrId;
  const ownerRepIds = Array.from(
    new Set([
      ...normalizeBackendStringArray(value.ownerRepIds),
      ...normalizeBackendStringArray(value.owner_rep_ids),
      assignedCsrId,
    ].filter(Boolean)),
  );
  const assignedCSRs = normalizeBackendCustomerAssignments(
    [
      ...normalizeBackendArray(
        value.assignedCSRs ??
          value.assignedCsrs ??
          value.assigned_csrs ??
          value.customerAssignments ??
          value.assignments,
      ),
      ...linkedAssignments,
    ],
    ownerRepId,
    ownerRepIds,
  );
  const allOwnerRepIds = Array.from(
    new Set([
      ...(ownerRepId ? [ownerRepId] : []),
      ...ownerRepIds,
      ...assignedCSRs
        .filter((assignment) => assignment.isActive)
        .map((assignment) => assignment.repId),
    ]),
  );
  const primaryOwnerRepId = getPrimaryBackendAssignmentId(
    assignedCSRs,
    ownerRepId,
    allOwnerRepIds,
  );
  const name =
    getFirstTextValue(value, [
      "name",
      "customerName",
      "customer_name",
      "company",
      "displayName",
      "display_name",
    ]) ||
    emails[0] ||
    domains[0] ||
    "Unnamed customer";
  const locations = Array.from(
    new Set(
      [
        getFirstTextValue(value, ["locationId", "location_id"]),
        ...normalizeBackendStringArray(value.locationIds ?? value.location_ids),
        ...normalizeBackendStringArray(value.locations),
        ...assignedCSRs.map((assignment) => assignment.locationName).filter(Boolean),
      ].filter(Boolean),
    ),
  );
  const locationId =
    locations[0] ||
    getFirstTextValue(value, ["locationId", "location_id"]) ||
    getFirstTextValue(value, ["locationName", "location_name", "location"]);
  const locationName = getFirstTextValue(value, [
    "locationName",
    "location_name",
    "location",
  ]);

  return {
    ...value,
    id: createBackendCustomerId(value, emails, domains),
    name,
    email: emails[0] || "",
    emails,
    domain: domains[0] || "",
    domains,
    ownerRepId: primaryOwnerRepId || undefined,
    ownerRepIds: allOwnerRepIds,
    assignedCsrId: primaryOwnerRepId || "",
    assignedCSRs,
    locationId: locationId || undefined,
    locationName: locationName || undefined,
    locations,
    isActive: normalizeBackendBoolean(value.isActive ?? value.is_active ?? value.active, true),
  };
}

function normalizeBackendCustomerAssignmentRecord(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const customerId = getBackendCustomerId(value);
  const assignment = normalizeBackendAssignedCsr(value);

  if (!customerId || !assignment) {
    return null;
  }

  return {
    customerId,
    ...assignment,
  };
}

function normalizeBackendCustomerAssignmentRecords(value) {
  return normalizeBackendArray(value)
    .map((assignment) => normalizeBackendCustomerAssignmentRecord(assignment))
    .filter(Boolean);
}

function groupBackendAssignmentsByCustomerId(assignments) {
  const assignmentsByCustomerId = new Map();

  for (const assignment of normalizeBackendCustomerAssignmentRecords(assignments)) {
    assignmentsByCustomerId.set(assignment.customerId, [
      ...(assignmentsByCustomerId.get(assignment.customerId) ?? []),
      assignment,
    ]);
  }

  return assignmentsByCustomerId;
}

function normalizeBackendCustomers(value, assignments = []) {
  const assignmentsByCustomerId = groupBackendAssignmentsByCustomerId(assignments);

  return normalizeBackendArray(value)
    .map((customer) =>
      normalizeBackendCustomer(
        customer,
        assignmentsByCustomerId.get(getBackendCustomerId(customer)) ?? [],
      ),
    )
    .filter(Boolean);
}

function normalizeUsersPayload(payload) {
  return {
    users: normalizeBackendRepProfiles(
      getFirstPayloadArrayOrSingle(
        payload,
        ["users", "reps", "employees", "data", "items"],
        ["user", "rep", "employee"],
      ),
    ),
  };
}

function normalizeCustomersPayload(payload) {
  return {
    customers: normalizeBackendCustomers(
      getFirstPayloadArrayOrSingle(
        payload,
        [
          "customers",
          "accounts",
          "companies",
          "data",
          "items",
        ],
        ["customer", "account", "company"],
      ),
      getFirstPayloadArray(payload, [
        "assignments",
        "customerAssignments",
        "customer_csr_assignments",
      ]),
    ),
  };
}

function normalizeCustomerAssignmentsPayload(payload) {
  return {
    assignments: normalizeBackendCustomerAssignmentRecords(
      getFirstPayloadArray(payload, [
        "assignments",
        "customerAssignments",
        "customerCsrAssignments",
        "customer_csr_assignments",
        "data",
        "items",
      ]),
    ),
  };
}

function getSessionIdFromPayload(payload, fallbackSessionId) {
  const source = unwrapBackendPayload(payload);
  const sessionPayload = getNestedPayloadObject(source, ["session", "authSession", "auth"]);

  return String(
    source.sessionId ||
      sessionPayload.sessionId ||
      fallbackSessionId ||
      "",
  ).trim();
}

function normalizeBackendSessionPayload(payload, fallbackSessionId) {
  const source = unwrapBackendPayload(payload);
  const sessionPayload = getNestedPayloadObject(source, ["session", "authSession", "auth"]);
  const currentUser =
    source.currentUser ??
    sessionPayload.currentUser ??
    source.user ??
    sessionPayload.user ??
    null;
  const capabilities = Array.isArray(source.capabilities)
    ? source.capabilities
    : Array.isArray(sessionPayload.capabilities)
      ? sessionPayload.capabilities
      : [];
  const reps = Array.isArray(source.reps)
    ? source.reps
    : Array.isArray(source.users)
      ? source.users
      : Array.isArray(source.employees)
        ? source.employees
        : Array.isArray(source.workflowState?.reps)
          ? source.workflowState.reps
          : Array.isArray(sessionPayload.reps)
            ? sessionPayload.reps
            : Array.isArray(sessionPayload.users)
              ? sessionPayload.users
              : [];
  const normalizedCurrentUser =
    normalizeBackendRepProfile(currentUser) ?? currentUser;

  return {
    ...source,
    sessionId: getSessionIdFromPayload(payload, fallbackSessionId),
    currentUser: normalizedCurrentUser,
    capabilities: normalizeBackendCapabilities(capabilities, normalizedCurrentUser),
    reps: normalizeBackendRepProfiles(reps),
  };
}

function syncStoreSessionFromBackendPayload(
  store,
  payload,
  fallbackSessionId,
  logger,
  options = {},
) {
  const session = normalizeBackendSessionPayload(payload, fallbackSessionId);
  const context = options.context ?? "backend_session_sync";

  if (!session.sessionId) {
    logger?.warn?.("auth", "Backend session sync skipped without a session id.", {
      reason: "missingSessionId",
      context,
    });
    return session;
  }

  if (!session.currentUser) {
    logger?.warn?.("auth", "Backend session sync found no current user.", {
      reason: "missingCurrentUser",
      context,
      cleanupRequested: options.cleanupOnMissingCurrentUser !== false,
      sessionId: session.sessionId,
      payloadKeys: getPayloadKeysForLog(payload),
    });

    if (options.cleanupOnMissingCurrentUser !== false) {
      store.logout?.(session.sessionId, {
        reason: "missingCurrentUser",
        source: context,
      });
    }

    return session;
  }

  try {
    const startLocalSession =
      store.startRuntimeSession ?? store.startSessionForRepProfile;
    startLocalSession?.call(store, session.sessionId, session.currentUser);
  } catch (error) {
    logger?.warn?.("auth", "Local workflow session sync failed.", {
      sessionId: session.sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return session;
}

function normalizeBackendBootstrapPayload(payload, localBootstrap, fallbackSessionId) {
  const source = unwrapBackendPayload(payload);
  const session = normalizeBackendSessionPayload(source, fallbackSessionId);
  const currentUser =
    session.currentUser ??
    (hasCurrentUserFieldInPayload(source) ? null : localBootstrap.currentUser ?? null);
  const capabilities = normalizeBackendCapabilities(
    session.capabilities,
    currentUser,
    localBootstrap.capabilities,
  );
  const reps = getFirstPayloadArray(
    source,
    ["reps", "users", "employees", "data", "items"],
    Array.isArray(source.workflowState?.reps)
      ? source.workflowState.reps
      : localBootstrap.reps,
  );
  const normalizedReps = normalizeBackendRepProfiles(reps, localBootstrap.reps);
  const customerAssignments = getFirstPayloadArray(
    source,
    [
      "customerAssignments",
      "customerCsrAssignments",
      "customer_csr_assignments",
      "assignments",
      "data",
      "items",
    ],
    [],
  );
  const normalizedCustomerAssignments =
    normalizeBackendCustomerAssignmentRecords(customerAssignments);
  const customers = normalizeBackendCustomers(
    getFirstPayloadArray(source, ["customers", "accounts", "companies", "data", "items"], []),
    normalizedCustomerAssignments,
  );
  const workflowState =
    source.workflowState && typeof source.workflowState === "object"
      ? source.workflowState
      : {};

  return {
    ...source,
    sessionId: session.sessionId || fallbackSessionId,
    currentUser,
    capabilities,
    reps: normalizedReps,
    customers,
    customerAssignments:
      normalizedCustomerAssignments.length > 0
        ? normalizedCustomerAssignments
        : buildCustomerAssignmentsFromCustomers(customers),
    locations: normalizeBackendStringArray(
      source.locations ?? source.locationIds ?? source.location_ids,
    ),
    slaSettings: source.slaSettings ?? localBootstrap.slaSettings,
    workflowState: {
      ...workflowState,
      reps: normalizeBackendRepProfiles(workflowState.reps, normalizedReps),
      currentRepId:
        workflowState.currentRepId ||
        currentUser?.id ||
        localBootstrap.workflowState.currentRepId ||
        "",
    },
  };
}

function getBackendBootstrapShapeDiagnostics(rawPayload, normalizedPayload) {
  const rawSource = getPayloadObject(rawPayload);
  const unwrappedSource = unwrapBackendPayload(rawPayload);

  return {
    expectedTopLevelKeys: [
      "currentUser",
      "capabilities",
      "reps",
      "customers",
      "slaSettings",
      "workflowState",
    ],
    rawTopLevelKeys: getPayloadKeysForLog(rawSource),
    unwrappedKeys: getPayloadKeysForLog(unwrappedSource),
    hasTopLevelCurrentUser: Boolean(rawSource.currentUser),
    hasUnwrappedCurrentUser: Boolean(unwrappedSource.currentUser),
    hasSessionCurrentUser: Boolean(
      getNestedPayloadObject(unwrappedSource, ["session", "authSession", "auth"])
        .currentUser,
    ),
    hasWorkflowState: Boolean(
      normalizedPayload.workflowState &&
        typeof normalizedPayload.workflowState === "object",
    ),
    capabilitiesCount: Array.isArray(normalizedPayload.capabilities)
      ? normalizedPayload.capabilities.length
      : 0,
    repsCount: Array.isArray(normalizedPayload.reps)
      ? normalizedPayload.reps.length
      : 0,
    customersCount: Array.isArray(normalizedPayload.customers)
      ? normalizedPayload.customers.length
      : 0,
    assignmentsCount: Array.isArray(normalizedPayload.customerAssignments)
      ? normalizedPayload.customerAssignments.length
      : 0,
    capabilities: Array.isArray(normalizedPayload.capabilities)
      ? normalizedPayload.capabilities
      : [],
  };
}

function getBootstrapValidationFailure(bootstrap) {
  if (!bootstrap || typeof bootstrap !== "object") {
    return "invalidBootstrapShape";
  }

  if (!bootstrap.currentUser) {
    return "missingCurrentUser";
  }

  if (!Array.isArray(bootstrap.capabilities)) {
    return "missingCapabilities";
  }

  if (
    !bootstrap.workflowState ||
    typeof bootstrap.workflowState !== "object" ||
    !Array.isArray(bootstrap.workflowState.reps) ||
    typeof bootstrap.workflowState.currentRepId !== "string" ||
    !bootstrap.workflowState.threadStates ||
    typeof bootstrap.workflowState.threadStates !== "object" ||
    !bootstrap.workflowState.preferences ||
    typeof bootstrap.workflowState.preferences !== "object"
  ) {
    return "invalidWorkflowState";
  }

  if (
    !Array.isArray(bootstrap.reps) ||
    !Array.isArray(bootstrap.customers) ||
    !bootstrap.slaSettings ||
    typeof bootstrap.slaSettings !== "object"
  ) {
    return "invalidBootstrapShape";
  }

  return null;
}

function buildCustomerAssignmentsFromCustomers(customers) {
  return customers.flatMap((customer) => {
    const assignments = Array.isArray(customer.assignedCSRs)
      ? customer.assignedCSRs
      : [];

    return assignments.map((assignment) => ({
      customerId: customer.id,
      repId: assignment.repId,
      repName: assignment.repName,
      repEmail: assignment.repEmail,
      assignmentRole: assignment.assignmentRole,
      locationName: assignment.locationName,
      isActive: assignment.isActive !== false,
    }));
  });
}

function buildBackendDirectoryDiagnostics(payload) {
  const customers = normalizeBackendCustomers(
    payload.customers,
    payload.customerAssignments,
  );
  const reps = normalizeBackendRepProfiles(
    Array.isArray(payload.reps)
      ? payload.reps
      : Array.isArray(payload.workflowState?.reps)
        ? payload.workflowState.reps
        : [],
  );

  return {
    source: "backend_api",
    customerCount: customers.length,
    csrCount: reps.filter((rep) => rep.role === "rep" && rep.isActive !== false).length,
    assignmentCount: customers.reduce(
      (count, customer) =>
        count +
        (customer.assignedCSRs?.filter((assignment) => assignment.isActive !== false).length ??
          0),
      0,
    ),
  };
}

function mergeBackendBootstrapWithLocalWorkflowState(store, backendBootstrap, sessionId) {
  const localBootstrap = store.getBootstrap(sessionId);
  const currentUser =
    normalizeBackendRepProfile(backendBootstrap.currentUser) ??
    backendBootstrap.currentUser ??
    localBootstrap.currentUser;
  const reps = normalizeBackendRepProfiles(
    Array.isArray(backendBootstrap.reps)
      ? backendBootstrap.reps
      : Array.isArray(backendBootstrap.workflowState?.reps)
        ? backendBootstrap.workflowState.reps
        : localBootstrap.reps,
    localBootstrap.reps,
  );
  const customerAssignments = normalizeBackendCustomerAssignmentRecords(
    Array.isArray(backendBootstrap.customerAssignments)
      ? backendBootstrap.customerAssignments
      : [],
  );
  const customers = normalizeBackendCustomers(
    Array.isArray(backendBootstrap.customers) ? backendBootstrap.customers : [],
    customerAssignments,
  );
  const workflowState = {
    ...(backendBootstrap.workflowState ?? {}),
    reps,
    currentRepId:
      backendBootstrap.workflowState?.currentRepId ||
      currentUser?.id ||
      localBootstrap.workflowState.currentRepId ||
      "",
    threadStates: localBootstrap.workflowState.threadStates,
    threadPresence: localBootstrap.workflowState.threadPresence,
    preferences:
      localBootstrap.workflowState.preferences ??
      backendBootstrap.workflowState?.preferences,
  };

  return {
    ...backendBootstrap,
    currentUser,
    capabilities: normalizeBackendCapabilities(
      backendBootstrap.capabilities,
      currentUser,
      localBootstrap.capabilities,
    ),
    reps,
    customers,
    customerAssignments:
      customerAssignments.length > 0
        ? customerAssignments
        : buildCustomerAssignmentsFromCustomers(customers),
    slaSettings: backendBootstrap.slaSettings ?? localBootstrap.slaSettings,
    workflowState,
    directoryDiagnostics:
      backendBootstrap.directoryDiagnostics ??
      buildBackendDirectoryDiagnostics({
        ...backendBootstrap,
        reps,
      }),
  };
}

async function requestOptionalBackendDirectoryPayload(
  backendApi,
  pathname,
  sessionId,
  logger,
) {
  try {
    return await backendApi.requestJson(pathname, {
      sessionId,
    });
  } catch (error) {
    logger?.warn?.("workflow-bootstrap", "Optional backend directory payload unavailable.", {
      path: pathname,
      code: error?.code,
      statusCode: error?.statusCode,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function hydrateBackendBootstrapDirectoryData(
  backendApi,
  backendBootstrap,
  sessionId,
  logger,
) {
  const currentUser =
    normalizeBackendRepProfile(backendBootstrap.currentUser) ??
    backendBootstrap.currentUser;
  const capabilities = normalizeBackendCapabilities(
    backendBootstrap.capabilities,
    currentUser,
  );
  const shouldLoadAdminUsers =
    currentUser?.role === "admin" || capabilities.includes("manage_users");
  const shouldLoadManagedCustomers =
    currentUser?.role === "admin" ||
    capabilities.includes("manage_customer_ownership");
  const [usersPayload, customersPayload, assignmentsPayload] = await Promise.all([
    shouldLoadAdminUsers
      ? requestOptionalBackendDirectoryPayload(
          backendApi,
          "/api/users",
          sessionId,
          logger,
        )
      : Promise.resolve(null),
    shouldLoadManagedCustomers
      ? requestOptionalBackendDirectoryPayload(
          backendApi,
          "/api/customers",
          sessionId,
          logger,
        )
      : Promise.resolve(null),
    shouldLoadManagedCustomers
      ? requestOptionalBackendDirectoryPayload(
          backendApi,
          "/api/customer-assignments",
          sessionId,
          logger,
        )
      : Promise.resolve(null),
  ]);
  const normalizedUsers = usersPayload
    ? normalizeUsersPayload(usersPayload).users
    : [];
  const normalizedAssignments = assignmentsPayload
    ? normalizeCustomerAssignmentsPayload(assignmentsPayload).assignments
    : [];
  const normalizedCustomers = customersPayload
    ? normalizeBackendCustomers(
        getFirstPayloadArray(customersPayload, [
          "customers",
          "accounts",
          "companies",
          "data",
          "items",
        ]),
        normalizedAssignments,
      )
    : [];

  return {
    ...backendBootstrap,
    currentUser,
    capabilities,
    reps:
      normalizedUsers.length > 0
        ? normalizedUsers
        : backendBootstrap.reps,
    customers:
      customersPayload
        ? normalizedCustomers
        : backendBootstrap.customers,
    customerAssignments:
      assignmentsPayload
        ? normalizedAssignments
        : backendBootstrap.customerAssignments,
  };
}

async function sendBackendJson(req, res, backendApi, pathname, options = {}) {
  const payload = await backendApi.requestJson(pathname, {
    method: options.method ?? req.method,
    sessionId: options.sessionId,
    body: options.body,
  });

  sendJson(req, res, 200, options.normalize ? options.normalize(payload) : payload);
  return true;
}

function getFirstObjectValue(payload, keys) {
  const source = getPayloadObject(payload);

  for (const key of keys) {
    const value = source[key];

    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
  }

  return source;
}

function getMutationAffectedRows(payload) {
  const source = getPayloadObject(payload);
  const mutation = getPayloadObject(source.mutation);
  const result = getPayloadObject(source.result);

  for (const value of [
    source.affectedRows,
    source.affected_rows,
    mutation.affectedRows,
    mutation.affected_rows,
    result.affectedRows,
    result.affected_rows,
  ]) {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function getMutationReturnedId(payload, entityKeys) {
  const source = getPayloadObject(payload);
  const entity = getFirstObjectValue(payload, entityKeys);

  return (
    getFirstTextValue(source, [
      "id",
      "insertId",
      "insert_id",
      "insertedId",
      "inserted_id",
      "returnedId",
      "returned_id",
    ]) ||
    getFirstTextValue(getPayloadObject(source.mutation), [
      "id",
      "insertId",
      "insert_id",
      "insertedId",
      "inserted_id",
      "returnedId",
      "returned_id",
    ]) ||
    getFirstTextValue(getPayloadObject(source.result), [
      "id",
      "insertId",
      "insert_id",
      "insertedId",
      "inserted_id",
      "returnedId",
      "returned_id",
    ]) ||
    getFirstTextValue(entity, ["id", "userId", "user_id", "customerId", "customer_id"])
  );
}

function getPayloadBoolean(source, keys) {
  for (const key of keys) {
    const value = source?.[key];

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return value !== 0;
    }

    if (typeof value === "string" && value.trim()) {
      const normalized = value.trim().toLowerCase();

      if (["true", "1", "yes"].includes(normalized)) {
        return true;
      }

      if (["false", "0", "no"].includes(normalized)) {
        return false;
      }
    }
  }

  return undefined;
}

function getPayloadCount(source, singularKey, pluralKey) {
  const values = normalizeBackendStringArray(source?.[pluralKey]);
  const singularValue = normalizeText(source?.[singularKey]);

  return values.length + (singularValue && !values.includes(singularValue) ? 1 : 0);
}

function compactLogMetadata(metadata) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => {
      if (value === undefined || value === null) {
        return false;
      }

      if (typeof value === "string") {
        return value.length > 0;
      }

      if (value && typeof value === "object" && !Array.isArray(value)) {
        return Object.keys(value).length > 0;
      }

      return true;
    }),
  );
}

function getSettingsMutationPayloadSummary(payload) {
  const payloadObject = getPayloadObject(payload);
  const source =
    payloadObject.customer && typeof payloadObject.customer === "object"
      ? getPayloadObject(payloadObject.customer)
      : payloadObject;
  const assignments = normalizeBackendArray(
    source.assignments ??
      source.customerAssignments ??
      source.customer_assignments ??
      source.customer_csr_assignments ??
      source.assignedCSRs ??
      source.assignedCsrs ??
      source.assigned_csrs,
  );
  const firstAssignment = getPayloadObject(assignments[0]);
  const emailCount = getPayloadCount(source, "email", "emails");
  const domainCount = getPayloadCount(source, "domain", "domains");

  return compactLogMetadata({
    userId: getFirstTextValue(source, ["userId", "user_id", "id"]),
    customerId: getFirstTextValue(source, [
      "customerId",
      "customer_id",
      "id",
    ]),
    assignmentId: getFirstTextValue(source, [
      "assignmentId",
      "assignment_id",
      "customerAssignmentId",
      "customer_assignment_id",
      "id",
    ]),
    repId:
      getFirstTextValue(source, [
        "repId",
        "rep_id",
        "employeeId",
        "employee_id",
        "csrId",
        "csr_id",
      ]) ||
      getFirstTextValue(firstAssignment, [
        "repId",
        "rep_id",
        "employeeId",
        "employee_id",
        "csrId",
        "csr_id",
      ]),
    hasDisplayName: Boolean(
      getFirstTextValue(source, [
        "displayName",
        "display_name",
        "name",
        "customerName",
        "customer_name",
      ]),
    ),
    hasEmail: emailCount > 0,
    emailCount,
    domainCount,
    role: getFirstTextValue(source, ["role", "employeeRole", "employee_role"]),
    locationId: getFirstTextValue(source, [
      "locationId",
      "location_id",
      "locationName",
      "location_name",
    ]),
    assignmentCount: assignments.length,
    isActive: getPayloadBoolean(source, ["isActive", "is_active", "active"]),
  });
}

function getSettingsMutationCompletionMetadata(payload, entityKeys, fallbackId) {
  const returnedId = getMutationReturnedId(payload, entityKeys ?? []) || fallbackId;

  return compactLogMetadata({
    affectedRows: getMutationAffectedRows(payload),
    insertedId: returnedId || undefined,
    returnedId: returnedId || undefined,
  });
}

function logSettingsMutationStarted(logger, metadata) {
  logger?.info?.(
    "settings-mutation",
    "settingsMutationStarted",
    compactLogMetadata({
      route: metadata.route,
      backendRoute: metadata.backendRoute,
      mariaDbOperation: metadata.mariaDbOperation,
      payloadSummary: getSettingsMutationPayloadSummary(metadata.payload),
    }),
  );
}

function logSettingsMutationCompleted(logger, metadata) {
  logger?.info?.(
    "settings-mutation",
    "settingsMutationCompleted",
    compactLogMetadata({
      route: metadata.route,
      backendRoute: metadata.backendRoute,
      mariaDbOperation: metadata.mariaDbOperation,
      ...getSettingsMutationCompletionMetadata(
        metadata.payload,
        metadata.entityKeys,
        metadata.fallbackId,
      ),
    }),
  );
}

function isBackendRouteMissingError(error) {
  const statusCode = Number(error?.statusCode);
  const code = String(error?.code || "").toLowerCase();
  const message = error instanceof Error ? error.message : String(error || "");

  return (
    statusCode === 404 ||
    code === "http_404" ||
    (code === "not_found" && message.toLowerCase().includes("not found"))
  );
}

function isCustomerDeactivationBody(body) {
  return (
    body?.isActive === false ||
    body?.is_active === false ||
    body?.active === false
  );
}

function isUserDeactivationBody(body) {
  return isCustomerDeactivationBody(body);
}

function getStaticLegacyBackendMutationRoute(input) {
  const backendUserId = matchRestResourcePath(input.backendPath, "users");
  const backendCustomerId = matchRestResourcePath(input.backendPath, "customers");

  if (input.method === "POST" && input.backendPath === "/api/users") {
    return {
      backendPath: "/api/admin/users/create",
      method: "POST",
      body: input.body,
    };
  }

  if (input.method === "PATCH" && backendUserId) {
    if (isUserDeactivationBody(input.body)) {
      return {
        backendPath: "/api/admin/users/deactivate",
        method: "POST",
        body: {
          ...input.body,
          userId: input.body?.userId ?? backendUserId,
        },
      };
    }

    return {
      backendPath: "/api/admin/users/update",
      method: "POST",
      body: {
        ...input.body,
        userId: input.body?.userId ?? backendUserId,
      },
    };
  }

  if (input.method === "POST" && input.backendPath === "/api/customers") {
    return {
      backendPath: "/api/workflow/customers/upsert",
      method: "POST",
      body: {
        customer: getSavedCustomerDraftFromRequestBody(input.body),
      },
    };
  }

  if (input.method === "PATCH" && backendCustomerId) {
    if (isCustomerDeactivationBody(input.body)) {
      return {
        backendPath: "/api/workflow/customers/delete",
        method: "POST",
        body: {
          customerId: backendCustomerId,
        },
      };
    }

    return {
      backendPath: "/api/workflow/customers/upsert",
      method: "POST",
      body: {
        customer: getSavedCustomerDraftFromRequestBody(input.body, backendCustomerId),
      },
    };
  }

  return null;
}

async function getCustomerAssignmentLegacyBackendMutationRoute(
  backendApi,
  input,
) {
  const backendAssignmentId = matchRestResourcePath(
    input.backendPath,
    "customer-assignments",
  );

  if (
    !(
      (input.method === "POST" && input.backendPath === "/api/customer-assignments") ||
      (input.method === "PATCH" && backendAssignmentId)
    )
  ) {
    return null;
  }

  const customerId = getCustomerAssignmentCustomerId(input.body, backendAssignmentId);

  if (!customerId) {
    return null;
  }

  const customersPayload = await backendApi.requestJson("/api/customers", {
    sessionId: input.sessionId,
  });
  const existingCustomer = normalizeCustomersPayload(customersPayload).customers.find(
    (customer) => customer.id === customerId,
  );

  if (!existingCustomer) {
    return null;
  }

  return {
    backendPath: "/api/workflow/customers/upsert",
    method: "POST",
    body: {
      customer: {
        ...existingCustomer,
        assignedCSRs: getCustomerAssignmentDraft(
          input.body,
          backendAssignmentId,
          existingCustomer,
        ),
      },
    },
  };
}

async function getLegacyBackendMutationRoute(backendApi, input) {
  return (
    getStaticLegacyBackendMutationRoute(input) ??
    (await getCustomerAssignmentLegacyBackendMutationRoute(backendApi, input))
  );
}

async function requestBackendMutationWithFallback(backendApi, logger, input) {
  try {
    return {
      payload: await backendApi.requestJson(input.backendPath, {
        method: input.method,
        sessionId: input.sessionId,
        body: input.body,
      }),
      backendPath: input.backendPath,
      method: input.method,
      fallbackUsed: false,
    };
  } catch (error) {
    if (!isBackendRouteMissingError(error)) {
      throw error;
    }

    let fallback = null;

    try {
      fallback = await getLegacyBackendMutationRoute(backendApi, input);
    } catch (fallbackError) {
      logger?.warn?.("settings-mutation", "Backend mutation fallback route could not be resolved.", {
        route: `${input.method} ${input.backendPath}`,
        statusCode: error?.statusCode,
        fallbackError:
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      });
      throw error;
    }

    if (!fallback) {
      throw error;
    }

    logger?.warn?.("settings-mutation", "Backend mutation REST route missing; retrying legacy route.", {
      route: `${input.method} ${input.backendPath}`,
      backendRoute: `${fallback.method} ${fallback.backendPath}`,
      statusCode: error?.statusCode,
      message: error instanceof Error ? error.message : String(error),
    });

    return {
      payload: await backendApi.requestJson(fallback.backendPath, {
        method: fallback.method,
        sessionId: input.sessionId,
        body: fallback.body,
      }),
      backendPath: fallback.backendPath,
      method: fallback.method,
      fallbackUsed: true,
    };
  }
}

async function requestBackendMutationJson(
  req,
  res,
  backendApi,
  logger,
  input,
) {
  logSettingsMutationStarted(logger, {
    route: `${req.method} ${input.routePath}`,
    backendRoute: `${input.method} ${input.backendPath}`,
    payload: input.body,
  });
  logger?.info?.("settings-mutation", "Backend mutation route called.", {
    route: `${req.method} ${input.routePath}`,
    backendRoute: `${input.method} ${input.backendPath}`,
  });

  const mutationResponse = await requestBackendMutationWithFallback(backendApi, logger, input);
  const payload = mutationResponse.payload;
  const completedBackendRoute = `${mutationResponse.method} ${mutationResponse.backendPath}`;
  const normalizedPayload = input.normalize ? input.normalize(payload) : payload;
  const returnedId = getMutationReturnedId(payload, input.entityKeys ?? []);
  const affectedRows = getMutationAffectedRows(payload);
  const refreshedSettingsData = input.refreshSettingsData
    ? await refreshBackendSettingsDataAfterMutation(backendApi, logger, {
        route: `${req.method} ${input.routePath}`,
        backendRoute: completedBackendRoute,
        sessionId: input.sessionId,
        ...input.refreshSettingsData,
      })
    : {};

  logSettingsMutationCompleted(logger, {
    route: `${req.method} ${input.routePath}`,
    backendRoute: completedBackendRoute,
    payload,
    entityKeys: input.entityKeys ?? [],
    fallbackId: returnedId || undefined,
  });
  logger?.info?.("settings-mutation", "Backend mutation route completed.", {
    route: `${req.method} ${input.routePath}`,
    backendRoute: completedBackendRoute,
    affectedRows,
    insertedId: returnedId || undefined,
    returnedId: returnedId || undefined,
    fallbackUsed: mutationResponse.fallbackUsed,
  });

  sendJson(req, res, 200, {
    ...normalizedPayload,
    ...refreshedSettingsData,
  });
  return true;
}

function matchRestResourcePath(pathname, resourceName) {
  const match = pathname.match(new RegExp(`^/api/${resourceName}/([^/]+)$`));

  return match ? decodeURIComponent(match[1]) : "";
}

function getSavedCustomerDraftFromRequestBody(body, customerId) {
  const source = body?.customer && typeof body.customer === "object"
    ? body.customer
    : body;

  return {
    ...source,
    id: customerId || source?.id,
  };
}

function getSavedCustomerAssignmentsFromBody(body) {
  const source = body?.customer && typeof body.customer === "object"
    ? body.customer
    : body;

  return normalizeBackendCustomerAssignments(
    source?.assignedCSRs ?? source?.assignedCsrs ?? source?.assigned_csrs ?? [],
    source?.ownerRepId ?? source?.owner_rep_id,
    normalizeBackendStringArray(source?.ownerRepIds ?? source?.owner_rep_ids),
  );
}

function getPrimaryCustomerFromMutationPayload(payload) {
  return normalizeBackendCustomers(
    getFirstPayloadArrayOrSingle(
      payload,
      ["customers", "accounts", "companies", "data", "items"],
      ["customer", "account", "company"],
    ),
  )[0];
}

async function syncBackendCustomerAssignmentsIfPresent(
  backendApi,
  logger,
  input,
) {
  if (!Array.isArray(input.assignments)) {
    return;
  }

  logSettingsMutationStarted(logger, {
    route: input.route,
    backendRoute: "POST /api/customer-assignments",
    payload: {
      customerId: input.customerId,
      assignments: input.assignments,
    },
  });
  logger?.info?.("settings-mutation", "Backend mutation route called.", {
    route: input.route,
    backendRoute: "POST /api/customer-assignments",
    customerId: input.customerId,
    assignmentCount: input.assignments.length,
  });

  const mutationResponse = await requestBackendMutationWithFallback(
    backendApi,
    logger,
    {
      backendPath: "/api/customer-assignments",
      method: "POST",
      sessionId: input.sessionId,
      body: {
        customerId: input.customerId,
        assignments: input.assignments,
      },
    },
  );
  const payload = mutationResponse.payload;
  const completedBackendRoute = `${mutationResponse.method} ${mutationResponse.backendPath}`;

  logSettingsMutationCompleted(logger, {
    route: input.route,
    backendRoute: completedBackendRoute,
    payload,
    entityKeys: ["assignment", "customerAssignment"],
    fallbackId: input.customerId,
  });
  logger?.info?.("settings-mutation", "Backend mutation route completed.", {
    route: input.route,
    backendRoute: completedBackendRoute,
    affectedRows: getMutationAffectedRows(payload),
    insertedId:
      getMutationReturnedId(payload, ["assignment", "customerAssignment"]) ||
      input.customerId,
    returnedId:
      getMutationReturnedId(payload, ["assignment", "customerAssignment"]) ||
      input.customerId,
    fallbackUsed: mutationResponse.fallbackUsed,
  });
}

function getCustomersFromBackendDirectoryPayload(customersPayload, assignments) {
  return normalizeBackendCustomers(
    getFirstPayloadArrayOrSingle(
      customersPayload,
      [
        "customers",
        "accounts",
        "companies",
        "data",
        "items",
      ],
      ["customer", "account", "company"],
    ),
    assignments ??
      getFirstPayloadArray(customersPayload, [
        "assignments",
        "customerAssignments",
        "customer_csr_assignments",
      ]),
  );
}

function logSettingsDataRefreshed(logger, metadata) {
  logger?.info?.(
    "settings-mutation",
    "settingsDataRefreshed",
    compactLogMetadata({
      route: metadata.route,
      backendRoute: metadata.backendRoute,
      mariaDbOperation: metadata.mariaDbOperation,
      source: metadata.source,
      usersCount: Array.isArray(metadata.users) ? metadata.users.length : undefined,
      customersCount: Array.isArray(metadata.customers)
        ? metadata.customers.length
        : undefined,
      assignmentsCount: Array.isArray(metadata.assignments)
        ? metadata.assignments.length
        : Array.isArray(metadata.customers)
          ? buildCustomerAssignmentsFromCustomers(metadata.customers).length
          : undefined,
    }),
  );
}

async function refreshBackendSettingsDataAfterMutation(
  backendApi,
  logger,
  input,
) {
  const [usersPayload, customersPayload, assignmentsPayload] = await Promise.all([
    input.includeUsers
      ? requestOptionalBackendDirectoryPayload(
          backendApi,
          "/api/users",
          input.sessionId,
          logger,
        )
      : Promise.resolve(null),
    input.includeCustomers
      ? requestOptionalBackendDirectoryPayload(
          backendApi,
          "/api/customers",
          input.sessionId,
          logger,
        )
      : Promise.resolve(null),
    input.includeCustomers || input.includeAssignments
      ? requestOptionalBackendDirectoryPayload(
          backendApi,
          "/api/customer-assignments",
          input.sessionId,
          logger,
        )
      : Promise.resolve(null),
  ]);
  const users =
    input.includeUsers && usersPayload
      ? normalizeUsersPayload(usersPayload).users
      : undefined;
  const assignments =
    (input.includeCustomers || input.includeAssignments) && assignmentsPayload
      ? normalizeCustomerAssignmentsPayload(assignmentsPayload).assignments
      : undefined;
  const customers =
    input.includeCustomers && customersPayload
      ? getCustomersFromBackendDirectoryPayload(customersPayload, assignments)
      : undefined;
  const responsePayload = {};

  if (Array.isArray(users)) {
    responsePayload.users = users;
  }

  if (Array.isArray(customers)) {
    responsePayload.customers = customers;
  }

  if (input.includeAssignments) {
    responsePayload.assignments = Array.isArray(assignments)
      ? assignments
      : Array.isArray(customers)
        ? buildCustomerAssignmentsFromCustomers(customers)
        : undefined;
  }

  logSettingsDataRefreshed(logger, {
    route: input.route,
    backendRoute: input.backendRoute,
    source: "backend_api",
    users,
    customers,
    assignments: responsePayload.assignments,
  });

  return responsePayload;
}

async function refreshRepositoryUsersAfterMutation(
  workflowDirectoryRepository,
  logger,
  input,
) {
  const users = await workflowDirectoryRepository.listManagedUsers({
    includeInactive: true,
  });

  logSettingsDataRefreshed(logger, {
    route: input.route,
    mariaDbOperation: input.mariaDbOperation,
    source: "directory_repository",
    users,
  });

  return users;
}

async function refreshRepositoryCustomersAfterMutation(
  workflowDirectoryRepository,
  currentUser,
  logger,
  input,
) {
  const customers = await workflowDirectoryRepository.listSavedCustomersForUser(
    currentUser,
  );
  const assignments = buildCustomerAssignmentsFromCustomers(customers);

  logSettingsDataRefreshed(logger, {
    route: input.route,
    mariaDbOperation: input.mariaDbOperation,
    source: "directory_repository",
    customers,
    assignments,
  });

  return {
    customers,
    assignments,
  };
}

function sendBackendSessionCleared(
  req,
  res,
  store,
  authProvider,
  backendApi,
  sessionId,
  logger,
  routePath,
) {
  logStalePersistedSessionDetected(logger, authProvider, sessionId, routePath);
  logMicrosoftTokenContextMissing(logger, authProvider, sessionId, routePath);
  clearDesktopSession(store, authProvider, sessionId, "missing_microsoft_context");
  logClearedLocalSessionState(
    logger,
    authProvider,
    sessionId,
    routePath,
    "missing_microsoft_context",
  );
  fireAndForgetBackendLogout(backendApi, sessionId, logger, routePath);

  sendJson(req, res, 200, {
    ...buildSessionSummary("", null, []),
    staleSessionCleared: true,
    authMessage: MICROSOFT_TOKEN_CONTEXT_MISSING_MESSAGE,
  });
}

function hasMissingMicrosoftContext(authProvider, sessionId) {
  return Boolean(getMissingMicrosoftContextLookupState(authProvider, sessionId));
}

function getMicrosoftIdentityLogMetadata(identity = {}) {
  const email = normalizeText(identity.email || identity.accountUsername).toLowerCase();

  return {
    email: email || undefined,
    hasHomeAccountId: Boolean(normalizeText(identity.homeAccountId)),
    hasLocalAccountId: Boolean(normalizeText(identity.localAccountId)),
    hasMicrosoftUserId: Boolean(
      normalizeText(identity.microsoftUserId) ||
        normalizeText(identity.microsoft_user_id) ||
        normalizeText(identity.entraObjectId),
    ),
  };
}

function getMutationUsers(result) {
  return Array.isArray(result) ? result : result?.users ?? [];
}

function getMutationCustomers(result) {
  return Array.isArray(result) ? result : result?.customers ?? [];
}

function getRepositoryMutationLogMetadata(result, fallbackReturnedId) {
  const returnedId =
    getMutationReturnedId(result, ["user", "employee", "customer", "assignment"]) ||
    fallbackReturnedId;

  return {
    affectedRows: getMutationAffectedRows(result),
    insertedId: returnedId || undefined,
    returnedId: returnedId || undefined,
  };
}

function parseCustomerAssignmentResourceId(assignmentId) {
  const normalizedAssignmentId = normalizeText(assignmentId);
  const [customerId = "", repId = ""] = normalizedAssignmentId.split(/[:|]/);

  return {
    customerId: normalizeText(customerId),
    repId: normalizeText(repId),
  };
}

function getCustomerAssignmentCustomerId(body, assignmentId) {
  const firstAssignment = Array.isArray(body?.assignments)
    ? body.assignments[0]
    : Array.isArray(body?.customerAssignments)
      ? body.customerAssignments[0]
      : Array.isArray(body?.customer_csr_assignments)
        ? body.customer_csr_assignments[0]
        : null;

  return (
    getFirstTextValue(body, ["customerId", "customer_id"]) ||
    getFirstTextValue(firstAssignment, ["customerId", "customer_id"]) ||
    parseCustomerAssignmentResourceId(assignmentId).customerId
  );
}

function getCustomerAssignmentRepId(body, assignmentId) {
  return (
    getFirstTextValue(body, [
      "repId",
      "rep_id",
      "employeeId",
      "employee_id",
      "userId",
      "user_id",
    ]) ||
    parseCustomerAssignmentResourceId(assignmentId).repId
  );
}

function hasExplicitCustomerAssignments(body) {
  return (
    Array.isArray(body?.assignments) ||
    Array.isArray(body?.customerAssignments) ||
    Array.isArray(body?.customer_csr_assignments) ||
    Array.isArray(body?.assignedCSRs) ||
    Array.isArray(body?.assignedCsrs) ||
    Array.isArray(body?.assigned_csrs)
  );
}

function getCustomerAssignmentDraft(body, assignmentId, existingCustomer) {
  if (hasExplicitCustomerAssignments(body)) {
    return normalizeBackendCustomerAssignments(
      body.assignments ??
        body.customerAssignments ??
        body.customer_csr_assignments ??
        body.assignedCSRs ??
        body.assignedCsrs ??
        body.assigned_csrs,
      body.ownerRepId ?? body.owner_rep_id,
      normalizeBackendStringArray(body.ownerRepIds ?? body.owner_rep_ids),
    );
  }

  const repId = getCustomerAssignmentRepId(body, assignmentId);

  if (!repId) {
    throw new Error("Customer assignment rep id is required.");
  }

  const existingAssignments = Array.isArray(existingCustomer.assignedCSRs)
    ? existingCustomer.assignedCSRs
    : [];
  const nextIsActive = normalizeBackendBoolean(
    body.isActive ?? body.is_active ?? body.active,
    true,
  );
  const nextAssignment = normalizeBackendCustomerAssignments(
    [
      {
        ...body,
        repId,
        employeeId: repId,
        isActive: nextIsActive,
      },
    ],
    repId,
    [repId],
  )[0] ?? {
    repId,
    assignmentRole: "primary",
    isActive: nextIsActive,
  };
  const matchedExisting = existingAssignments.some(
    (assignment) => assignment.repId === repId,
  );

  if (nextIsActive === false) {
    return existingAssignments.map((assignment) =>
      assignment.repId === repId ? { ...assignment, isActive: false } : assignment,
    );
  }

  if (!matchedExisting) {
    return [...existingAssignments, nextAssignment];
  }

  return existingAssignments.map((assignment) =>
    assignment.repId === repId ? { ...assignment, ...nextAssignment } : assignment,
  );
}

function invalidateChangedUserSessions(store, result) {
  if (!result || Array.isArray(result) || !result.invalidatedUserId) {
    return;
  }

  store.invalidateSessionsForUser?.(
    result.invalidatedUserId,
    result.invalidationReason ?? "access_changed",
  );
}

async function startDirectoryBackedSession(
  store,
  workflowDirectoryRepository,
  sessionId,
  identity,
) {
  if (!workflowDirectoryRepository) {
    throw createHttpError(
      503,
      "backend_auth_required",
      "Action Desk sign-in must be resolved by the backend API.",
    );
  }

  const repProfile = await resolveSignInRepProfileForSession(
    workflowDirectoryRepository,
    identity,
  );

  if (typeof store.startSessionForRepProfile === "function") {
    return store.startSessionForRepProfile(sessionId, repProfile);
  }

  return {
    sessionId,
    currentUser: repProfile,
    capabilities: getCapabilitiesForRole(repProfile.role),
  };
}

async function resolveSignInRepProfileForSession(workflowDirectoryRepository, identity) {
  if (typeof workflowDirectoryRepository.resolveSignInRepProfileStatus === "function") {
    const result = await workflowDirectoryRepository.resolveSignInRepProfileStatus(identity);

    if (result?.status === "inactive") {
      throw createHttpError(403, "action_desk_account_inactive", "Your Action Desk account is inactive.");
    }

    if (result?.status === "active" && result.repProfile) {
      return result.repProfile;
    }

    throw createHttpError(
      404,
      "microsoft_account_not_setup",
      "Your Microsoft account is not set up in Action Desk.",
    );
  }

  const repProfile = await workflowDirectoryRepository.resolveSignInRepProfile(identity);

  if (!repProfile) {
    throw createHttpError(
      404,
      "microsoft_account_not_setup",
      "Your Microsoft account is not set up in Action Desk.",
    );
  }

  if (repProfile.isActive === false) {
    throw createHttpError(403, "action_desk_account_inactive", "Your Action Desk account is inactive.");
  }

  return repProfile;
}

function hasRequestBody(method) {
  return ["POST", "PATCH", "PUT", "DELETE"].includes(method);
}

function createWorkflowRouteHandler(
  store,
  logger,
  workflowDirectoryRepository,
  authProvider,
  backendApi,
) {
  return async (req, res, requestUrl) => {
    const body = hasRequestBody(req.method) ? await readRequestBody(req) : {};
    const sessionId = getRequestSessionId(req, requestUrl, body);

    if (hasBackendApi(backendApi) && req.method === "GET" && requestUrl.pathname === "/api/auth/session") {
      if (!String(sessionId || "").trim()) {
        sendJson(req, res, 200, buildSessionSummary("", null, []));
        return true;
      }

      if (hasMissingMicrosoftContext(authProvider, sessionId)) {
        sendBackendSessionCleared(
          req,
          res,
          store,
          authProvider,
          backendApi,
          sessionId,
          logger,
          requestUrl.pathname,
        );
        return true;
      }

      const backendSession = await backendApi.requestJson("/api/auth/session", {
        sessionId,
      });
      const normalizedSession = syncStoreSessionFromBackendPayload(
        store,
        backendSession,
        sessionId,
        logger,
      );

      sendJson(req, res, 200, normalizedSession);
      return true;
    }

    if (hasBackendApi(backendApi) && req.method === "POST" && requestUrl.pathname === "/api/auth/logout") {
      store.logout(sessionId, {
        reason: "apiLogout",
        source: "backend_api_logout_proxy",
      });
      await backendApi.requestJson("/api/auth/logout", {
        method: "POST",
        sessionId,
        body: {},
      }).catch((error) => {
        logger?.warn?.("auth", "Backend logout failed.", {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      sendJson(req, res, 200, { sessionId });
      return true;
    }

    if (
      hasBackendApi(backendApi) &&
      req.method === "POST" &&
      requestUrl.pathname === "/api/auth/microsoft-session"
    ) {
      const identityLogMetadata = getMicrosoftIdentityLogMetadata(body.identity ?? body);
      logger?.info?.("auth", "Forwarding Microsoft identity to backend API.", {
        ...identityLogMetadata,
        microsoftAuthSessionId: normalizeText(body.microsoftSessionId) || undefined,
      });

      try {
        const backendSession = await backendApi.requestJson("/api/auth/microsoft-session", {
          method: "POST",
          body,
        });
        const normalizedSession = syncStoreSessionFromBackendPayload(
          store,
          backendSession,
          backendSession?.sessionId ?? sessionId,
          logger,
        );

        if (!normalizedSession.sessionId || !normalizedSession.currentUser) {
          throw createHttpError(
            404,
            "microsoft_account_not_setup",
            "Your Microsoft account is not set up in Action Desk.",
          );
        }

        const aliasCreated = Boolean(
          authProvider?.aliasSessionContext?.(
            body.microsoftSessionId,
            normalizedSession.sessionId,
          ),
        );

        logger?.info?.("auth", "Backend session resolved.", {
          ...getMicrosoftSessionLookupLogMetadata(
            authProvider,
            normalizedSession.sessionId,
          ),
          microsoftAuthSessionId: normalizeText(body.microsoftSessionId) || undefined,
          backendSessionId: normalizedSession.sessionId,
          aliasCreated,
          repId: normalizedSession.currentUser.id,
          role: normalizedSession.currentUser.role,
        });

        sendJson(req, res, 200, normalizedSession);
        return true;
      } catch (error) {
        logger?.warn?.("auth", "Backend session was not resolved.", {
          ...identityLogMetadata,
          code: error?.code,
          statusCode: error?.statusCode,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    if (hasBackendApi(backendApi) && req.method === "GET" && requestUrl.pathname === "/api/health") {
      const backendHealth = await backendApi.requestJson("/health");
      const localHealth = store.getHealth(sessionId);

      sendJson(req, res, 200, {
        ...backendHealth,
        ok: backendHealth?.ok ?? true,
        databaseReady: backendHealth?.databaseReady ?? backendHealth?.ok ?? true,
        databasePath: "Backend API",
        backendApiUrl: backendApi.baseUrl,
        sqliteDatabasePath: localHealth.databasePath,
        currentUser: localHealth.currentUser,
        threadCount: localHealth.threadCount,
        serverTime: backendHealth?.serverTime ?? new Date().toISOString(),
      });
      return true;
    }

    if (hasBackendApi(backendApi)) {
      const backendDirectoryRoute = `${req.method} ${requestUrl.pathname}`;
      const backendUserId = matchRestResourcePath(requestUrl.pathname, "users");
      const backendCustomerId = matchRestResourcePath(requestUrl.pathname, "customers");
      const backendAssignmentId = matchRestResourcePath(
        requestUrl.pathname,
        "customer-assignments",
      );
      const isBackendDirectoryMutationRoute =
        backendDirectoryRoute === "POST /api/users" ||
        (req.method === "PATCH" && Boolean(backendUserId)) ||
        backendDirectoryRoute === "POST /api/customers" ||
        (req.method === "PATCH" && Boolean(backendCustomerId)) ||
        backendDirectoryRoute === "POST /api/customer-assignments" ||
        (req.method === "PATCH" && Boolean(backendAssignmentId));

      if (
        [
          "GET /api/workflow/bootstrap",
          "GET /api/admin/users",
          "GET /api/users",
          "GET /api/customers",
          "GET /api/customer-assignments",
          "POST /api/admin/users/create",
          "POST /api/admin/users/update",
          "POST /api/admin/users/deactivate",
          "POST /api/workflow/customers/upsert",
          "POST /api/workflow/customers/delete",
          "POST /api/workflow/customers/clear",
        ].includes(backendDirectoryRoute) ||
        isBackendDirectoryMutationRoute
      ) {
        if (hasMissingMicrosoftContext(authProvider, sessionId)) {
          logStalePersistedSessionDetected(logger, authProvider, sessionId, requestUrl.pathname);
          logMicrosoftTokenContextMissing(logger, authProvider, sessionId, requestUrl.pathname);
          clearDesktopSession(store, authProvider, sessionId, "missing_microsoft_context");
          logClearedLocalSessionState(
            logger,
            authProvider,
            sessionId,
            requestUrl.pathname,
            "missing_microsoft_context",
          );
          fireAndForgetBackendLogout(backendApi, sessionId, logger, requestUrl.pathname);
          sendSessionInvalidationError(
            req,
            res,
            "missing_microsoft_context",
            requestUrl.pathname,
          );
          return true;
        }

        if (req.method === "GET" && requestUrl.pathname === "/api/workflow/bootstrap") {
          const rawBackendBootstrap = await backendApi.requestJson("/api/workflow/bootstrap", {
            sessionId,
          });
          const localBootstrap = store.getBootstrap(sessionId);
          let backendBootstrap = normalizeBackendBootstrapPayload(
            rawBackendBootstrap,
            localBootstrap,
            sessionId,
          );
          backendBootstrap = await hydrateBackendBootstrapDirectoryData(
            backendApi,
            backendBootstrap,
            backendBootstrap.sessionId || sessionId,
            logger,
          );

          logger?.info?.(
            "workflow-bootstrap",
            "Backend bootstrap response shape inspected.",
            {
              context: requestUrl.pathname,
              ...getBackendBootstrapShapeDiagnostics(
                rawBackendBootstrap,
                backendBootstrap,
              ),
            },
          );

          const normalizedSession = syncStoreSessionFromBackendPayload(
            store,
            backendBootstrap,
            sessionId,
            logger,
            {
              context: "backend_bootstrap",
              cleanupOnMissingCurrentUser: false,
            },
          );
          const bootstrap = mergeBackendBootstrapWithLocalWorkflowState(
            store,
            {
              ...backendBootstrap,
              sessionId: normalizedSession.sessionId,
              currentUser: normalizedSession.currentUser,
              capabilities: normalizedSession.capabilities,
              reps:
                Array.isArray(backendBootstrap?.reps) && backendBootstrap.reps.length > 0
                  ? backendBootstrap.reps
                  : normalizedSession.reps,
            },
            normalizedSession.sessionId || sessionId,
          );
          const validationFailure = getBootstrapValidationFailure(bootstrap);

          if (validationFailure) {
            logger?.warn?.(
              "workflow-bootstrap",
              "Backend bootstrap validation failed.",
              {
                context: requestUrl.pathname,
                reason: validationFailure,
                sessionId: normalizedSession.sessionId || sessionId,
                ...getBackendBootstrapShapeDiagnostics(
                  rawBackendBootstrap,
                  backendBootstrap,
                ),
              },
            );
            throw createHttpError(
              validationFailure === "missingCurrentUser" ? 401 : 502,
              validationFailure === "missingCurrentUser"
                ? "auth_required"
                : "invalid_backend_bootstrap",
              validationFailure === "missingCurrentUser"
                ? "You must sign in before using the shared workflow."
                : "The backend bootstrap response was missing required workflow data.",
            );
          }

          logger?.info?.("workflow-bootstrap", "Backend bootstrap validation passed.", {
            context: requestUrl.pathname,
            reason: "validBootstrap",
            sessionId: normalizedSession.sessionId || sessionId,
            usersCount: bootstrap.reps.length,
            capabilitiesCount: bootstrap.capabilities.length,
            repsCount: bootstrap.workflowState.reps.length,
            customersCount: bootstrap.customers.length,
            assignmentsCount: Array.isArray(bootstrap.customerAssignments)
              ? bootstrap.customerAssignments.length
              : buildCustomerAssignmentsFromCustomers(bootstrap.customers).length,
            capabilities: bootstrap.capabilities,
          });

          sendJson(req, res, 200, bootstrap);
          return true;
        }

        if (req.method === "GET" && requestUrl.pathname === "/api/admin/users") {
          return sendBackendJson(req, res, backendApi, "/api/users", {
            sessionId,
            normalize: normalizeUsersPayload,
          });
        }

        if (req.method === "GET" && requestUrl.pathname === "/api/users") {
          return sendBackendJson(req, res, backendApi, "/api/users", {
            sessionId,
            normalize: normalizeUsersPayload,
          });
        }

        if (req.method === "GET" && requestUrl.pathname === "/api/customers") {
          return sendBackendJson(req, res, backendApi, "/api/customers", {
            sessionId,
            normalize: normalizeCustomersPayload,
          });
        }

        if (req.method === "GET" && requestUrl.pathname === "/api/customer-assignments") {
          return sendBackendJson(req, res, backendApi, "/api/customer-assignments", {
            sessionId,
            normalize: normalizeCustomerAssignmentsPayload,
          });
        }

        if (req.method === "POST" && requestUrl.pathname === "/api/users") {
          return requestBackendMutationJson(req, res, backendApi, logger, {
            routePath: requestUrl.pathname,
            backendPath: "/api/users",
            method: "POST",
            sessionId,
            body,
            normalize: normalizeUsersPayload,
            entityKeys: ["user", "employee"],
            refreshSettingsData: { includeUsers: true },
          });
        }

        if (req.method === "PATCH" && backendUserId) {
          return requestBackendMutationJson(req, res, backendApi, logger, {
            routePath: requestUrl.pathname,
            backendPath: `/api/users/${encodeURIComponent(backendUserId)}`,
            method: "PATCH",
            sessionId,
            body: {
              ...body,
              userId: body.userId ?? backendUserId,
            },
            normalize: normalizeUsersPayload,
            entityKeys: ["user", "employee"],
            refreshSettingsData: { includeUsers: true },
          });
        }

        if (req.method === "POST" && requestUrl.pathname === "/api/customers") {
          logSettingsMutationStarted(logger, {
            route: `${req.method} ${requestUrl.pathname}`,
            backendRoute: "POST /api/customers",
            payload: body,
          });
          logger?.info?.("settings-mutation", "Backend mutation route called.", {
            route: `${req.method} ${requestUrl.pathname}`,
            backendRoute: "POST /api/customers",
          });
          const mutationResponse = await requestBackendMutationWithFallback(
            backendApi,
            logger,
            {
              backendPath: "/api/customers",
              method: "POST",
              sessionId,
              body,
            },
          );
          const rawCustomerPayload = mutationResponse.payload;
          const completedBackendRoute = `${mutationResponse.method} ${mutationResponse.backendPath}`;
          const savedCustomer = getPrimaryCustomerFromMutationPayload(rawCustomerPayload);
          const customerId =
            savedCustomer?.id ||
            getMutationReturnedId(rawCustomerPayload, ["customer", "account", "company"]) ||
            getFirstTextValue(body, ["id", "customerId"]);
          const assignments = getSavedCustomerAssignmentsFromBody(body);

          if (
            customerId &&
            Array.isArray(body.assignedCSRs) &&
            !(
              mutationResponse.fallbackUsed &&
              mutationResponse.backendPath === "/api/workflow/customers/upsert"
            )
          ) {
            await syncBackendCustomerAssignmentsIfPresent(backendApi, logger, {
              route: `${req.method} ${requestUrl.pathname}`,
              sessionId,
              customerId,
              assignments,
            });
          }

          logSettingsMutationCompleted(logger, {
            route: `${req.method} ${requestUrl.pathname}`,
            backendRoute: completedBackendRoute,
            payload: rawCustomerPayload,
            entityKeys: ["customer", "account", "company"],
            fallbackId: customerId || undefined,
          });
          logger?.info?.("settings-mutation", "Backend mutation route completed.", {
            route: `${req.method} ${requestUrl.pathname}`,
            backendRoute: completedBackendRoute,
            affectedRows: getMutationAffectedRows(rawCustomerPayload),
            insertedId: customerId || undefined,
            returnedId: customerId || undefined,
            fallbackUsed: mutationResponse.fallbackUsed,
          });
          const refreshedSettingsData = await refreshBackendSettingsDataAfterMutation(
            backendApi,
            logger,
            {
              route: `${req.method} ${requestUrl.pathname}`,
              backendRoute: completedBackendRoute,
              sessionId,
              includeCustomers: true,
              includeAssignments: true,
            },
          );
          sendJson(req, res, 200, {
            ...normalizeCustomersPayload(rawCustomerPayload),
            ...refreshedSettingsData,
          });
          return true;
        }

        if (req.method === "PATCH" && backendCustomerId) {
          logSettingsMutationStarted(logger, {
            route: `${req.method} ${requestUrl.pathname}`,
            backendRoute: `PATCH /api/customers/${backendCustomerId}`,
            payload: {
              ...body,
              id: body.id ?? backendCustomerId,
            },
          });
          logger?.info?.("settings-mutation", "Backend mutation route called.", {
            route: `${req.method} ${requestUrl.pathname}`,
            backendRoute: `PATCH /api/customers/${backendCustomerId}`,
          });
          const mutationResponse = await requestBackendMutationWithFallback(
            backendApi,
            logger,
            {
              backendPath: `/api/customers/${encodeURIComponent(backendCustomerId)}`,
              method: "PATCH",
              sessionId,
              body: {
                ...body,
                id: body.id ?? backendCustomerId,
              },
            },
          );
          const rawCustomerPayload = mutationResponse.payload;
          const completedBackendRoute = `${mutationResponse.method} ${mutationResponse.backendPath}`;
          const savedCustomer = getPrimaryCustomerFromMutationPayload(rawCustomerPayload);
          const customerId =
            savedCustomer?.id ||
            getMutationReturnedId(rawCustomerPayload, ["customer", "account", "company"]) ||
            backendCustomerId;
          const assignments = getSavedCustomerAssignmentsFromBody(body);

          if (
            Array.isArray(body.assignedCSRs) &&
            !(
              mutationResponse.fallbackUsed &&
              mutationResponse.backendPath === "/api/workflow/customers/upsert"
            )
          ) {
            await syncBackendCustomerAssignmentsIfPresent(backendApi, logger, {
              route: `${req.method} ${requestUrl.pathname}`,
              sessionId,
              customerId,
              assignments,
            });
          }

          logSettingsMutationCompleted(logger, {
            route: `${req.method} ${requestUrl.pathname}`,
            backendRoute: completedBackendRoute,
            payload: rawCustomerPayload,
            entityKeys: ["customer", "account", "company"],
            fallbackId: customerId || undefined,
          });
          logger?.info?.("settings-mutation", "Backend mutation route completed.", {
            route: `${req.method} ${requestUrl.pathname}`,
            backendRoute: completedBackendRoute,
            affectedRows: getMutationAffectedRows(rawCustomerPayload),
            insertedId: customerId || undefined,
            returnedId: customerId || undefined,
            fallbackUsed: mutationResponse.fallbackUsed,
          });
          const refreshedSettingsData = await refreshBackendSettingsDataAfterMutation(
            backendApi,
            logger,
            {
              route: `${req.method} ${requestUrl.pathname}`,
              backendRoute: completedBackendRoute,
              sessionId,
              includeCustomers: true,
              includeAssignments: true,
            },
          );
          sendJson(req, res, 200, {
            ...normalizeCustomersPayload(rawCustomerPayload),
            ...refreshedSettingsData,
          });
          return true;
        }

        if (
          req.method === "POST" &&
          requestUrl.pathname === "/api/customer-assignments"
        ) {
          return requestBackendMutationJson(req, res, backendApi, logger, {
            routePath: requestUrl.pathname,
            backendPath: "/api/customer-assignments",
            method: "POST",
            sessionId,
            body,
            normalize: normalizeCustomerAssignmentsPayload,
            entityKeys: ["assignment", "customerAssignment"],
            refreshSettingsData: {
              includeCustomers: true,
              includeAssignments: true,
            },
          });
        }

        if (req.method === "PATCH" && backendAssignmentId) {
          return requestBackendMutationJson(req, res, backendApi, logger, {
            routePath: requestUrl.pathname,
            backendPath: `/api/customer-assignments/${encodeURIComponent(
              backendAssignmentId,
            )}`,
            method: "PATCH",
            sessionId,
            body,
            normalize: normalizeCustomerAssignmentsPayload,
            entityKeys: ["assignment", "customerAssignment"],
            refreshSettingsData: {
              includeCustomers: true,
              includeAssignments: true,
            },
          });
        }

        if (
          req.method === "POST" &&
          [
            "/api/workflow/customers/upsert",
            "/api/workflow/customers/delete",
            "/api/workflow/customers/clear",
          ].includes(requestUrl.pathname)
        ) {
          if (requestUrl.pathname === "/api/workflow/customers/upsert") {
            const customer = getSavedCustomerDraftFromRequestBody(body);
            const customerId = normalizeText(customer.id);
            const method = customerId ? "PATCH" : "POST";
            const backendPath = customerId
              ? `/api/customers/${encodeURIComponent(customerId)}`
              : "/api/customers";
            logSettingsMutationStarted(logger, {
              route: `${req.method} ${requestUrl.pathname}`,
              backendRoute: `${method} ${backendPath}`,
              payload: customer,
            });
            logger?.info?.("settings-mutation", "Backend mutation route called.", {
              route: `${req.method} ${requestUrl.pathname}`,
              backendRoute: `${method} ${backendPath}`,
            });
            const mutationResponse = await requestBackendMutationWithFallback(
              backendApi,
              logger,
              {
                backendPath,
                method,
                sessionId,
                body: customer,
              },
            );
            const rawCustomerPayload = mutationResponse.payload;
            const completedBackendRoute = `${mutationResponse.method} ${mutationResponse.backendPath}`;
            const savedCustomer = getPrimaryCustomerFromMutationPayload(rawCustomerPayload);
            const savedCustomerId =
              savedCustomer?.id ||
              getMutationReturnedId(rawCustomerPayload, ["customer", "account", "company"]) ||
              customerId;
            const assignments = getSavedCustomerAssignmentsFromBody(customer);

            if (
              savedCustomerId &&
              Array.isArray(customer.assignedCSRs) &&
              !(
                mutationResponse.fallbackUsed &&
                mutationResponse.backendPath === "/api/workflow/customers/upsert"
              )
            ) {
              await syncBackendCustomerAssignmentsIfPresent(backendApi, logger, {
                route: `${req.method} ${requestUrl.pathname}`,
                sessionId,
                customerId: savedCustomerId,
                assignments,
              });
            }

            logSettingsMutationCompleted(logger, {
              route: `${req.method} ${requestUrl.pathname}`,
              backendRoute: completedBackendRoute,
              payload: rawCustomerPayload,
              entityKeys: ["customer", "account", "company"],
              fallbackId: savedCustomerId || undefined,
            });
            logger?.info?.("settings-mutation", "Legacy customer mutation routed to backend REST.", {
              route: `${req.method} ${requestUrl.pathname}`,
              backendRoute: completedBackendRoute,
              affectedRows: getMutationAffectedRows(rawCustomerPayload),
              insertedId: savedCustomerId || undefined,
              returnedId: savedCustomerId || undefined,
              fallbackUsed: mutationResponse.fallbackUsed,
            });
            const refreshedSettingsData = await refreshBackendSettingsDataAfterMutation(
              backendApi,
              logger,
              {
                route: `${req.method} ${requestUrl.pathname}`,
                backendRoute: completedBackendRoute,
                sessionId,
                includeCustomers: true,
                includeAssignments: true,
              },
            );
            sendJson(req, res, 200, {
              ...normalizeCustomersPayload(rawCustomerPayload),
              ...refreshedSettingsData,
            });
            return true;
          }

          if (requestUrl.pathname === "/api/workflow/customers/delete") {
            const customerId = normalizeText(body.customerId);

            return requestBackendMutationJson(req, res, backendApi, logger, {
              routePath: requestUrl.pathname,
              backendPath: `/api/customers/${encodeURIComponent(customerId)}`,
              method: "PATCH",
              sessionId,
              body: { id: customerId, isActive: false },
              normalize: normalizeCustomersPayload,
              entityKeys: ["customer"],
              refreshSettingsData: {
                includeCustomers: true,
                includeAssignments: true,
              },
            });
          }

          return requestBackendMutationJson(req, res, backendApi, logger, {
            routePath: requestUrl.pathname,
            backendPath: requestUrl.pathname,
            method: "POST",
            sessionId,
            body,
            normalize: normalizeCustomersPayload,
            entityKeys: ["customer"],
            refreshSettingsData: {
              includeCustomers: true,
              includeAssignments: true,
            },
          });
        }

        if (
          req.method === "POST" &&
          [
            "/api/admin/users/create",
            "/api/admin/users/update",
            "/api/admin/users/deactivate",
          ].includes(requestUrl.pathname)
        ) {
          if (requestUrl.pathname === "/api/admin/users/create") {
            return requestBackendMutationJson(req, res, backendApi, logger, {
              routePath: requestUrl.pathname,
              backendPath: "/api/users",
              method: "POST",
              sessionId,
              body,
              normalize: normalizeUsersPayload,
              entityKeys: ["user", "employee"],
              refreshSettingsData: { includeUsers: true },
            });
          }

          const userId = normalizeText(body.userId);

          return requestBackendMutationJson(req, res, backendApi, logger, {
            routePath: requestUrl.pathname,
            backendPath: `/api/users/${encodeURIComponent(userId)}`,
            method: "PATCH",
            sessionId,
            body:
              requestUrl.pathname === "/api/admin/users/deactivate"
                ? { userId, isActive: false }
                : { ...body, userId },
            normalize: normalizeUsersPayload,
            entityKeys: ["user", "employee"],
            refreshSettingsData: { includeUsers: true },
          });
        }

        return sendBackendJson(req, res, backendApi, requestUrl.pathname, {
          method: req.method,
          sessionId,
          body,
        });
      }
    }

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
        logMicrosoftTokenContextMissing(
          logger,
          store.authProvider,
          sessionId,
          requestUrl.pathname,
        );
        clearDesktopSession(store, store.authProvider, sessionId, "missing_microsoft_context");
        sendJson(req, res, 200, {
          ...store.getSessionSummary(""),
          staleSessionCleared: true,
          authMessage: MICROSOFT_TOKEN_CONTEXT_MISSING_MESSAGE,
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

      const directorySessionState = await getDirectorySessionState(
        store,
        workflowDirectoryRepository,
        sessionId,
      );

      if (directorySessionState.accessChanged) {
        clearDesktopSession(store, store.authProvider, sessionId, "access_changed");
        sendJson(req, res, 200, {
          ...buildSessionSummary("", null, []),
          staleSessionCleared: true,
          authMessage: ACCESS_CHANGED_SESSION_MESSAGE,
        });
        return true;
      }

      sendJson(req, res, 200, {
        ...directorySessionState.summary,
      });
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/auth/logout") {
      store.logout(sessionId, {
        reason: "apiLogout",
        source: "local_api_logout",
      });
      sendJson(req, res, 200, { sessionId });
      return true;
    }

    if (
      req.method === "POST" &&
      requestUrl.pathname === "/api/auth/microsoft-session" &&
      workflowDirectoryRepository
    ) {
      const targetSessionId =
        normalizeText(sessionId) ||
        normalizeText(body.microsoftSessionId) ||
        `session-${crypto.randomUUID()}`;
      const identity = body.identity ?? body;
      const identityLogMetadata = getMicrosoftIdentityLogMetadata(identity);
      logger?.info?.("auth", "Resolving Microsoft identity through backend session API.", {
        ...identityLogMetadata,
        microsoftAuthSessionId: normalizeText(body.microsoftSessionId) || undefined,
      });

      try {
        await startDirectoryBackedSession(
          store,
          workflowDirectoryRepository,
          targetSessionId,
          identity,
        );
        const sessionState = await getDirectorySessionState(
          store,
          workflowDirectoryRepository,
          targetSessionId,
        );

        if (!sessionState.summary.sessionId || !sessionState.summary.currentUser) {
          throw createHttpError(
            404,
            "microsoft_account_not_setup",
            "Your Microsoft account is not set up in Action Desk.",
          );
        }

        const aliasCreated = Boolean(
          authProvider?.aliasSessionContext?.(
            body.microsoftSessionId,
            sessionState.summary.sessionId,
          ),
        );

        logger?.info?.("auth", "Backend session resolved.", {
          ...getMicrosoftSessionLookupLogMetadata(
            authProvider,
            sessionState.summary.sessionId,
          ),
          microsoftAuthSessionId: normalizeText(body.microsoftSessionId) || undefined,
          backendSessionId: sessionState.summary.sessionId,
          aliasCreated,
          repId: sessionState.summary.currentUser.id,
          role: sessionState.summary.currentUser.role,
        });

        sendJson(req, res, 200, sessionState.summary);
        return true;
      } catch (error) {
        logger?.warn?.("auth", "Backend session was not resolved.", {
          ...identityLogMetadata,
          code: error?.code,
          statusCode: error?.statusCode,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    const staleSessionState = getStaleDesktopSessionState(
      store,
      store.authProvider,
      sessionId,
    );

    if (staleSessionState) {
      if (staleSessionState.code === "missing_microsoft_context") {
        logMicrosoftTokenContextMissing(
          logger,
          store.authProvider,
          staleSessionState.sessionId,
          requestUrl.pathname,
        );
      }
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

    if (req.method === "GET" && requestUrl.pathname === "/api/users" && workflowDirectoryRepository) {
      const sessionState = await getDirectorySessionState(
        store,
        workflowDirectoryRepository,
        sessionId,
      );
      sendJson(req, res, 200, {
        users: await workflowDirectoryRepository.listVisibleRepProfiles(
          sessionState.summary.currentUser,
        ),
      });
      return true;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/customers" && workflowDirectoryRepository) {
      const sessionState = await getDirectorySessionState(
        store,
        workflowDirectoryRepository,
        sessionId,
      );
      sendJson(req, res, 200, {
        customers: await workflowDirectoryRepository.listSavedCustomersForUser(
          sessionState.summary.currentUser,
        ),
      });
      return true;
    }

    if (
      req.method === "GET" &&
      requestUrl.pathname === "/api/customer-assignments" &&
      workflowDirectoryRepository
    ) {
      const sessionState = await getDirectorySessionState(
        store,
        workflowDirectoryRepository,
        sessionId,
      );
      const customers = await workflowDirectoryRepository.listSavedCustomersForUser(
        sessionState.summary.currentUser,
      );

      sendJson(req, res, 200, {
        assignments: buildCustomerAssignmentsFromCustomers(customers),
      });
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/users" && workflowDirectoryRepository) {
      const sessionState = await requireDirectorySessionState(
        store,
        workflowDirectoryRepository,
        authProvider,
        sessionId,
      );
      requireSessionCapability(sessionState.summary, "manage_users");
      logSettingsMutationStarted(logger, {
        route: "POST /api/users",
        mariaDbOperation: "createManagedUser",
        payload: body,
      });
      logger?.info?.("settings-mutation", "MariaDB mutation route called.", {
        route: "POST /api/users",
        mariaDbOperation: "createManagedUser",
      });
      const result = await workflowDirectoryRepository.createManagedUser(body);
      logSettingsMutationCompleted(logger, {
        route: "POST /api/users",
        mariaDbOperation: "createManagedUser",
        payload: result,
        entityKeys: ["user", "employee"],
      });
      logger?.info?.("settings-mutation", "MariaDB mutation route completed.", {
        route: "POST /api/users",
        mariaDbOperation: "createManagedUser",
        ...getRepositoryMutationLogMetadata(result),
      });
      const users = await refreshRepositoryUsersAfterMutation(
        workflowDirectoryRepository,
        logger,
        {
          route: "POST /api/users",
          mariaDbOperation: "createManagedUser",
        },
      );
      sendJson(req, res, 200, { users, mutation: result?.mutation });
      return true;
    }

    const restUserId = matchRestResourcePath(requestUrl.pathname, "users");

    if (req.method === "PATCH" && restUserId && workflowDirectoryRepository) {
      const sessionState = await requireDirectorySessionState(
        store,
        workflowDirectoryRepository,
        authProvider,
        sessionId,
      );
      requireSessionCapability(sessionState.summary, "manage_users");
      logSettingsMutationStarted(logger, {
        route: `PATCH /api/users/${restUserId}`,
        mariaDbOperation: "updateManagedUser",
        payload: {
          ...body,
          userId: body.userId ?? restUserId,
        },
      });
      logger?.info?.("settings-mutation", "MariaDB mutation route called.", {
        route: `PATCH /api/users/${restUserId}`,
        mariaDbOperation: "updateManagedUser",
      });
      const result = await workflowDirectoryRepository.updateManagedUser({
        ...body,
        userId: body.userId ?? restUserId,
      });
      invalidateChangedUserSessions(store, result);
      logSettingsMutationCompleted(logger, {
        route: `PATCH /api/users/${restUserId}`,
        mariaDbOperation: "updateManagedUser",
        payload: result,
        entityKeys: ["user", "employee"],
        fallbackId: restUserId,
      });
      logger?.info?.("settings-mutation", "MariaDB mutation route completed.", {
        route: `PATCH /api/users/${restUserId}`,
        mariaDbOperation: "updateManagedUser",
        ...getRepositoryMutationLogMetadata(result, restUserId),
      });
      const users = await refreshRepositoryUsersAfterMutation(
        workflowDirectoryRepository,
        logger,
        {
          route: `PATCH /api/users/${restUserId}`,
          mariaDbOperation: "updateManagedUser",
        },
      );
      sendJson(req, res, 200, { users, mutation: result?.mutation });
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/customers" && workflowDirectoryRepository) {
      const sessionState = await requireDirectorySessionState(
        store,
        workflowDirectoryRepository,
        authProvider,
        sessionId,
      );
      const currentUser = requireSessionCapability(
        sessionState.summary,
        "manage_customer_ownership",
      );
      const customer = getSavedCustomerDraftFromRequestBody(body);
      logSettingsMutationStarted(logger, {
        route: "POST /api/customers",
        mariaDbOperation: "upsertSavedCustomer",
        payload: customer,
      });
      logger?.info?.("settings-mutation", "MariaDB mutation route called.", {
        route: "POST /api/customers",
        mariaDbOperation: "upsertSavedCustomer",
      });
      const result = await workflowDirectoryRepository.upsertSavedCustomer(
        customer,
        currentUser,
      );
      logSettingsMutationCompleted(logger, {
        route: "POST /api/customers",
        mariaDbOperation: "upsertSavedCustomer",
        payload: result,
        entityKeys: ["customer"],
      });
      logger?.info?.("settings-mutation", "MariaDB mutation route completed.", {
        route: "POST /api/customers",
        mariaDbOperation: "upsertSavedCustomer",
        ...getRepositoryMutationLogMetadata(result),
      });
      const refreshedSettingsData = await refreshRepositoryCustomersAfterMutation(
        workflowDirectoryRepository,
        currentUser,
        logger,
        {
          route: "POST /api/customers",
          mariaDbOperation: "upsertSavedCustomer",
        },
      );
      sendJson(req, res, 200, {
        customers: refreshedSettingsData.customers,
        mutation: result?.mutation,
      });
      return true;
    }

    const restCustomerId = matchRestResourcePath(requestUrl.pathname, "customers");

    if (req.method === "PATCH" && restCustomerId && workflowDirectoryRepository) {
      const sessionState = await requireDirectorySessionState(
        store,
        workflowDirectoryRepository,
        authProvider,
        sessionId,
      );
      const currentUser = requireSessionCapability(
        sessionState.summary,
        "manage_customer_ownership",
      );
      const isDeactivate =
        body.isActive === false || body.is_active === false || body.active === false;
      logSettingsMutationStarted(logger, {
        route: `PATCH /api/customers/${restCustomerId}`,
        mariaDbOperation: isDeactivate ? "deleteSavedCustomer" : "upsertSavedCustomer",
        payload: {
          ...body,
          id: body.id ?? restCustomerId,
        },
      });
      logger?.info?.("settings-mutation", "MariaDB mutation route called.", {
        route: `PATCH /api/customers/${restCustomerId}`,
        mariaDbOperation: isDeactivate ? "deleteSavedCustomer" : "upsertSavedCustomer",
      });
      const result = isDeactivate
        ? await workflowDirectoryRepository.deleteSavedCustomer(restCustomerId, currentUser)
        : await workflowDirectoryRepository.upsertSavedCustomer(
            getSavedCustomerDraftFromRequestBody(body, restCustomerId),
            currentUser,
          );
      logSettingsMutationCompleted(logger, {
        route: `PATCH /api/customers/${restCustomerId}`,
        mariaDbOperation: isDeactivate ? "deleteSavedCustomer" : "upsertSavedCustomer",
        payload: result,
        entityKeys: ["customer"],
        fallbackId: restCustomerId,
      });
      logger?.info?.("settings-mutation", "MariaDB mutation route completed.", {
        route: `PATCH /api/customers/${restCustomerId}`,
        mariaDbOperation: isDeactivate ? "deleteSavedCustomer" : "upsertSavedCustomer",
        ...getRepositoryMutationLogMetadata(result, restCustomerId),
      });
      const refreshedSettingsData = await refreshRepositoryCustomersAfterMutation(
        workflowDirectoryRepository,
        currentUser,
        logger,
        {
          route: `PATCH /api/customers/${restCustomerId}`,
          mariaDbOperation: isDeactivate ? "deleteSavedCustomer" : "upsertSavedCustomer",
        },
      );
      sendJson(req, res, 200, {
        customers: refreshedSettingsData.customers,
        mutation: result?.mutation,
      });
      return true;
    }

    if (
      req.method === "POST" &&
      requestUrl.pathname === "/api/customer-assignments" &&
      workflowDirectoryRepository
    ) {
      const sessionState = await requireDirectorySessionState(
        store,
        workflowDirectoryRepository,
        authProvider,
        sessionId,
      );
      const currentUser = requireSessionCapability(
        sessionState.summary,
        "manage_customer_ownership",
      );
      const customerId = getCustomerAssignmentCustomerId(body, "");
      const existingCustomers = await workflowDirectoryRepository.listSavedCustomersForUser(
        currentUser,
      );
      const existingCustomer = existingCustomers.find((customer) => customer.id === customerId);

      if (!existingCustomer) {
        throw new Error("Customer not found.");
      }

      logSettingsMutationStarted(logger, {
        route: "POST /api/customer-assignments",
        mariaDbOperation: "upsertSavedCustomerAssignments",
        payload: body,
      });
      logger?.info?.("settings-mutation", "MariaDB mutation route called.", {
        route: "POST /api/customer-assignments",
        mariaDbOperation: "upsertSavedCustomerAssignments",
        customerId,
      });
      const result = await workflowDirectoryRepository.upsertSavedCustomer(
        {
          ...existingCustomer,
          assignedCSRs: getCustomerAssignmentDraft(body, "", existingCustomer),
        },
        currentUser,
      );
      logSettingsMutationCompleted(logger, {
        route: "POST /api/customer-assignments",
        mariaDbOperation: "upsertSavedCustomerAssignments",
        payload: result,
        entityKeys: ["assignment", "customerAssignment"],
        fallbackId: customerId,
      });
      logger?.info?.("settings-mutation", "MariaDB mutation route completed.", {
        route: "POST /api/customer-assignments",
        mariaDbOperation: "upsertSavedCustomerAssignments",
        ...getRepositoryMutationLogMetadata(result, customerId),
      });
      const refreshedSettingsData = await refreshRepositoryCustomersAfterMutation(
        workflowDirectoryRepository,
        currentUser,
        logger,
        {
          route: "POST /api/customer-assignments",
          mariaDbOperation: "upsertSavedCustomerAssignments",
        },
      );
      sendJson(req, res, 200, {
        customers: refreshedSettingsData.customers,
        assignments: refreshedSettingsData.assignments,
        mutation: result?.mutation,
      });
      return true;
    }

    const restAssignmentId = matchRestResourcePath(
      requestUrl.pathname,
      "customer-assignments",
    );

    if (req.method === "PATCH" && restAssignmentId && workflowDirectoryRepository) {
      const sessionState = await requireDirectorySessionState(
        store,
        workflowDirectoryRepository,
        authProvider,
        sessionId,
      );
      const currentUser = requireSessionCapability(
        sessionState.summary,
        "manage_customer_ownership",
      );
      const customerId = getCustomerAssignmentCustomerId(body, restAssignmentId);
      const existingCustomers = await workflowDirectoryRepository.listSavedCustomersForUser(
        currentUser,
      );
      const existingCustomer = existingCustomers.find((customer) => customer.id === customerId);

      if (!existingCustomer) {
        throw new Error("Customer not found.");
      }

      logSettingsMutationStarted(logger, {
        route: `PATCH /api/customer-assignments/${restAssignmentId}`,
        mariaDbOperation: "upsertSavedCustomerAssignments",
        payload: body,
      });
      logger?.info?.("settings-mutation", "MariaDB mutation route called.", {
        route: `PATCH /api/customer-assignments/${restAssignmentId}`,
        mariaDbOperation: "upsertSavedCustomerAssignments",
        customerId,
      });
      const result = await workflowDirectoryRepository.upsertSavedCustomer(
        {
          ...existingCustomer,
          assignedCSRs: getCustomerAssignmentDraft(
            body,
            restAssignmentId,
            existingCustomer,
          ),
        },
        currentUser,
      );
      logSettingsMutationCompleted(logger, {
        route: `PATCH /api/customer-assignments/${restAssignmentId}`,
        mariaDbOperation: "upsertSavedCustomerAssignments",
        payload: result,
        entityKeys: ["assignment", "customerAssignment"],
        fallbackId: restAssignmentId,
      });
      logger?.info?.("settings-mutation", "MariaDB mutation route completed.", {
        route: `PATCH /api/customer-assignments/${restAssignmentId}`,
        mariaDbOperation: "upsertSavedCustomerAssignments",
        ...getRepositoryMutationLogMetadata(result, restAssignmentId),
      });
      const refreshedSettingsData = await refreshRepositoryCustomersAfterMutation(
        workflowDirectoryRepository,
        currentUser,
        logger,
        {
          route: `PATCH /api/customer-assignments/${restAssignmentId}`,
          mariaDbOperation: "upsertSavedCustomerAssignments",
        },
      );
      sendJson(req, res, 200, {
        customers: refreshedSettingsData.customers,
        assignments: refreshedSettingsData.assignments,
        mutation: result?.mutation,
      });
      return true;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/health") {
      if (workflowDirectoryRepository) {
        const sessionState = await getDirectorySessionState(
          store,
          workflowDirectoryRepository,
          sessionId,
        );
        const baseHealth = store.getHealth(sessionId);
        const counts = await workflowDirectoryRepository.getDirectoryCounts(
          sessionState.summary.currentUser,
        );
        sendJson(req, res, 200, {
          ...baseHealth,
          databaseReady: counts.databaseReady,
          databasePath: "Directory repository",
          sqliteDatabasePath: baseHealth.databasePath,
          currentUser: sessionState.summary.currentUser,
          repCount: counts.csrCount,
          customerCount: counts.customerCount,
          assignmentCount: counts.assignmentCount,
        });
        return true;
      }

      sendJson(req, res, 200, store.getHealth(sessionId));
      return true;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/workflow/bootstrap") {
      if (workflowDirectoryRepository) {
        const sessionState = await requireDirectorySessionState(
          store,
          workflowDirectoryRepository,
          authProvider,
          sessionId,
        );
        sendJson(
          req,
          res,
          200,
          await getDirectoryBootstrap(
            store,
            workflowDirectoryRepository,
            sessionState.summary,
          ),
        );
        return true;
      }

      sendJson(req, res, 200, store.getBootstrap(sessionId));
      return true;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/workflow/thread-presence") {
      store.requireCurrentUser(sessionId);
      sendJson(req, res, 200, { threadPresence: store.listThreadPresence() });
      return true;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/admin/users") {
      if (workflowDirectoryRepository) {
        const sessionState = await requireDirectorySessionState(
          store,
          workflowDirectoryRepository,
          authProvider,
          sessionId,
        );
        requireSessionCapability(sessionState.summary, "manage_users");
        sendJson(req, res, 200, {
          users: await workflowDirectoryRepository.listManagedUsers({
            includeInactive: true,
          }),
        });
        return true;
      }

      sendJson(req, res, 200, { users: store.listUsers(sessionId) });
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/admin/users/create") {
      if (workflowDirectoryRepository) {
        const sessionState = await requireDirectorySessionState(
          store,
          workflowDirectoryRepository,
          authProvider,
          sessionId,
        );
        requireSessionCapability(sessionState.summary, "manage_users");
        logSettingsMutationStarted(logger, {
          route: "POST /api/admin/users/create",
          mariaDbOperation: "createManagedUser",
          payload: body,
        });
        logger?.info?.("settings-mutation", "MariaDB mutation route called.", {
          route: "POST /api/admin/users/create",
          mariaDbOperation: "createManagedUser",
        });
        const result = await workflowDirectoryRepository.createManagedUser(body);
        logSettingsMutationCompleted(logger, {
          route: "POST /api/admin/users/create",
          mariaDbOperation: "createManagedUser",
          payload: result,
          entityKeys: ["user", "employee"],
        });
        logger?.info?.("settings-mutation", "MariaDB mutation route completed.", {
          route: "POST /api/admin/users/create",
          mariaDbOperation: "createManagedUser",
          ...getRepositoryMutationLogMetadata(result),
        });
        const users = await refreshRepositoryUsersAfterMutation(
          workflowDirectoryRepository,
          logger,
          {
            route: "POST /api/admin/users/create",
            mariaDbOperation: "createManagedUser",
          },
        );
        sendJson(req, res, 200, { users, mutation: result?.mutation });
        return true;
      }

      sendJson(req, res, 200, { users: store.createUser(sessionId, body) });
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/admin/users/update") {
      if (workflowDirectoryRepository) {
        const sessionState = await requireDirectorySessionState(
          store,
          workflowDirectoryRepository,
          authProvider,
          sessionId,
        );
        requireSessionCapability(sessionState.summary, "manage_users");
        logSettingsMutationStarted(logger, {
          route: "POST /api/admin/users/update",
          mariaDbOperation: "updateManagedUser",
          payload: body,
        });
        logger?.info?.("settings-mutation", "MariaDB mutation route called.", {
          route: "POST /api/admin/users/update",
          mariaDbOperation: "updateManagedUser",
        });
        const result = await workflowDirectoryRepository.updateManagedUser(body);
        invalidateChangedUserSessions(store, result);
        logSettingsMutationCompleted(logger, {
          route: "POST /api/admin/users/update",
          mariaDbOperation: "updateManagedUser",
          payload: result,
          entityKeys: ["user", "employee"],
          fallbackId: body.userId,
        });
        logger?.info?.("settings-mutation", "MariaDB mutation route completed.", {
          route: "POST /api/admin/users/update",
          mariaDbOperation: "updateManagedUser",
          ...getRepositoryMutationLogMetadata(result, body.userId),
        });
        const users = await refreshRepositoryUsersAfterMutation(
          workflowDirectoryRepository,
          logger,
          {
            route: "POST /api/admin/users/update",
            mariaDbOperation: "updateManagedUser",
          },
        );
        sendJson(req, res, 200, { users, mutation: result?.mutation });
        return true;
      }

      sendJson(req, res, 200, { users: store.updateUser(sessionId, body) });
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/admin/users/deactivate") {
      if (workflowDirectoryRepository) {
        const sessionState = await requireDirectorySessionState(
          store,
          workflowDirectoryRepository,
          authProvider,
          sessionId,
        );
        requireSessionCapability(sessionState.summary, "manage_users");
        logSettingsMutationStarted(logger, {
          route: "POST /api/admin/users/deactivate",
          mariaDbOperation: "deactivateManagedUser",
          payload: body,
        });
        logger?.info?.("settings-mutation", "MariaDB mutation route called.", {
          route: "POST /api/admin/users/deactivate",
          mariaDbOperation: "deactivateManagedUser",
        });
        const result = await workflowDirectoryRepository.deactivateManagedUser(body.userId);
        invalidateChangedUserSessions(store, result);
        logSettingsMutationCompleted(logger, {
          route: "POST /api/admin/users/deactivate",
          mariaDbOperation: "deactivateManagedUser",
          payload: result,
          entityKeys: ["user", "employee"],
          fallbackId: body.userId,
        });
        logger?.info?.("settings-mutation", "MariaDB mutation route completed.", {
          route: "POST /api/admin/users/deactivate",
          mariaDbOperation: "deactivateManagedUser",
          ...getRepositoryMutationLogMetadata(result, body.userId),
        });
        const users = await refreshRepositoryUsersAfterMutation(
          workflowDirectoryRepository,
          logger,
          {
            route: "POST /api/admin/users/deactivate",
            mariaDbOperation: "deactivateManagedUser",
          },
        );
        sendJson(req, res, 200, { users, mutation: result?.mutation });
        return true;
      }

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
      if (workflowDirectoryRepository) {
        const sessionState = await requireDirectorySessionState(
          store,
          workflowDirectoryRepository,
          authProvider,
          sessionId,
        );
        const currentUser = requireSessionCapability(
          sessionState.summary,
          "manage_customer_ownership",
        );
        logSettingsMutationStarted(logger, {
          route: "POST /api/workflow/customers/upsert",
          mariaDbOperation: "upsertSavedCustomer",
          payload: body.customer,
        });
        logger?.info?.("settings-mutation", "MariaDB mutation route called.", {
          route: "POST /api/workflow/customers/upsert",
          mariaDbOperation: "upsertSavedCustomer",
        });
        const result = await workflowDirectoryRepository.upsertSavedCustomer(
          body.customer,
          currentUser,
        );
        logSettingsMutationCompleted(logger, {
          route: "POST /api/workflow/customers/upsert",
          mariaDbOperation: "upsertSavedCustomer",
          payload: result,
          entityKeys: ["customer"],
          fallbackId: body.customer?.id,
        });
        logger?.info?.("settings-mutation", "MariaDB mutation route completed.", {
          route: "POST /api/workflow/customers/upsert",
          mariaDbOperation: "upsertSavedCustomer",
          ...getRepositoryMutationLogMetadata(result, body.customer?.id),
        });
        const refreshedSettingsData = await refreshRepositoryCustomersAfterMutation(
          workflowDirectoryRepository,
          currentUser,
          logger,
          {
            route: "POST /api/workflow/customers/upsert",
            mariaDbOperation: "upsertSavedCustomer",
          },
        );
        sendJson(req, res, 200, {
          customers: refreshedSettingsData.customers,
          mutation: result?.mutation,
        });
        return true;
      }

      const customers = store.upsertCustomer(sessionId, body.customer);
      sendJson(req, res, 200, { customers });
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/workflow/customers/delete") {
      if (workflowDirectoryRepository) {
        const sessionState = await requireDirectorySessionState(
          store,
          workflowDirectoryRepository,
          authProvider,
          sessionId,
        );
        const currentUser = requireSessionCapability(
          sessionState.summary,
          "manage_customer_ownership",
        );
        logSettingsMutationStarted(logger, {
          route: "POST /api/workflow/customers/delete",
          mariaDbOperation: "deleteSavedCustomer",
          payload: body,
        });
        logger?.info?.("settings-mutation", "MariaDB mutation route called.", {
          route: "POST /api/workflow/customers/delete",
          mariaDbOperation: "deleteSavedCustomer",
        });
        const result = await workflowDirectoryRepository.deleteSavedCustomer(
          body.customerId,
          currentUser,
        );
        logSettingsMutationCompleted(logger, {
          route: "POST /api/workflow/customers/delete",
          mariaDbOperation: "deleteSavedCustomer",
          payload: result,
          entityKeys: ["customer"],
          fallbackId: body.customerId,
        });
        logger?.info?.("settings-mutation", "MariaDB mutation route completed.", {
          route: "POST /api/workflow/customers/delete",
          mariaDbOperation: "deleteSavedCustomer",
          ...getRepositoryMutationLogMetadata(result, body.customerId),
        });
        const refreshedSettingsData = await refreshRepositoryCustomersAfterMutation(
          workflowDirectoryRepository,
          currentUser,
          logger,
          {
            route: "POST /api/workflow/customers/delete",
            mariaDbOperation: "deleteSavedCustomer",
          },
        );
        sendJson(req, res, 200, {
          customers: refreshedSettingsData.customers,
          mutation: result?.mutation,
        });
        return true;
      }

      const customers = store.deleteCustomer(sessionId, body.customerId);
      sendJson(req, res, 200, { customers });
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/workflow/customers/clear") {
      if (workflowDirectoryRepository) {
        const sessionState = await requireDirectorySessionState(
          store,
          workflowDirectoryRepository,
          authProvider,
          sessionId,
        );
        const currentUser = requireSessionCapability(
          sessionState.summary,
          "manage_customer_ownership",
        );
        logSettingsMutationStarted(logger, {
          route: "POST /api/workflow/customers/clear",
          mariaDbOperation: "clearSavedCustomers",
          payload: body,
        });
        logger?.info?.("settings-mutation", "MariaDB mutation route called.", {
          route: "POST /api/workflow/customers/clear",
          mariaDbOperation: "clearSavedCustomers",
        });
        const result = await workflowDirectoryRepository.clearSavedCustomers(
          currentUser,
        );
        logSettingsMutationCompleted(logger, {
          route: "POST /api/workflow/customers/clear",
          mariaDbOperation: "clearSavedCustomers",
          payload: result,
          entityKeys: ["customer"],
        });
        logger?.info?.("settings-mutation", "MariaDB mutation route completed.", {
          route: "POST /api/workflow/customers/clear",
          mariaDbOperation: "clearSavedCustomers",
          ...getRepositoryMutationLogMetadata(result),
        });
        const refreshedSettingsData = await refreshRepositoryCustomersAfterMutation(
          workflowDirectoryRepository,
          currentUser,
          logger,
          {
            route: "POST /api/workflow/customers/clear",
            mariaDbOperation: "clearSavedCustomers",
          },
        );
        sendJson(req, res, 200, {
          customers: refreshedSettingsData.customers,
          mutation: result?.mutation,
        });
        return true;
      }

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
  const workflowDirectoryRepository = options.workflowDirectoryRepository ?? null;
  const backendApi = options.backendApi ?? null;
  const handleWorkflowRoute = createWorkflowRouteHandler(
    store,
    logger,
    workflowDirectoryRepository,
    authProvider,
    backendApi,
  );
  const webhookStore =
    options.webhookStore ??
    createOutlookWebhookStore(
      options.webhookStorePath ?? getOutlookWebhookStatePath(options.databasePath),
    );
  const outlookContext = {
    authProvider,
    logger,
    processIncomingEmail: options.processIncomingEmail,
    subscriptionAuthSessions: new Map(),
    webhookStore,
  };

  return async (req, res) => {
    if (!req.url || !req.method) {
      sendJson(req, res, 400, { error: "Invalid desktop app request." });
      return;
    }

    const requestUrl = new URL(req.url, "http://localhost");

    if (rejectDisallowedCorsOrigin(req, res)) {
      return;
    }

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

    if (requestUrl.pathname.startsWith("/api/outlook/")) {
      try {
        const handled = await handleOutlookRoute(req, res, requestUrl, outlookContext);

        if (!handled) {
          sendApiError(req, res, 404, {
            code: "route_not_found",
            message: "API route not found.",
            context: requestUrl.pathname,
          });
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Outlook webhook request failed.";
        const authErrorCodes = new Set([
          "microsoft_token_context_missing",
          "microsoft_session_expired",
          "microsoft_auth_required",
        ]);
        const statusCode = Number.isInteger(error?.statusCode)
          ? error.statusCode
          : authErrorCodes.has(String(error?.code || ""))
            ? 401
            : 400;
        logger.error("outlook-webhook", "Outlook webhook API request failed.", {
          path: requestUrl.pathname,
          method: req.method,
          error: message,
        });
        sendApiError(req, res, statusCode, {
          code: error?.code ?? "outlook_webhook_request_failed",
          message,
          retryable: statusCode >= 500,
          context: requestUrl.pathname,
        });
      }
      return;
    }

    if (requestUrl.pathname === "/api/ai/classify-email") {
      await handleAiClassificationRoute(req, res, logger, backendApi);
      return;
    }

    if (requestUrl.pathname === "/api/ai/draft-reply") {
      await handleAiReplyDraftRoute(req, res, logger, backendApi);
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
        const explicitStatusCode = Number.isInteger(error?.statusCode)
          ? error.statusCode
          : undefined;
        const unauthorized =
          message === "You must sign in before using the shared workflow.";
        const forbidden =
          message === "Only supervisors can create backups." ||
          message === "You are not allowed to perform this action.";
        sendApiError(req, res, explicitStatusCode ?? (unauthorized ? 401 : forbidden ? 403 : 400), {
          code: error?.code ?? (unauthorized
            ? "auth_required"
            : forbidden
              ? "forbidden"
              : "request_failed"),
          message,
          retryable: !explicitStatusCode && !unauthorized && !forbidden,
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
  const workflowDirectoryRepository = options.workflowDirectoryRepository ?? null;
  const server = http.createServer(
    createRequestHandler({
      ...options,
      store,
      logger,
      authProvider: options.authProvider,
      workflowDirectoryRepository,
    }),
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
      logRegisteredMutationRoutes(logger, {
        backendApiEnabled: hasBackendApi(options.backendApi),
        workflowDirectoryRepositoryEnabled: Boolean(workflowDirectoryRepository),
      });
      resolve();
    });
  });

  return {
    origin: `http://${host}:${port}`,
    logger,
    store,
    workflowDirectoryRepository,
    startSessionForIdentity: (sessionId, identity) =>
      startDirectoryBackedSession(
        store,
        workflowDirectoryRepository,
        sessionId,
        identity,
      ),
    close: () => closeServer(server),
  };
}

module.exports = {
  createRequestHandler,
  loadDefaultWorkflowDirectoryRepository,
  startDesktopAppServer,
};
