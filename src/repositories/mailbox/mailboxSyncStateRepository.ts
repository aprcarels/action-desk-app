import type { MailboxSyncState } from "../../domain/mailbox/mailboxSyncState";

export interface MailboxSyncStateRepository {
  getByMailboxFolder(
    mailboxId: string,
    folderId?: string | null,
  ): Promise<MailboxSyncState | null>;
  upsert(state: MailboxSyncState): Promise<void>;
}
