import { getAccessToken } from "../auth/getAccessToken";
import type {
  EmailSourceListResult,
  InboxProvider,
  RawInboxEmail,
  RawInboxEmailHeader,
} from "../types/inboxSource";
import {
  getExpiredMicrosoftSessionMessage,
  getSharedSessionExpiredEventName,
} from "./sharedWorkflowApi";

type FetchInboxPageOptions = {
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
  interactiveAuth?: boolean;
};

const INVALID_INBOX_API_RESPONSE_ERROR = "Invalid inbox API response.";
const SHARED_SESSION_STORAGE_KEY = "action-desk.shared-session-id";

function clearStoredSession() {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  window.localStorage.removeItem(SHARED_SESSION_STORAGE_KEY);
}

function dispatchSessionExpired() {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(getSharedSessionExpiredEventName(), {
      detail: {
        message: getExpiredMicrosoftSessionMessage(),
      },
    }),
  );
}

function isInboxProvider(value: unknown): value is InboxProvider {
  return (
    value === "dev_json" ||
    value === "outlook_graph" ||
    value === "outlook_addin_import" ||
    value === "test_data"
  );
}

function isRawInboxEmailHeader(value: unknown): value is RawInboxEmailHeader {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return typeof candidate.name === "string" && typeof candidate.value === "string";
}

function isRawInboxEmail(value: unknown): value is RawInboxEmail {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    candidate.id.trim().length > 0 &&
    typeof candidate.externalId === "string" &&
    candidate.externalId.trim().length > 0 &&
    isInboxProvider(candidate.provider) &&
    typeof candidate.subject === "string" &&
    typeof candidate.fromName === "string" &&
    typeof candidate.fromEmail === "string" &&
    typeof candidate.receivedAt === "string" &&
    typeof candidate.bodyText === "string" &&
    (candidate.threadId === undefined || typeof candidate.threadId === "string") &&
    (candidate.locationId === undefined || typeof candidate.locationId === "string") &&
    (candidate.bodyHtml === undefined || typeof candidate.bodyHtml === "string") &&
    (candidate.previewText === undefined || typeof candidate.previewText === "string") &&
    (candidate.outlookWebLink === undefined ||
      typeof candidate.outlookWebLink === "string") &&
    (candidate.toRecipients === undefined ||
      (Array.isArray(candidate.toRecipients) &&
        candidate.toRecipients.every((recipient) => typeof recipient === "string"))) &&
    (candidate.ccRecipients === undefined ||
      (Array.isArray(candidate.ccRecipients) &&
        candidate.ccRecipients.every((recipient) => typeof recipient === "string"))) &&
    (candidate.internetMessageHeaders === undefined ||
      (Array.isArray(candidate.internetMessageHeaders) &&
        candidate.internetMessageHeaders.every(isRawInboxEmailHeader)))
  );
}

function normalizeInboxApiResponse(payload: unknown): EmailSourceListResult {
  if (!payload || typeof payload !== "object") {
    throw new Error(INVALID_INBOX_API_RESPONSE_ERROR);
  }

  const candidate = payload as Record<string, unknown>;
  const emails = candidate.emails;

  if (!Array.isArray(emails) || !emails.every(isRawInboxEmail)) {
    throw new Error(INVALID_INBOX_API_RESPONSE_ERROR);
  }

  if (candidate.nextCursor !== undefined && typeof candidate.nextCursor !== "string") {
    throw new Error(INVALID_INBOX_API_RESPONSE_ERROR);
  }

  return {
    emails,
    nextCursor: typeof candidate.nextCursor === "string" ? candidate.nextCursor : undefined,
  };
}

export async function fetchInboxPage(
  options?: FetchInboxPageOptions,
): Promise<EmailSourceListResult> {
  const isElectron = Boolean(window.actionDeskDesktop?.isElectron);
  const url = new URL(
    "/api/inbox/messages",
    isElectron ? "http://localhost:3960" : window.location.origin,
  );

  if (options?.cursor) {
    url.searchParams.set("cursor", options.cursor);
  }

  if (typeof options?.limit === "number" && options.limit > 0) {
    url.searchParams.set("limit", String(Math.floor(options.limit)));
  }

  if (options?.interactiveAuth === true) {
    url.searchParams.set("interactiveAuth", "true");
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (!isElectron) {
    const accessToken = await getAccessToken({
      interactive: options?.interactiveAuth === true,
    });

    headers.Authorization = `Bearer ${accessToken}`;
  } else {
    const sessionId = window.localStorage.getItem(SHARED_SESSION_STORAGE_KEY);

    if (sessionId) {
      headers["x-action-desk-session-id"] = sessionId;
    }
  }

  const response = await fetch(url, {
    method: "GET",
    headers,
    signal: options?.signal,
  });

  if (!response.ok) {
    let errorDetail = "";
    let errorCode = "";

    try {
      const payload = (await response.json()) as {
        error?:
          | string
          | {
              code?: unknown;
              message?: unknown;
            };
      };
      if (typeof payload.error === "string") {
        errorDetail = payload.error;
      } else if (payload.error && typeof payload.error === "object") {
        errorDetail =
          typeof payload.error.message === "string" ? payload.error.message : "";
        errorCode = typeof payload.error.code === "string" ? payload.error.code : "";
      }
    } catch {
      errorDetail = "";
    }

    if (
      errorCode === "microsoft_session_missing" ||
      errorCode === "microsoft_session_expired" ||
      errorCode === "stale_microsoft_session"
    ) {
      clearStoredSession();
      dispatchSessionExpired();
    }

    const error = new Error(
      errorDetail || `Inbox API request failed with status ${response.status}.`,
    ) as Error & { code?: string };
    error.code = errorCode || undefined;
    throw error;
  }

  const payload: unknown = await response.json();
  return normalizeInboxApiResponse(payload);
}
