import { getAccessToken } from "../auth/getAccessToken";
import type { EmailSourceListResult, InboxProvider, RawInboxEmail } from "../types/inboxSource";

type FetchInboxPageOptions = {
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
  interactiveAuth?: boolean;
};

const INVALID_INBOX_API_RESPONSE_ERROR = "Invalid inbox API response.";

function isInboxProvider(value: unknown): value is InboxProvider {
  return value === "dev_json" || value === "outlook_graph" || value === "outlook_addin_import";
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
    (candidate.bodyHtml === undefined || typeof candidate.bodyHtml === "string") &&
    (candidate.previewText === undefined || typeof candidate.previewText === "string")
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
  const accessToken = await getAccessToken({
    interactive: options?.interactiveAuth === true,
  });
  const url = new URL("/api/inbox/messages", window.location.origin);

  if (options?.cursor) {
    url.searchParams.set("cursor", options.cursor);
  }

  if (typeof options?.limit === "number" && options.limit > 0) {
    url.searchParams.set("limit", String(Math.floor(options.limit)));
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    signal: options?.signal,
  });

  if (!response.ok) {
    let errorDetail = "";

    try {
      const payload = (await response.json()) as { error?: unknown };
      errorDetail = typeof payload.error === "string" ? payload.error : "";
    } catch {
      errorDetail = "";
    }

    throw new Error(
      errorDetail || `Inbox API request failed with status ${response.status}.`,
    );
  }

  const payload: unknown = await response.json();
  return normalizeInboxApiResponse(payload);
}
