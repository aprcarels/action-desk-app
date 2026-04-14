import type { EmailSourceListResult } from "../../src/types/inboxSource";

export type InboxRepositoryListOptions = {
  authorization?: string;
  cursor?: string;
  limit?: number;
};

export interface InboxRepository {
  listMessages(options?: InboxRepositoryListOptions): Promise<EmailSourceListResult>;
}
