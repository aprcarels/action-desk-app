import type {
  EmailSourceListResult,
  RawInboxEmail,
  RawInboxEmailHeader,
} from "../../src/types/inboxSource";

const INVALID_GRAPH_RESPONSE_ERROR = "Invalid Outlook Graph inbox response.";

type GraphMessage = {
  id?: string;
  conversationId?: string;
  subject?: string;
  receivedDateTime?: string;
  webLink?: string;
  bodyPreview?: string;
  body?: {
    contentType?: string;
    content?: string;
  };
  toRecipients?: Array<{
    emailAddress?: {
      name?: string;
      address?: string;
    };
  }>;
  ccRecipients?: Array<{
    emailAddress?: {
      name?: string;
      address?: string;
    };
  }>;
  internetMessageHeaders?: Array<{
    name?: string;
    value?: string;
  }>;
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

export function normalizeGraphNextCursor(nextLink?: string): string | undefined {
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

function normalizeText(value?: string): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function stripHtml(html: string): string {
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

function normalizeBodyText(body?: GraphMessage["body"], bodyPreview?: string): string {
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

function normalizeReceivedAt(receivedDateTime?: string): string {
  const normalized = receivedDateTime?.trim() ?? "";

  if (!normalized) {
    return "";
  }

  const timestamp = Date.parse(normalized);

  return Number.isNaN(timestamp) ? normalized : new Date(timestamp).toISOString();
}

function normalizePreviewText(bodyPreview?: string, bodyText?: string): string | undefined {
  const candidate = normalizeText(bodyPreview) || normalizeText(bodyText);

  return candidate && candidate.length > 0 ? candidate : undefined;
}

function normalizeRecipients(
  recipients?: GraphMessage["toRecipients"],
): string[] | undefined {
  const normalizedRecipients =
    recipients
      ?.map((recipient) => recipient.emailAddress?.address?.trim() || "")
      .filter((recipient) => recipient.length > 0) ?? [];

  return normalizedRecipients.length > 0 ? normalizedRecipients : undefined;
}

function normalizeHeaders(
  headers?: GraphMessage["internetMessageHeaders"],
): RawInboxEmailHeader[] | undefined {
  const normalizedHeaders =
    headers
      ?.map((header) => ({
        name: header.name?.trim() || "",
        value: header.value?.trim() || "",
      }))
      .filter((header) => header.name.length > 0 || header.value.length > 0) ?? [];

  return normalizedHeaders.length > 0 ? normalizedHeaders : undefined;
}

function mapGraphMessageToRawInboxEmail(message: GraphMessage): RawInboxEmail {
  const id = message.id?.trim() || "";
  const bodyText = normalizeBodyText(message.body, message.bodyPreview);
  const fromEmail = message.from?.emailAddress?.address?.trim() || "";
  const fromName = message.from?.emailAddress?.name?.trim() || fromEmail || "Unknown sender";

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
    toRecipients: normalizeRecipients(message.toRecipients),
    ccRecipients: normalizeRecipients(message.ccRecipients),
    internetMessageHeaders: normalizeHeaders(message.internetMessageHeaders),
  };
}

export function normalizeGraphMessagesResponse(payload: unknown): EmailSourceListResult {
  if (!payload || typeof payload !== "object") {
    throw new Error(INVALID_GRAPH_RESPONSE_ERROR);
  }

  const candidate = payload as GraphMessagesResponse;

  if (!Array.isArray(candidate.value)) {
    throw new Error(INVALID_GRAPH_RESPONSE_ERROR);
  }

  return {
    emails: candidate.value.map(mapGraphMessageToRawInboxEmail),
    nextCursor: normalizeGraphNextCursor(candidate["@odata.nextLink"]),
  };
}
