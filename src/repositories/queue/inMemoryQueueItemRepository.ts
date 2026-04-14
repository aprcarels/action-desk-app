import type { QueueItem, QueueWorkStatus } from "../../domain";
import type { QueueItemRepository } from "./queueItemRepository";

function cloneQueueItem(item: QueueItem): QueueItem {
  return {
    ...item,
    priorityReasons: [...item.priorityReasons],
    warnings: [...item.warnings],
  };
}

function isActiveQueueItem(item: QueueItem): boolean {
  return item.isActive;
}

export class InMemoryQueueItemRepository implements QueueItemRepository {
  private readonly items = new Map<string, QueueItem>();

  async getById(id: string): Promise<QueueItem | null> {
    const item = this.items.get(id);
    return item ? cloneQueueItem(item) : null;
  }

  async getByMailboxMessageId(mailboxMessageId: string): Promise<QueueItem | null> {
    const item = Array.from(this.items.values()).find(
      (candidate) => candidate.mailboxMessageId === mailboxMessageId,
    );

    return item ? cloneQueueItem(item) : null;
  }

  async listActive(): Promise<QueueItem[]> {
    return Array.from(this.items.values())
      .filter(isActiveQueueItem)
      .map(cloneQueueItem);
  }

  async listAll(): Promise<QueueItem[]> {
    return Array.from(this.items.values()).map(cloneQueueItem);
  }

  async upsert(item: QueueItem): Promise<void> {
    this.items.set(item.id, cloneQueueItem(item));
  }

  async upsertMany(items: QueueItem[]): Promise<void> {
    for (const item of items) {
      await this.upsert(item);
    }
  }

  async updateWorkStatus(id: string, workStatus: QueueWorkStatus): Promise<void> {
    const current = this.items.get(id);

    if (!current) {
      return;
    }

    const isResolved = workStatus === "done" || workStatus === "not_relevant";

    this.items.set(id, {
      ...current,
      workStatus,
      isActive: !isResolved,
      isResolved,
      completedAt: isResolved ? current.completedAt ?? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    });
  }
}
