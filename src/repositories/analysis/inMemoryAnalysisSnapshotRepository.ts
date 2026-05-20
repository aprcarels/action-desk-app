import type { ActionDeskAnalysisSnapshot } from "../../domain";
import type { AnalysisSnapshotRepository } from "./analysisSnapshotRepository";

function cloneSnapshot(snapshot: ActionDeskAnalysisSnapshot): ActionDeskAnalysisSnapshot {
  return {
    ...snapshot,
    riskFlags: [...snapshot.riskFlags],
    extractedSignals: [...snapshot.extractedSignals],
    priorityReasons: [...snapshot.priorityReasons],
    warnings: [...snapshot.warnings],
    aiClassification: snapshot.aiClassification
      ? { ...snapshot.aiClassification }
      : undefined,
  };
}

export class InMemoryAnalysisSnapshotRepository implements AnalysisSnapshotRepository {
  private readonly snapshotsByQueueItemId = new Map<string, ActionDeskAnalysisSnapshot[]>();

  async getLatestForQueueItem(queueItemId: string): Promise<ActionDeskAnalysisSnapshot | null> {
    const snapshots = this.snapshotsByQueueItemId.get(queueItemId) ?? [];
    const latest = snapshots[snapshots.length - 1];
    return latest ? cloneSnapshot(latest) : null;
  }

  async listForQueueItem(queueItemId: string): Promise<ActionDeskAnalysisSnapshot[]> {
    return (this.snapshotsByQueueItemId.get(queueItemId) ?? []).map(cloneSnapshot);
  }

  async append(snapshot: ActionDeskAnalysisSnapshot): Promise<void> {
    const snapshots = this.snapshotsByQueueItemId.get(snapshot.queueItemId) ?? [];
    snapshots.push(cloneSnapshot(snapshot));
    snapshots.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
    this.snapshotsByQueueItemId.set(snapshot.queueItemId, snapshots);
  }
}
