import type { MailboxMessage } from "../../domain/mailbox/mailboxMessage";

export interface MailboxMessageRepository {
  getById(id: string): Promise<MailboxMessage | null>;
  listByConversationId(conversationId: string): Promise<MailboxMessage[]>;
  listRecent(limit?: number): Promise<MailboxMessage[]>;
  upsert(message: MailboxMessage): Promise<void>;
  upsertMany(messages: MailboxMessage[]): Promise<void>;
}
