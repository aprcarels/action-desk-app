import { buildAnalysisInput } from "../analysisInput";
import { runActionDesk } from "../../app/runActionDesk";
import type {
  ActionDeskAnalysisSnapshot,
  MailboxMessage,
  QueueItem,
  QueueWorkStatus,
} from "../../domain";
import type {
  AnalysisSnapshotRepository,
  MailboxMessageRepository,
  QueueItemRepository,
} from "../../repositories";
import { buildQueueItem } from "../../mappers/buildQueueItem";
import { mapActionDeskResultToAnalysisSnapshot } from "../../mappers/mapActionDeskResultToAnalysisSnapshot";

type QueueManagerDependencies = {
  mailboxMessageRepository: MailboxMessageRepository;
  queueItemRepository: QueueItemRepository;
  analysisSnapshotRepository: AnalysisSnapshotRepository;
};

function getComparableBody(message: MailboxMessage): string {
  return (message.bodyText ?? message.bodyPreview ?? "").trim();
}

function hasMessageMeaningfullyChanged(
  currentMessage: MailboxMessage,
  storedMessage: MailboxMessage,
): boolean {
  return (
    currentMessage.subject !== storedMessage.subject ||
    currentMessage.receivedAt !== storedMessage.receivedAt ||
    currentMessage.fromEmail !== storedMessage.fromEmail ||
    getComparableBody(currentMessage) !== getComparableBody(storedMessage)
  );
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

export class QueueManager {
  private readonly mailboxMessageRepository: MailboxMessageRepository;
  private readonly queueItemRepository: QueueItemRepository;
  private readonly analysisSnapshotRepository: AnalysisSnapshotRepository;

  constructor(dependencies: QueueManagerDependencies) {
    this.mailboxMessageRepository = dependencies.mailboxMessageRepository;
    this.queueItemRepository = dependencies.queueItemRepository;
    this.analysisSnapshotRepository = dependencies.analysisSnapshotRepository;
  }

  async ingestMessages(messages: MailboxMessage[]): Promise<QueueItem[]> {
    const queueItems: QueueItem[] = [];

    // Process small groups in parallel instead of fully one-by-one.
    // This keeps load controlled while speeding up queue hydration.
    const chunks = chunkArray(messages, 3);

    for (const chunk of chunks) {
      const processedChunk = await Promise.all(
        chunk.map((message) => this.processMessage(message)),
      );
      queueItems.push(...processedChunk);
    }

    return queueItems;
  }

  async processMessage(message: MailboxMessage): Promise<QueueItem> {
    const queueItemId = `queue:${message.id}`;

    const existingItem = await this.queueItemRepository.getByMailboxMessageId(message.id);
    const existingSnapshot = await this.analysisSnapshotRepository.getLatestForQueueItem(queueItemId);
    const storedMessage = await this.mailboxMessageRepository.getById(message.id);

    const messageChanged =
      !storedMessage || hasMessageMeaningfullyChanged(message, storedMessage);

    const persistedMessage: MailboxMessage = {
      ...message,
      lastEvaluatedAt:
        !messageChanged && storedMessage?.lastEvaluatedAt
          ? storedMessage.lastEvaluatedAt
          : new Date().toISOString(),
      updatedAt:
        !messageChanged && storedMessage?.updatedAt
          ? storedMessage.updatedAt
          : new Date().toISOString(),
      createdAt: storedMessage?.createdAt ?? message.createdAt,
      syncedAt: new Date().toISOString(),
    };

    if (storedMessage && existingItem && existingSnapshot && !messageChanged) {
      await this.mailboxMessageRepository.upsert(persistedMessage);
      return existingItem;
    }

    const result = await runActionDesk(
      buildAnalysisInput({
        subject: message.subject,
        body: message.bodyText ?? message.bodyPreview ?? "",
      }),
      {
        includeReplyDraft: false,
        aiInput: {
          subject: message.subject,
          from: [message.fromName, message.fromEmail].filter(Boolean).join(" "),
          body: message.bodyText ?? message.bodyPreview ?? "",
        },
      },
    );

    const snapshot = mapActionDeskResultToAnalysisSnapshot({
      queueItemId,
      mailboxMessage: persistedMessage,
      result,
    });

    const queueItem = buildQueueItem({
      mailboxMessage: persistedMessage,
      snapshot,
      existingItem,
    });

    await this.mailboxMessageRepository.upsert(persistedMessage);
    await this.analysisSnapshotRepository.append(snapshot);
    await this.queueItemRepository.upsert(queueItem);

    return queueItem;
  }

  async listActiveQueue(): Promise<QueueItem[]> {
    const items = await this.queueItemRepository.listActive();

    return [...items].sort((left, right) => {
      if (right.priorityScore !== left.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }

      return Date.parse(left.latestCustomerMessageAt) - Date.parse(right.latestCustomerMessageAt);
    });
  }

  async updateWorkStatus(id: string, status: QueueWorkStatus): Promise<void> {
    await this.queueItemRepository.updateWorkStatus(id, status);
  }

  async recomputePriority(id: string): Promise<QueueItem | null> {
    const existingItem = await this.queueItemRepository.getById(id);

    if (!existingItem) {
      return null;
    }

    const message = await this.mailboxMessageRepository.getById(existingItem.mailboxMessageId);

    if (!message) {
      return null;
    }

    const reprocessMessage: MailboxMessage = {
      ...message,
      updatedAt: new Date().toISOString(),
      syncedAt: new Date().toISOString(),
      lastEvaluatedAt: new Date().toISOString(),
    };

    const result = await runActionDesk(
      buildAnalysisInput({
        subject: reprocessMessage.subject,
        body: reprocessMessage.bodyText ?? reprocessMessage.bodyPreview ?? "",
      }),
      {
        includeReplyDraft: false,
        aiInput: {
          subject: reprocessMessage.subject,
          from: [reprocessMessage.fromName, reprocessMessage.fromEmail]
            .filter(Boolean)
            .join(" "),
          body: reprocessMessage.bodyText ?? reprocessMessage.bodyPreview ?? "",
        },
      },
    );

    const snapshot = mapActionDeskResultToAnalysisSnapshot({
      queueItemId: existingItem.queueItemId,
      mailboxMessage: reprocessMessage,
      result,
    });

    const queueItem = buildQueueItem({
      mailboxMessage: reprocessMessage,
      snapshot,
      existingItem,
    });

    await this.mailboxMessageRepository.upsert(reprocessMessage);
    await this.analysisSnapshotRepository.append(snapshot);
    await this.queueItemRepository.upsert(queueItem);

    return queueItem;
  }

  async markResolved(id: string): Promise<void> {
    await this.updateWorkStatus(id, "done");
  }

  async getLatestSnapshot(queueItemId: string): Promise<ActionDeskAnalysisSnapshot | null> {
    return this.analysisSnapshotRepository.getLatestForQueueItem(queueItemId);
  }
}
