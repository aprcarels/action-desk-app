const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { SharedWorkflowStore } = require("./sharedWorkflowStore.cjs");
const { createLogger } = require("./logger.cjs");

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = 3960;
const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const DEFAULT_INBOX_PAGE_SIZE = 25;
const DEFAULT_OUTLOOK_WEBHOOK_RESOURCE = "/me/mailFolders('Inbox')/messages";
const OUTLOOK_WEBHOOK_EXPIRATION_MS = (6 * 24 * 60 - 10) * 60 * 1000;
const OUTLOOK_WEBHOOK_SELECT_FIELDS =
  "id,conversationId,subject,from,receivedDateTime,bodyPreview,body,webLink,toRecipients,ccRecipients,internetMessageHeaders";
const MAX_STORED_OUTLOOK_NOTIFICATIONS = 100;
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
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
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
  return (
    requestUrl.searchParams.get("sessionId") ??
    body?.sessionId ??
    req.headers["x-action-desk-session-id"]
  );
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

  const accessToken = await authProvider.getAccessTokenForSession(
    sessionId,
    { interactive: false },
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
    const accessToken = await context.authProvider.getAccessTokenForSession(
      sessionId,
      { interactive: false },
      context.logger,
    );
    return `Bearer ${accessToken}`;
  }

  if (context.authProvider?.getAccessTokenForAvailableSession) {
    const accessToken = await context.authProvider.getAccessTokenForAvailableSession(
      { interactive: false },
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

  try {
    return require("../dist-electron/repositories/mariadb/ticketIngestionRepository")
      .processIncomingEmail;
  } catch (error) {
    throw new Error(
      "Outlook webhook ingestion bridge is unavailable. Run npm run build:electron before processing webhook messages.",
    );
  }
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
        const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 400;
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
