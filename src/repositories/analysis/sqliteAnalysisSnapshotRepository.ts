import type { ActionDeskAnalysisSnapshot } from "../../domain";
import type { SqliteDatabase } from "../../persistence/sqlite/database";
import type { AnalysisSnapshotRepository } from "./analysisSnapshotRepository";

type AnalysisSnapshotRow = {
  record_json: string;
};

function deserializeSnapshot(row: AnalysisSnapshotRow | undefined): ActionDeskAnalysisSnapshot | null {
  if (!row) {
    return null;
  }

  return JSON.parse(row.record_json) as ActionDeskAnalysisSnapshot;
}

export class SqliteAnalysisSnapshotRepository implements AnalysisSnapshotRepository {
  private readonly database: SqliteDatabase;

  constructor(database: SqliteDatabase) {
    this.database = database;
  }

  async getLatestForQueueItem(queueItemId: string): Promise<ActionDeskAnalysisSnapshot | null> {
    const row = this.database
      .prepare(`
        SELECT record_json
        FROM analysis_snapshots
        WHERE queue_item_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .get(queueItemId) as AnalysisSnapshotRow | undefined;

    return deserializeSnapshot(row);
  }

  async listForQueueItem(queueItemId: string): Promise<ActionDeskAnalysisSnapshot[]> {
    const rows = this.database
      .prepare(`
        SELECT record_json
        FROM analysis_snapshots
        WHERE queue_item_id = ?
        ORDER BY created_at ASC
      `)
      .all(queueItemId) as AnalysisSnapshotRow[];

    return rows.map((row) => JSON.parse(row.record_json) as ActionDeskAnalysisSnapshot);
  }

  async append(snapshot: ActionDeskAnalysisSnapshot): Promise<void> {
    this.database
      .prepare(`
        INSERT INTO analysis_snapshots (
          id,
          queue_item_id,
          mailbox_message_id,
          intent,
          urgency,
          issue_type,
          priority_score,
          priority_band,
          priority_reasons_json,
          summary,
          recommended_action,
          reply_draft,
          warnings_json,
          created_at,
          record_json
        ) VALUES (
          @id,
          @queue_item_id,
          @mailbox_message_id,
          @intent,
          @urgency,
          @issue_type,
          @priority_score,
          @priority_band,
          @priority_reasons_json,
          @summary,
          @recommended_action,
          @reply_draft,
          @warnings_json,
          @created_at,
          @record_json
        )
      `)
      .run({
        id: snapshot.id,
        queue_item_id: snapshot.queueItemId,
        mailbox_message_id: snapshot.mailboxMessageId,
        intent: snapshot.intent ?? null,
        urgency: snapshot.urgency ?? null,
        issue_type: snapshot.issueType ?? null,
        priority_score: snapshot.priorityScore,
        priority_band: snapshot.priorityBand,
        priority_reasons_json: JSON.stringify(snapshot.priorityReasons),
        summary: snapshot.summary ?? null,
        recommended_action: snapshot.recommendedAction ?? null,
        reply_draft: snapshot.replyDraft ?? null,
        warnings_json: JSON.stringify(snapshot.warnings),
        created_at: snapshot.createdAt,
        record_json: JSON.stringify(snapshot),
      });
  }
}
