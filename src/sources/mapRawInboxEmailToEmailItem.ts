import type { EmailItem } from "../types/actionDesk";
import type { RawInboxEmail } from "../types/inboxSource";

function normalizeText(value?: string): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function buildPreviewText(rawEmail: RawInboxEmail): string {
  return normalizeText(rawEmail.previewText) || normalizeText(rawEmail.bodyText);
}

function mapInboxProviderToEmailSource(
  provider: RawInboxEmail["provider"],
): NonNullable<EmailItem["source"]> {
  if (provider === "outlook_addin_import") {
    return "outlook_import";
  }

  if (provider === "outlook_graph") {
    return "outlook_graph";
  }

  if (provider === "test_data") {
    return "test_data";
  }

  return "seeded";
}

export function mapRawInboxEmailToEmailItem(rawEmail: RawInboxEmail): EmailItem {
  const previewText = buildPreviewText(rawEmail);
  const bodyText = rawEmail.bodyText.trim() || previewText;

  return {
    id: rawEmail.id,
    conversationId: rawEmail.threadId?.trim() || undefined,
    locationId: rawEmail.locationId?.trim() || undefined,
    senderName: rawEmail.fromName.trim() || rawEmail.fromEmail.trim() || "Unknown sender",
    senderEmail: rawEmail.fromEmail.trim(),
    subject: rawEmail.subject.trim() || "(no subject)",
    receivedAt: rawEmail.receivedAt.trim(),
    body: bodyText,
    previewText,
    provider: rawEmail.provider,
    source: mapInboxProviderToEmailSource(rawEmail.provider),
    outlookWebLink: rawEmail.outlookWebLink?.trim() || undefined,
  };
}
