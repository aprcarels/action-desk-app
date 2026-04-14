import type { MailboxMessage, MailboxSource } from "../domain";
import type { RawInboxEmail } from "../types/inboxSource";

function mapInboxProviderToMailboxSource(
  provider: RawInboxEmail["provider"],
): MailboxSource {
  switch (provider) {
    case "outlook_graph":
      return "outlook_graph";
    case "outlook_addin_import":
      return "imported";
    case "dev_json":
    default:
      return "mock";
  }
}

function normalizeTimestamp(value: string | undefined, fallback: string): string {
  const candidate = value?.trim() || fallback;
  const timestamp = Date.parse(candidate);

  return Number.isNaN(timestamp) ? candidate : new Date(timestamp).toISOString();
}

function buildMailboxId(rawEmail: RawInboxEmail): string {
  return rawEmail.provider === "outlook_graph" ? "outlook_graph_default" : rawEmail.provider;
}

function extractIdentifier(rawEmail: RawInboxEmail, pattern: RegExp): string | null {
  const match = [rawEmail.subject, rawEmail.previewText, rawEmail.bodyText]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .match(pattern);

  return match?.[0]?.trim() ?? null;
}

export function mapRawInboxEmailToMailboxMessage(rawEmail: RawInboxEmail): MailboxMessage {
  const now = new Date().toISOString();
  const receivedAt = normalizeTimestamp(rawEmail.receivedAt, now);

  return {
    id: rawEmail.id,
    providerMessageId: rawEmail.externalId.trim() || rawEmail.id,
    internetMessageId: null,
    conversationId: rawEmail.threadId?.trim() || rawEmail.id,
    threadKey: rawEmail.threadId?.trim() || null,
    source: mapInboxProviderToMailboxSource(rawEmail.provider),
    mailboxId: buildMailboxId(rawEmail),
    folderId: null,
    folderName: null,
    fromName: rawEmail.fromName.trim() || null,
    fromEmail: rawEmail.fromEmail.trim(),
    toEmails: [],
    ccEmails: [],
    subject: rawEmail.subject.trim() || "(no subject)",
    bodyPreview: rawEmail.previewText?.trim() || null,
    bodyText: rawEmail.bodyText.trim() || null,
    receivedAt,
    sentAt: null,
    isRead: false,
    hasAttachments: false,
    webLink: null,
    extractedIdentifiers: {
      orderNumber: extractIdentifier(rawEmail, /\bORD-\d+\b/i),
      caseNumber: extractIdentifier(rawEmail, /\b(?:CASE|TICKET|REF)[-:\s#]*[A-Z0-9-]{4,}\b/i),
      customerNumber: null,
      trackingNumber: extractIdentifier(rawEmail, /\b1Z[0-9A-Z]{16}\b/i),
    },
    syncedAt: now,
    createdAt: now,
    updatedAt: now,
    lastEvaluatedAt: null,
  };
}
