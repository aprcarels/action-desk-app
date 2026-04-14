import { QueueManager } from "../services/queue/queueManager";
import { loadRawInboxQueue } from "../services/loadInboxQueue";
import type { QueueItem, QueueWorkStatus } from "../domain";
import type { ProcessedEmail } from "../types/actionDesk";
import { mapRawInboxEmailToMailboxMessage } from "../mappers/mapRawInboxEmailToMailboxMessage";
import { mapQueueItemToProcessedEmailLike } from "../mappers/mapQueueItemToProcessedEmailLike";
import type { RepositoryBundle } from "../repositories/repositoryFactory";
import {
  InMemoryAnalysisSnapshotRepository,
  InMemoryMailboxMessageRepository,
  InMemoryQueueItemRepository,
} from "../repositories";

type QueueApplicationServiceOptions = {
  repositories?: RepositoryBundle;
};

type LoadAndProcessInboxOptions = {
  cursor?: string;
  interactiveAuth?: boolean;
};

type LoadAndProcessInboxHeadStartOptions = LoadAndProcessInboxOptions & {
  initialCount?: number;
  batchSize?: number;
  onBackgroundChunkProcessed?: (payload: {
    queueItems: QueueItem[];
    processedItems: ProcessedEmail[];
    nextCursor?: string;
    processedCount: number;
    totalCount: number;
  }) => void | Promise<void>;
};

export type LoadAndProcessInboxResult = {
  queueItems: QueueItem[];
  processedItems: ProcessedEmail[];
  nextCursor?: string;
};

function createDefaultRepositoryBundle(): RepositoryBundle {
  return {
    mailboxMessageRepository: new InMemoryMailboxMessageRepository(),
    queueItemRepository: new InMemoryQueueItemRepository(),
    analysisSnapshotRepository: new InMemoryAnalysisSnapshotRepository(),
  };
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

export class QueueApplicationService {
  private readonly repositories: RepositoryBundle;
  private readonly queueManager: QueueManager;

  constructor(options?: QueueApplicationServiceOptions) {
    this.repositories = options?.repositories ?? createDefaultRepositoryBundle();
    this.queueManager = new QueueManager(this.repositories);
  }

  async loadAndProcessInbox(options?: LoadAndProcessInboxOptions): Promise<LoadAndProcessInboxResult> {
    const rawInbox = await loadRawInboxQueue(options);
    const mailboxMessages = rawInbox.items.map(mapRawInboxEmailToMailboxMessage);

    await this.queueManager.ingestMessages(mailboxMessages);

    const processedItems = await this.listActiveQueueProcessedEmails();

    return {
      queueItems: await this.queueManager.listActiveQueue(),
      processedItems,
      nextCursor: rawInbox.nextCursor,
    };
  }

  async loadAndProcessInboxWithHeadStart(
    options?: LoadAndProcessInboxHeadStartOptions,
  ): Promise<LoadAndProcessInboxResult> {
    const rawInbox = await loadRawInboxQueue(options);
    const mailboxMessages = rawInbox.items.map(mapRawInboxEmailToMailboxMessage);

    const initialCount = Math.max(1, options?.initialCount ?? 10);
    const batchSize = Math.max(1, options?.batchSize ?? 5);

    const initialMessages = mailboxMessages.slice(0, initialCount);
    const remainingMessages = mailboxMessages.slice(initialCount);

    if (initialMessages.length > 0) {
      await this.queueManager.ingestMessages(initialMessages);
    }

    const initialQueueItems = await this.queueManager.listActiveQueue();
    const initialProcessedItems = await this.listActiveQueueProcessedEmails();

    if (remainingMessages.length > 0) {
      const remainingChunks = chunkArray(remainingMessages, batchSize);

      void (async () => {
        let processedCount = initialMessages.length;
        const totalCount = mailboxMessages.length;

        for (const chunk of remainingChunks) {
          await this.queueManager.ingestMessages(chunk);
          processedCount += chunk.length;

          if (options?.onBackgroundChunkProcessed) {
            const queueItems = await this.queueManager.listActiveQueue();
            const processedItems = await this.listActiveQueueProcessedEmails();

            await options.onBackgroundChunkProcessed({
              queueItems,
              processedItems,
              nextCursor: rawInbox.nextCursor,
              processedCount,
              totalCount,
            });
          }

          await new Promise<void>((resolve) => {
            window.setTimeout(() => resolve(), 0);
          });
        }
      })();
    }

    return {
      queueItems: initialQueueItems,
      processedItems: initialProcessedItems,
      nextCursor: rawInbox.nextCursor,
    };
  }

  async listActiveQueue(): Promise<QueueItem[]> {
    return this.queueManager.listActiveQueue();
  }

  async listActiveQueueProcessedEmails(): Promise<ProcessedEmail[]> {
    const queueItems = await this.queueManager.listActiveQueue();
    const processedItems: ProcessedEmail[] = [];

    for (const queueItem of queueItems) {
      const mailboxMessage = await this.repositories.mailboxMessageRepository.getById(
        queueItem.mailboxMessageId,
      );
      const snapshot = await this.repositories.analysisSnapshotRepository.getLatestForQueueItem(
        queueItem.queueItemId,
      );

      if (!mailboxMessage || !snapshot) {
        continue;
      }

      processedItems.push(
        mapQueueItemToProcessedEmailLike({
          queueItem,
          mailboxMessage,
          snapshot,
        }),
      );
    }

    return processedItems;
  }

  async updateWorkStatus(queueItemId: string, status: QueueWorkStatus): Promise<void> {
    await this.queueManager.updateWorkStatus(queueItemId, status);
  }

  async markResolved(queueItemId: string): Promise<void> {
    await this.queueManager.markResolved(queueItemId);
  }

  async recomputePriority(queueItemId: string): Promise<QueueItem | null> {
    return this.queueManager.recomputePriority(queueItemId);
  }
}

export function createQueueApplicationService(
  options?: QueueApplicationServiceOptions,
): QueueApplicationService {
  return new QueueApplicationService(options);
}