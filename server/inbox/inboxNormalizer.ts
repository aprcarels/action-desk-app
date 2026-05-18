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
  sentDateTime?: string;
  webLink?: string;
  bodyPreview?: string;
  hasAttachments?: boolean;
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

type MissingBodyReason =
  | "graphBodyMissing"
  | "htmlBodyEmptyAfterStrip"
  | "attachmentOnlyMessage";

type BodyNormalizationResult = {
  bodyText: string;
  missingBodyReason?: MissingBodyReason;
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

function normalizeBodyText(
  body?: GraphMessage["body"],
  bodyPreview?: string,
  hasAttachments?: boolean,
): BodyNormalizationResult {
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
      return { bodyText: normalizedBody };
    }

    return {
      bodyText: previewText,
      missingBodyReason:
        isHtmlBody && previewText.length === 0
          ? "htmlBodyEmptyAfterStrip"
          : undefined,
    };
  }

  if (previewText.length > 0) {
    return { bodyText: previewText };
  }

  return {
    bodyText: "",
    missingBodyReason:
      hasAttachments === true ? "attachmentOnlyMessage" : "graphBodyMissing",
  };
}

function normalizeReceivedAt(receivedDateTime?: string): string {
  const normalized = receivedDateTime?.trim() ?? "";

  if (!normalized) {
    return "";
  }

  const timestamp = Date.parse(normalized);

  return Number.isNaN(timestamp) ? normalized : new Date(timestamp).toISOString();
}

function normalizeSentAt(sentDateTime?: string): string | undefined {
  const normalized = sentDateTime?.trim() ?? "";

  if (!normalized) {
    return undefined;
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

function logMissingBodyReason(message: GraphMessage, reason?: MissingBodyReason) {
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

function mapGraphMessageToRawInboxEmail(message: GraphMessage): RawInboxEmail {
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
