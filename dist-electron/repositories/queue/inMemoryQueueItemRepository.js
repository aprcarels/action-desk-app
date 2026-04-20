"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryQueueItemRepository = void 0;
function cloneQueueItem(item) {
    return {
        ...item,
        priorityReasons: [...item.priorityReasons],
        warnings: [...item.warnings],
    };
}
function isActiveQueueItem(item) {
    return item.isActive;
}
class InMemoryQueueItemRepository {
    constructor() {
        this.items = new Map();
    }
    async getById(id) {
        const item = this.items.get(id);
        return item ? cloneQueueItem(item) : null;
    }
    async getByMailboxMessageId(mailboxMessageId) {
        const item = Array.from(this.items.values()).find((candidate) => candidate.mailboxMessageId === mailboxMessageId);
        return item ? cloneQueueItem(item) : null;
    }
    async listActive() {
        return Array.from(this.items.values())
            .filter(isActiveQueueItem)
            .map(cloneQueueItem);
    }
    async listAll() {
        return Array.from(this.items.values()).map(cloneQueueItem);
    }
    async upsert(item) {
        this.items.set(item.id, cloneQueueItem(item));
    }
    async upsertMany(items) {
        for (const item of items) {
            await this.upsert(item);
        }
    }
    async updateWorkStatus(id, workStatus) {
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
exports.InMemoryQueueItemRepository = InMemoryQueueItemRepository;
