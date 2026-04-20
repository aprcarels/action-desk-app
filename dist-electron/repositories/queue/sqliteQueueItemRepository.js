"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqliteQueueItemRepository = void 0;
function deserializeQueueItem(row) {
    if (!row) {
        return null;
    }
    return JSON.parse(row.record_json);
}
class SqliteQueueItemRepository {
    constructor(database) {
        this.database = database;
    }
    async getById(id) {
        const row = this.database
            .prepare("SELECT record_json FROM queue_items WHERE id = ?")
            .get(id);
        return deserializeQueueItem(row);
    }
    async getByMailboxMessageId(mailboxMessageId) {
        const row = this.database
            .prepare("SELECT record_json FROM queue_items WHERE mailbox_message_id = ?")
            .get(mailboxMessageId);
        return deserializeQueueItem(row);
    }
    async listActive() {
        const rows = this.database
            .prepare(`
        SELECT record_json
        FROM queue_items
        WHERE work_status NOT IN ('done', 'not_relevant')
        ORDER BY priority_score DESC, latest_customer_message_at ASC
      `)
            .all();
        return rows.map((row) => JSON.parse(row.record_json));
    }
    async listAll() {
        const rows = this.database
            .prepare("SELECT record_json FROM queue_items ORDER BY updated_at DESC")
            .all();
        return rows.map((row) => JSON.parse(row.record_json));
    }
    async upsert(item) {
        this.database
            .prepare(`
        INSERT INTO queue_items (
          id,
          mailbox_message_id,
          conversation_id,
          subject,
          customer_email,
          work_status,
          priority_score,
          priority_band,
          priority_reasons_json,
          summary,
          recommended_action,
          reply_draft,
          warnings_json,
          latest_customer_message_at,
          updated_at,
          record_json
        ) VALUES (
          @id,
          @mailbox_message_id,
          @conversation_id,
          @subject,
          @customer_email,
          @work_status,
          @priority_score,
          @priority_band,
          @priority_reasons_json,
          @summary,
          @recommended_action,
          @reply_draft,
          @warnings_json,
          @latest_customer_message_at,
          @updated_at,
          @record_json
        )
        ON CONFLICT(id) DO UPDATE SET
          mailbox_message_id = excluded.mailbox_message_id,
          conversation_id = excluded.conversation_id,
          subject = excluded.subject,
          customer_email = excluded.customer_email,
          work_status = excluded.work_status,
          priority_score = excluded.priority_score,
          priority_band = excluded.priority_band,
          priority_reasons_json = excluded.priority_reasons_json,
          summary = excluded.summary,
          recommended_action = excluded.recommended_action,
          reply_draft = excluded.reply_draft,
          warnings_json = excluded.warnings_json,
          latest_customer_message_at = excluded.latest_customer_message_at,
          updated_at = excluded.updated_at,
          record_json = excluded.record_json
      `)
            .run({
            id: item.id,
            mailbox_message_id: item.mailboxMessageId,
            conversation_id: item.conversationId,
            subject: item.subject,
            customer_email: item.customerEmail,
            work_status: item.workStatus,
            priority_score: item.priorityScore,
            priority_band: item.priorityBand,
            priority_reasons_json: JSON.stringify(item.priorityReasons),
            summary: item.summary ?? null,
            recommended_action: item.recommendedAction ?? null,
            reply_draft: item.replyDraft ?? null,
            warnings_json: JSON.stringify(item.warnings),
            latest_customer_message_at: item.latestCustomerMessageAt,
            updated_at: item.updatedAt,
            record_json: JSON.stringify(item),
        });
    }
    async upsertMany(items) {
        const transaction = this.database.transaction((nextItems) => {
            for (const item of nextItems) {
                this.database
                    .prepare(`
            INSERT INTO queue_items (
              id,
              mailbox_message_id,
              conversation_id,
              subject,
              customer_email,
              work_status,
              priority_score,
              priority_band,
              priority_reasons_json,
              summary,
              recommended_action,
              reply_draft,
              warnings_json,
              latest_customer_message_at,
              updated_at,
              record_json
            ) VALUES (
              @id,
              @mailbox_message_id,
              @conversation_id,
              @subject,
              @customer_email,
              @work_status,
              @priority_score,
              @priority_band,
              @priority_reasons_json,
              @summary,
              @recommended_action,
              @reply_draft,
              @warnings_json,
              @latest_customer_message_at,
              @updated_at,
              @record_json
            )
            ON CONFLICT(id) DO UPDATE SET
              mailbox_message_id = excluded.mailbox_message_id,
              conversation_id = excluded.conversation_id,
              subject = excluded.subject,
              customer_email = excluded.customer_email,
              work_status = excluded.work_status,
              priority_score = excluded.priority_score,
              priority_band = excluded.priority_band,
              priority_reasons_json = excluded.priority_reasons_json,
              summary = excluded.summary,
              recommended_action = excluded.recommended_action,
              reply_draft = excluded.reply_draft,
              warnings_json = excluded.warnings_json,
              latest_customer_message_at = excluded.latest_customer_message_at,
              updated_at = excluded.updated_at,
              record_json = excluded.record_json
          `)
                    .run({
                    id: item.id,
                    mailbox_message_id: item.mailboxMessageId,
                    conversation_id: item.conversationId,
                    subject: item.subject,
                    customer_email: item.customerEmail,
                    work_status: item.workStatus,
                    priority_score: item.priorityScore,
                    priority_band: item.priorityBand,
                    priority_reasons_json: JSON.stringify(item.priorityReasons),
                    summary: item.summary ?? null,
                    recommended_action: item.recommendedAction ?? null,
                    reply_draft: item.replyDraft ?? null,
                    warnings_json: JSON.stringify(item.warnings),
                    latest_customer_message_at: item.latestCustomerMessageAt,
                    updated_at: item.updatedAt,
                    record_json: JSON.stringify(item),
                });
            }
        });
        transaction(items);
    }
    async updateWorkStatus(id, workStatus) {
        const current = await this.getById(id);
        if (!current) {
            return;
        }
        const isResolved = workStatus === "done" || workStatus === "not_relevant";
        const nextItem = {
            ...current,
            workStatus,
            isActive: !isResolved,
            isResolved,
            completedAt: isResolved ? current.completedAt ?? new Date().toISOString() : null,
            updatedAt: new Date().toISOString(),
        };
        await this.upsert(nextItem);
    }
}
exports.SqliteQueueItemRepository = SqliteQueueItemRepository;
