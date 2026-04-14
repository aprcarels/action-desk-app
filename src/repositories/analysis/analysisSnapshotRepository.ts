import type { ActionDeskAnalysisSnapshot } from "../../domain/analysis/actionDeskAnalysisSnapshot";

export interface AnalysisSnapshotRepository {
  getLatestForQueueItem(queueItemId: string): Promise<ActionDeskAnalysisSnapshot | null>;
  listForQueueItem(queueItemId: string): Promise<ActionDeskAnalysisSnapshot[]>;
  append(snapshot: ActionDeskAnalysisSnapshot): Promise<void>;
}
