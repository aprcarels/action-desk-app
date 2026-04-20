"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqliteAnalysisSnapshotRepository = void 0;
function deserializeSnapshot(row) {
    if (!row) {
        return null;
    }
    return JSON.parse(row.record_json);
}
class SqliteAnalysisSnapshotRepository {
    constructor(database) {
        this.database = database;
    }
    async getLatestForQueueItem(queueItemId) {
        const row = this.database
            .prepare(`
        SELECT record_json
        FROM analysis_snapshots
        WHERE queue_item_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `)
            .get(queueItemId);
        return deserializeSnapshot(row);
    }
    async listForQueueItem(queueItemId) {
        const rows = this.database
            .prepare(`
        SELECT record_json
        FROM analysis_snapshots
        WHERE queue_item_id = ?
        ORDER BY created_at ASC
      `)
            .all(queueItemId);
        return rows.map((row) => JSON.parse(row.record_json));
    }
    async append(snapshot) {
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
exports.SqliteAnalysisSnapshotRepository = SqliteAnalysisSnapshotRepository;
