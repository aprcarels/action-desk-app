import type { EmailItem } from "../types/actionDesk";
import type { RawInboxEmail } from "../types/inboxSource";

export function mapRawInboxEmailToEmailItem(rawEmail: RawInboxEmail): EmailItem {
  return {
    id: rawEmail.id,
    senderName: rawEmail.fromName,
    senderEmail: rawEmail.fromEmail,
    subject: rawEmail.subject,
    receivedAt: rawEmail.receivedAt,
    body: rawEmail.bodyText,
    source: rawEmail.provider === "outlook_addin_import" ? "outlook_import" : "seeded",
  };
}
