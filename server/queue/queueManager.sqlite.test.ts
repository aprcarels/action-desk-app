import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { QueueManager } from "../../src/services/queue/queueManager";
import { createRepositoryBundle } from "../../src/repositories/repositoryFactory";
import { closeDatabase, createDatabase } from "../../src/persistence/sqlite/database";
import type { MailboxMessage } from "../../src/domain";

describe("QueueManager SQLite persistence", () => {
  const databasePath = resolve(process.cwd(), ".local-data", "queue-manager-test.sqlite");
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    rmSync(databasePath, { force: true });
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline test fallback")));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(databasePath, { force: true });

    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      vi.stubGlobal("window", originalWindow);
    }

    if (originalFetch === undefined) {
      Reflect.deleteProperty(globalThis, "fetch");
    } else {
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("persists queue items across repository reloads", async () => {
    const database = createDatabase({ filename: databasePath });
    const repositories = createRepositoryBundle({
      backend: "sqlite",
      sqlite: { database },
    });
    const manager = new QueueManager(repositories);
    const message: MailboxMessage = {
      id: "message-1",
      providerMessageId: "provider-1",
      internetMessageId: null,
      conversationId: "conversation-1",
      threadKey: "conversation-1",
      source: "mock",
      mailboxId: "mailbox-1",
      folderId: null,
      folderName: null,
      fromName: "Maria Chen",
      fromEmail: "maria.chen@example.com",
      toEmails: [],
      ccEmails: [],
      subject: "Checking status on ORD-1001",
      bodyPreview: "Need an update on ORD-1001",
      bodyText: "Hello support,\n\nCan you send an update on order ORD-1001 today?\n\nThank you.",
      receivedAt: "2026-04-06T08:00:00.000Z",
      sentAt: null,
      isRead: false,
      hasAttachments: false,
      webLink: null,
      extractedIdentifiers: {
        orderNumber: "ORD-1001",
      },
      syncedAt: "2026-04-06T08:05:00.000Z",
      createdAt: "2026-04-06T08:05:00.000Z",
      updatedAt: "2026-04-06T08:05:00.000Z",
      lastEvaluatedAt: null,
    };

    const queueItem = await manager.processMessage(message);

    expect(queueItem.mailboxMessageId).toBe(message.id);
    expect(queueItem.priorityScore).toBeGreaterThanOrEqual(0);

    database.close();
    const reopenedRepositories = createRepositoryBundle({
      backend: "sqlite",
      sqlite: { filename: databasePath },
    });

    const persistedQueueItem = await reopenedRepositories.queueItemRepository.getById(queueItem.id);
    const persistedMessage = await reopenedRepositories.mailboxMessageRepository.getById(message.id);
    const persistedSnapshot = await reopenedRepositories.analysisSnapshotRepository
      .getLatestForQueueItem(queueItem.queueItemId);

    expect(persistedQueueItem?.id).toBe(queueItem.id);
    expect(persistedQueueItem?.mailboxMessageId).toBe(message.id);
    expect(persistedMessage?.subject).toBe(message.subject);
    expect(persistedSnapshot?.queueItemId).toBe(queueItem.queueItemId);
  });
});
