import type { MailboxSource } from "./mailboxMessage";

export type MailboxSyncStatus = "idle" | "running" | "error";

export type MailboxSyncState = {
  id: string;
  mailboxId: string;
  source: MailboxSource;
  folderId?: string | null;
  folderName?: string | null;
  syncCursor?: string | null;
  lastSuccessfulSyncAt?: string | null;
  lastAttemptedSyncAt?: string | null;
  lastSeenMessageReceivedAt?: string | null;
  syncStatus: MailboxSyncStatus;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
};
