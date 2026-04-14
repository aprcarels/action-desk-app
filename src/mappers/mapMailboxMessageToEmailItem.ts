import type { MailboxMessage } from "../domain";
import type { EmailItem } from "../types/actionDesk";
import type { InboxProvider } from "../types/inboxSource";

function mapMailboxSourceToInboxProvider(
  source: MailboxMessage["source"],
): InboxProvider {
  switch (source) {
    case "outlook_graph":
      return "outlook_graph";
    case "imported":
      return "outlook_addin_import";
    case "mock":
    default:
      return "dev_json";
  }
}

function mapMailboxSourceToEmailSource(
  source: MailboxMessage["source"],
): NonNullable<EmailItem["source"]> {
  switch (source) {
    case "outlook_graph":
      return "outlook_graph";
    case "imported":
      return "outlook_import";
    case "mock":
    default:
      return "seeded";
  }
}

export function mapMailboxMessageToEmailItem(message: MailboxMessage): EmailItem {
  return {
    id: message.id,
    senderName: message.fromName?.trim() || message.fromEmail.trim() || "Unknown sender",
    senderEmail: message.fromEmail.trim(),
    subject: message.subject.trim() || "(no subject)",
    receivedAt: message.receivedAt,
    body: message.bodyText?.trim() || message.bodyPreview?.trim() || "",
    previewText: message.bodyPreview?.trim() || message.bodyText?.trim() || "",
    provider: mapMailboxSourceToInboxProvider(message.source),
    source: mapMailboxSourceToEmailSource(message.source),
  };
}
