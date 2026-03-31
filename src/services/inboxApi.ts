import type { EmailSourceListResult, RawInboxEmail } from "../types/inboxSource";

type FetchInboxPageOptions = {
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
};

const INVALID_INBOX_API_RESPONSE_ERROR = "Invalid inbox API response.";

function isRawInboxEmail(value: unknown): value is RawInboxEmail {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.subject === "string" &&
    typeof candidate.fromName === "string" &&
    typeof candidate.fromEmail === "string" &&
    typeof candidate.receivedAt === "string" &&
    typeof candidate.bodyText === "string" &&
    typeof candidate.provider === "string" &&
    (candidate.threadId === undefined || typeof candidate.threadId === "string") &&
    (candidate.bodyHtml === undefined || typeof candidate.bodyHtml === "string")
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

  if (
    candidate.nextCursor !== undefined &&
    typeof candidate.nextCursor !== "string"
  ) {
    throw new Error(INVALID_INBOX_API_RESPONSE_ERROR);
  }

  const nextCursor =
    typeof candidate.nextCursor === "string" ? candidate.nextCursor : undefined;

  return {
    emails,
    nextCursor,
  };
}

export async function fetchInboxPage(
  options?: FetchInboxPageOptions,
): Promise<EmailSourceListResult> {
  const url = new URL("/api/inbox", window.location.origin);

  if (options?.cursor) {
    url.searchParams.set("cursor", options.cursor);
  }

  if (typeof options?.limit === "number") {
    url.searchParams.set("limit", String(options.limit));
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new Error(`Inbox API request failed with status ${response.status}.`);
  }

  const payload: unknown = await response.json();
  return normalizeInboxApiResponse(payload);
}
