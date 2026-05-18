import { describe, expect, it } from "vitest";
import type { MailboxMessage } from "../domain";
import { mapMailboxMessageToEmailItem } from "./mapMailboxMessageToEmailItem";

function buildMailboxMessage(overrides: Partial<MailboxMessage> = {}): MailboxMessage {
  const now = "2026-04-21T11:15:00.000Z";

  return {
    id: "mailbox-message-1",
    providerMessageId: "graph-message-1",
    internetMessageId: null,
    conversationId: "conversation-1",
    source: "outlook_graph",
    mailboxId: "outlook_graph_default",
    folderId: null,
    folderName: null,
    fromName: "Acme Ops",
    fromEmail: "ops@acme.example",
    toEmails: [],
    ccEmails: [],
    subject: "Need shipment update",
    bodyPreview: "Can you check this?",
    bodyText: "Can you check this shipment?",
    receivedAt: now,
    sentAt: null,
    isRead: false,
    hasAttachments: false,
    webLink: "https://outlook.office.com/mail/deeplink/read/graph-message-1",
    syncedAt: now,
    createdAt: now,
    updatedAt: now,
    lastEvaluatedAt: null,
    ...overrides,
  };
}

describe("mapMailboxMessageToEmailItem", () => {
  it("preserves Graph provider identity and the exact Outlook web link", () => {
    const item = mapMailboxMessageToEmailItem(buildMailboxMessage());

    expect(item.id).toBe("mailbox-message-1");
    expect(item.providerMessageId).toBe("graph-message-1");
    expect(item.source).toBe("outlook_graph");
    expect(item.provider).toBe("outlook_graph");
    expect(item.outlookWebLink).toBe(
      "https://outlook.office.com/mail/deeplink/read/graph-message-1",
    );
  });
});
