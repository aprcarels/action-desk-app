import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type SqliteDatabase = Database.Database;

type DatabaseOptions = {
  filename?: string;
};

const DEFAULT_SQLITE_PATH = resolve(process.cwd(), ".local-data", "action-desk.sqlite");

let activeDatabasePath: string | null = null;
let activeDatabase: SqliteDatabase | null = null;

function ensureParentDirectory(filename: string) {
  const folderPath = dirname(filename);

  if (!existsSync(folderPath)) {
    mkdirSync(folderPath, { recursive: true });
  }
}

function resolveDatabasePath(filename?: string): string {
  return filename?.trim() ? resolve(filename) : DEFAULT_SQLITE_PATH;
}

function createSchema(database: SqliteDatabase) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS mailbox_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      source TEXT NOT NULL,
      mailbox_id TEXT NOT NULL,
      from_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_preview TEXT,
      received_at TEXT NOT NULL,
      is_read INTEGER NOT NULL,
      synced_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      record_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS queue_items (
      id TEXT PRIMARY KEY,
      mailbox_message_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      work_status TEXT NOT NULL,
      priority_score INTEGER NOT NULL,
      priority_band TEXT NOT NULL,
      priority_reasons_json TEXT NOT NULL,
      summary TEXT,
      recommended_action TEXT,
      reply_draft TEXT,
      warnings_json TEXT NOT NULL,
      latest_customer_message_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      record_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analysis_snapshots (
      id TEXT PRIMARY KEY,
      queue_item_id TEXT NOT NULL,
      mailbox_message_id TEXT NOT NULL,
      intent TEXT,
      urgency TEXT,
      issue_type TEXT,
      priority_score INTEGER NOT NULL,
      priority_band TEXT NOT NULL,
      priority_reasons_json TEXT NOT NULL,
      summary TEXT,
      recommended_action TEXT,
      reply_draft TEXT,
      warnings_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      record_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mailbox_messages_conversation_id
      ON mailbox_messages (conversation_id);

    CREATE INDEX IF NOT EXISTS idx_mailbox_messages_received_at
      ON mailbox_messages (received_at DESC);

    CREATE INDEX IF NOT EXISTS idx_queue_items_mailbox_message_id
      ON queue_items (mailbox_message_id);

    CREATE INDEX IF NOT EXISTS idx_queue_items_work_status
      ON queue_items (work_status, priority_score DESC, latest_customer_message_at ASC);

    CREATE INDEX IF NOT EXISTS idx_analysis_snapshots_queue_item_id
      ON analysis_snapshots (queue_item_id, created_at DESC);
  `);
}

export function createDatabase(options?: DatabaseOptions): SqliteDatabase {
  const filename = resolveDatabasePath(options?.filename);
  ensureParentDirectory(filename);
  const database = new Database(filename);
  createSchema(database);
  return database;
}

export function getDatabase(options?: DatabaseOptions): SqliteDatabase {
  const filename = resolveDatabasePath(options?.filename);

  if (!activeDatabase || activeDatabasePath !== filename) {
    activeDatabase?.close();
    activeDatabase = createDatabase({ filename });
    activeDatabasePath = filename;
  }

  return activeDatabase;
}

export function closeDatabase() {
  activeDatabase?.close();
  activeDatabase = null;
  activeDatabasePath = null;
}
