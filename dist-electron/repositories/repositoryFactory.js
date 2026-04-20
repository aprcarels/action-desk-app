"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRepositoryBundle = createRepositoryBundle;
const index_1 = require("./index");
const database_1 = require("../persistence/sqlite/database");
const sqliteAnalysisSnapshotRepository_1 = require("./analysis/sqliteAnalysisSnapshotRepository");
const sqliteMailboxMessageRepository_1 = require("./mailbox/sqliteMailboxMessageRepository");
const sqliteQueueItemRepository_1 = require("./queue/sqliteQueueItemRepository");
function resolveBackend(explicitBackend) {
    return explicitBackend ?? "memory";
}
function createRepositoryBundle(options) {
    const backend = resolveBackend(options?.backend);
    if (backend === "sqlite") {
        const database = options?.sqlite?.database ?? (0, database_1.getDatabase)({
            filename: options?.sqlite?.filename,
        });
        return {
            mailboxMessageRepository: new sqliteMailboxMessageRepository_1.SqliteMailboxMessageRepository(database),
            queueItemRepository: new sqliteQueueItemRepository_1.SqliteQueueItemRepository(database),
            analysisSnapshotRepository: new sqliteAnalysisSnapshotRepository_1.SqliteAnalysisSnapshotRepository(database),
        };
    }
    return {
        mailboxMessageRepository: new index_1.InMemoryMailboxMessageRepository(),
        queueItemRepository: new index_1.InMemoryQueueItemRepository(),
        analysisSnapshotRepository: new index_1.InMemoryAnalysisSnapshotRepository(),
    };
}
