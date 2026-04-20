"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryAnalysisSnapshotRepository = void 0;
function cloneSnapshot(snapshot) {
    return {
        ...snapshot,
        riskFlags: [...snapshot.riskFlags],
        extractedSignals: [...snapshot.extractedSignals],
        priorityReasons: [...snapshot.priorityReasons],
        warnings: [...snapshot.warnings],
    };
}
class InMemoryAnalysisSnapshotRepository {
    constructor() {
        this.snapshotsByQueueItemId = new Map();
    }
    async getLatestForQueueItem(queueItemId) {
        const snapshots = this.snapshotsByQueueItemId.get(queueItemId) ?? [];
        const latest = snapshots[snapshots.length - 1];
        return latest ? cloneSnapshot(latest) : null;
    }
    async listForQueueItem(queueItemId) {
        return (this.snapshotsByQueueItemId.get(queueItemId) ?? []).map(cloneSnapshot);
    }
    async append(snapshot) {
        const snapshots = this.snapshotsByQueueItemId.get(snapshot.queueItemId) ?? [];
        snapshots.push(cloneSnapshot(snapshot));
        snapshots.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
        this.snapshotsByQueueItemId.set(snapshot.queueItemId, snapshots);
    }
}
exports.InMemoryAnalysisSnapshotRepository = InMemoryAnalysisSnapshotRepository;
