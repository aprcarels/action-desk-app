import { getAccessToken } from "../auth/getAccessToken";
import type { EmailSourceListResult, RawInboxEmail } from "../types/inboxSource";

type FetchInboxPageOptions = {
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
};

const INVALID_INBOX_API_RESPONSE_ERROR = "Invalid inbox API response.";
const GRAPH_INBOX_PAGE_SIZE = 25;

type GraphMessage = {
  id?: string;
  conversationId?: string;
  subject?: string;
  receivedDateTime?: string;
  bodyPreview?: string;
  body?: {
    content?: string;
  };
  from?: {
    emailAddress?: {
      name?: string;
      address?: string;
    };
  };
};

type GraphMessagesResponse = {
  value?: GraphMessage[];
  "@odata.nextLink"?: string;
};

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

function buildGraphMessagesPath(cursor?: string) {
  if (cursor) {
    return cursor.startsWith("/") ? cursor : `/${cursor}`;
  }

  const searchParams = new URLSearchParams({
    "$top": String(GRAPH_INBOX_PAGE_SIZE),
    "$orderby": "receivedDateTime desc",
    "$select": "id,conversationId,subject,from,receivedDateTime,bodyPreview,body",
  });

  return `/me/messages?${searchParams.toString()}`;
}

function normalizeGraphNextCursor(nextLink?: string): string | undefined {
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

function normalizeGraphMessagesResponse(payload: unknown): EmailSourceListResult {
  if (!payload || typeof payload !== "object") {
    throw new Error(INVALID_INBOX_API_RESPONSE_ERROR);
  }

  const candidate = payload as GraphMessagesResponse;

  if (!Array.isArray(candidate.value)) {
    throw new Error(INVALID_INBOX_API_RESPONSE_ERROR);
  }

  const emails: RawInboxEmail[] = candidate.value.map((message) => ({
    id: message.id ?? "",
    threadId: message.conversationId,
    subject: message.subject?.trim() || "(no subject)",
    fromName: message.from?.emailAddress?.name?.trim() || "",
    fromEmail: message.from?.emailAddress?.address?.trim() || "",
    receivedAt: message.receivedDateTime ?? "",
    bodyText: message.bodyPreview?.trim() || "",
    bodyHtml: message.body?.content,
    provider: "outlook_graph",
  }));

  const normalized = normalizeInboxApiResponse({
    emails,
    nextCursor: normalizeGraphNextCursor(candidate["@odata.nextLink"]),
  });

  return normalized;
}

export async function fetchInboxPage(
  options?: FetchInboxPageOptions,
): Promise<EmailSourceListResult> {
  const accessToken = await getAccessToken();
  const graphPath = buildGraphMessagesPath(options?.cursor);
  const url = new URL(`/api/graph${graphPath}`, window.location.origin);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new Error(`Inbox API request failed with status ${response.status}.`);
  }

  const payload: unknown = await response.json();
  return normalizeGraphMessagesResponse(payload);
}
