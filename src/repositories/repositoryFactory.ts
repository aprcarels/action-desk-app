import {
  InMemoryAnalysisSnapshotRepository,
  InMemoryMailboxMessageRepository,
  InMemoryQueueItemRepository,
} from "./index";
import { getDatabase, type SqliteDatabase } from "../persistence/sqlite/database";
import { SqliteAnalysisSnapshotRepository } from "./analysis/sqliteAnalysisSnapshotRepository";
import { SqliteMailboxMessageRepository } from "./mailbox/sqliteMailboxMessageRepository";
import { SqliteQueueItemRepository } from "./queue/sqliteQueueItemRepository";
import type {
  AnalysisSnapshotRepository,
  MailboxMessageRepository,
  QueueItemRepository,
} from "./index";

export type RepositoryBackend = "memory" | "sqlite";

export type RepositoryBundle = {
  mailboxMessageRepository: MailboxMessageRepository;
  queueItemRepository: QueueItemRepository;
  analysisSnapshotRepository: AnalysisSnapshotRepository;
};

export type RepositoryFactoryOptions = {
  backend?: RepositoryBackend;
  sqlite?: {
    filename?: string;
    database?: SqliteDatabase;
  };
};

function resolveBackend(explicitBackend?: RepositoryBackend): RepositoryBackend {
  return explicitBackend ?? "memory";
}

export function createRepositoryBundle(options?: RepositoryFactoryOptions): RepositoryBundle {
  const backend = resolveBackend(options?.backend);

  if (backend === "sqlite") {
    const database = options?.sqlite?.database ?? getDatabase({
      filename: options?.sqlite?.filename,
    });

    return {
      mailboxMessageRepository: new SqliteMailboxMessageRepository(database),
      queueItemRepository: new SqliteQueueItemRepository(database),
      analysisSnapshotRepository: new SqliteAnalysisSnapshotRepository(database),
    };
  }

  return {
    mailboxMessageRepository: new InMemoryMailboxMessageRepository(),
    queueItemRepository: new InMemoryQueueItemRepository(),
    analysisSnapshotRepository: new InMemoryAnalysisSnapshotRepository(),
  };
}