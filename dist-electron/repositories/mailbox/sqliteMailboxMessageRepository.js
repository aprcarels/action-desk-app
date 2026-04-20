"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqliteMailboxMessageRepository = void 0;
function serializeMailboxMessage(message) {
    return JSON.stringify(message);
}
function deserializeMailboxMessage(row) {
    if (!row) {
        return null;
    }
    return JSON.parse(row.record_json);
}
class SqliteMailboxMessageRepository {
    constructor(database) {
        this.database = database;
    }
    async getById(id) {
        const row = this.database
            .prepare("SELECT record_json FROM mailbox_messages WHERE id = ?")
            .get(id);
        return deserializeMailboxMessage(row);
    }
    async listByConversationId(conversationId) {
        const rows = this.database
            .prepare("SELECT record_json FROM mailbox_messages WHERE conversation_id = ? ORDER BY received_at ASC")
            .all(conversationId);
        return rows.map((row) => JSON.parse(row.record_json));
    }
    async listRecent(limit = 50) {
        const rows = this.database
            .prepare("SELECT record_json FROM mailbox_messages ORDER BY received_at DESC LIMIT ?")
            .all(limit);
        return rows.map((row) => JSON.parse(row.record_json));
    }
    async upsert(message) {
        this.database
            .prepare(`
        INSERT INTO mailbox_messages (
          id,
          conversation_id,
          source,
          mailbox_id,
          from_email,
          subject,
          body_preview,
          received_at,
          is_read,
          synced_at,
          updated_at,
          record_json
        ) VALUES (
          @id,
          @conversation_id,
          @source,
          @mailbox_id,
          @from_email,
          @subject,
          @body_preview,
          @received_at,
          @is_read,
          @synced_at,
          @updated_at,
          @record_json
        )
        ON CONFLICT(id) DO UPDATE SET
          conversation_id = excluded.conversation_id,
          source = excluded.source,
          mailbox_id = excluded.mailbox_id,
          from_email = excluded.from_email,
          subject = excluded.subject,
          body_preview = excluded.body_preview,
          received_at = excluded.received_at,
          is_read = excluded.is_read,
          synced_at = excluded.synced_at,
          updated_at = excluded.updated_at,
          record_json = excluded.record_json
      `)
            .run({
            id: message.id,
            conversation_id: message.conversationId,
            source: message.source,
            mailbox_id: message.mailboxId,
            from_email: message.fromEmail,
            subject: message.subject,
            body_preview: message.bodyPreview ?? null,
            received_at: message.receivedAt,
            is_read: message.isRead ? 1 : 0,
            synced_at: message.syncedAt,
            updated_at: message.updatedAt,
            record_json: serializeMailboxMessage(message),
        });
    }
    async upsertMany(messages) {
        const transaction = this.database.transaction((items) => {
            for (const message of items) {
                this.database
                    .prepare(`
            INSERT INTO mailbox_messages (
              id,
              conversation_id,
              source,
              mailbox_id,
              from_email,
              subject,
              body_preview,
              received_at,
              is_read,
              synced_at,
              updated_at,
              record_json
            ) VALUES (
              @id,
              @conversation_id,
              @source,
              @mailbox_id,
              @from_email,
              @subject,
              @body_preview,
              @received_at,
              @is_read,
              @synced_at,
              @updated_at,
              @record_json
            )
            ON CONFLICT(id) DO UPDATE SET
              conversation_id = excluded.conversation_id,
              source = excluded.source,
              mailbox_id = excluded.mailbox_id,
              from_email = excluded.from_email,
              subject = excluded.subject,
              body_preview = excluded.body_preview,
              received_at = excluded.received_at,
              is_read = excluded.is_read,
              synced_at = excluded.synced_at,
              updated_at = excluded.updated_at,
              record_json = excluded.record_json
          `)
                    .run({
                    id: message.id,
                    conversation_id: message.conversationId,
                    source: message.source,
                    mailbox_id: message.mailboxId,
                    from_email: message.fromEmail,
                    subject: message.subject,
                    body_preview: message.bodyPreview ?? null,
                    received_at: message.receivedAt,
                    is_read: message.isRead ? 1 : 0,
                    synced_at: message.syncedAt,
                    updated_at: message.updatedAt,
                    record_json: serializeMailboxMessage(message),
                });
            }
        });
        transaction(messages);
    }
}
exports.SqliteMailboxMessageRepository = SqliteMailboxMessageRepository;
