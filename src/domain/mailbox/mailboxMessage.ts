export type MailboxSource = "outlook_graph" | "mock" | "imported";

export type ExtractedIdentifiers = {
  orderNumber?: string | null;
  caseNumber?: string | null;
  customerNumber?: string | null;
  trackingNumber?: string | null;
};

export type MailboxMessage = {
  id: string;
  providerMessageId?: string | null;
  internetMessageId?: string | null;
  conversationId: string;
  threadKey?: string | null;
  source: MailboxSource;
  mailboxId: string;
  folderId?: string | null;
  folderName?: string | null;
  fromName?: string | null;
  fromEmail: string;
  toEmails: string[];
  ccEmails: string[];
  subject: string;
  bodyPreview?: string | null;
  bodyText?: string | null;
  receivedAt: string;
  sentAt?: string | null;
  isRead: boolean;
  hasAttachments: boolean;
  webLink?: string | null;
  extractedIdentifiers?: ExtractedIdentifiers;
  syncedAt: string;
  createdAt: string;
  updatedAt: string;
  lastEvaluatedAt?: string | null;
};
