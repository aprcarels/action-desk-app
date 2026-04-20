"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDatabase = createDatabase;
exports.getDatabase = getDatabase;
exports.closeDatabase = closeDatabase;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const DEFAULT_SQLITE_PATH = (0, node_path_1.resolve)(process.cwd(), ".local-data", "action-desk.sqlite");
let activeDatabasePath = null;
let activeDatabase = null;
function ensureParentDirectory(filename) {
    const folderPath = (0, node_path_1.dirname)(filename);
    if (!(0, node_fs_1.existsSync)(folderPath)) {
        (0, node_fs_1.mkdirSync)(folderPath, { recursive: true });
    }
}
function resolveDatabasePath(filename) {
    return filename?.trim() ? (0, node_path_1.resolve)(filename) : DEFAULT_SQLITE_PATH;
}
function createSchema(database) {
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
function createDatabase(options) {
    const filename = resolveDatabasePath(options?.filename);
    ensureParentDirectory(filename);
    const database = new better_sqlite3_1.default(filename);
    createSchema(database);
    return database;
}
function getDatabase(options) {
    const filename = resolveDatabasePath(options?.filename);
    if (!activeDatabase || activeDatabasePath !== filename) {
        activeDatabase?.close();
        activeDatabase = createDatabase({ filename });
        activeDatabasePath = filename;
    }
    return activeDatabase;
}
function closeDatabase() {
    activeDatabase?.close();
    activeDatabase = null;
    activeDatabasePath = null;
}
