import type { MailboxMessage } from "../../domain";
import type { MailboxMessageRepository } from "./mailboxMessageRepository";

function cloneMailboxMessage(message: MailboxMessage): MailboxMessage {
  return {
    ...message,
    toEmails: [...message.toEmails],
    ccEmails: [...message.ccEmails],
    extractedIdentifiers: message.extractedIdentifiers
      ? { ...message.extractedIdentifiers }
      : undefined,
  };
}

export class InMemoryMailboxMessageRepository implements MailboxMessageRepository {
  private readonly messages = new Map<string, MailboxMessage>();

  async getById(id: string): Promise<MailboxMessage | null> {
    const message = this.messages.get(id);
    return message ? cloneMailboxMessage(message) : null;
  }

  async listByConversationId(conversationId: string): Promise<MailboxMessage[]> {
    return Array.from(this.messages.values())
      .filter((message) => message.conversationId === conversationId)
      .map(cloneMailboxMessage);
  }

  async listRecent(limit = 50): Promise<MailboxMessage[]> {
    return Array.from(this.messages.values())
      .sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt))
      .slice(0, limit)
      .map(cloneMailboxMessage);
  }

  async upsert(message: MailboxMessage): Promise<void> {
    this.messages.set(message.id, cloneMailboxMessage(message));
  }

  async upsertMany(messages: MailboxMessage[]): Promise<void> {
    for (const message of messages) {
      await this.upsert(message);
    }
  }
}
