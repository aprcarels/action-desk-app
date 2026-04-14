import type { QueueItem } from "../../domain/queue/queueItem";
import type { QueueWorkStatus } from "../../domain/queue/queueStatus";

export interface QueueItemRepository {
  getById(id: string): Promise<QueueItem | null>;
  getByMailboxMessageId(mailboxMessageId: string): Promise<QueueItem | null>;
  listActive(): Promise<QueueItem[]>;
  listAll(): Promise<QueueItem[]>;
  upsert(item: QueueItem): Promise<void>;
  upsertMany(items: QueueItem[]): Promise<void>;
  updateWorkStatus(id: string, workStatus: QueueWorkStatus): Promise<void>;
}
