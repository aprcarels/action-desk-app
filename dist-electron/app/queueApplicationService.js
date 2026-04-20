"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueApplicationService = void 0;
exports.createQueueApplicationService = createQueueApplicationService;
const queueManager_1 = require("../services/queue/queueManager");
const loadInboxQueue_1 = require("../services/loadInboxQueue");
const mapRawInboxEmailToMailboxMessage_1 = require("../mappers/mapRawInboxEmailToMailboxMessage");
const mapQueueItemToProcessedEmailLike_1 = require("../mappers/mapQueueItemToProcessedEmailLike");
const repositories_1 = require("../repositories");
function createDefaultRepositoryBundle() {
    const isElectron = typeof window !== "undefined" &&
        window.actionDeskDesktop?.isElectron;
    if (isElectron) {
        try {
            // Lazy require so browser build does not break
            const { createRepositoryBundle } = require("../repositories/repositoryFactory");
            return createRepositoryBundle({ backend: "sqlite" });
        }
        catch (error) {
            console.warn("SQLite failed, falling back to memory:", error);
        }
    }
    return {
        mailboxMessageRepository: new repositories_1.InMemoryMailboxMessageRepository(),
        queueItemRepository: new repositories_1.InMemoryQueueItemRepository(),
        analysisSnapshotRepository: new repositories_1.InMemoryAnalysisSnapshotRepository(),
    };
}
function chunkArray(items, chunkSize) {
    const chunks = [];
    for (let index = 0; index < items.length; index += chunkSize) {
        chunks.push(items.slice(index, index + chunkSize));
    }
    return chunks;
}
class QueueApplicationService {
    constructor(options) {
        this.repositories = options?.repositories ?? createDefaultRepositoryBundle();
        this.queueManager = new queueManager_1.QueueManager(this.repositories);
    }
    async loadAndProcessInbox(options) {
        const rawInbox = await (0, loadInboxQueue_1.loadRawInboxQueue)(options);
        const mailboxMessages = rawInbox.items.map(mapRawInboxEmailToMailboxMessage_1.mapRawInboxEmailToMailboxMessage);
        await this.queueManager.ingestMessages(mailboxMessages);
        const processedItems = await this.listActiveQueueProcessedEmails();
        return {
            queueItems: await this.queueManager.listActiveQueue(),
            processedItems,
            nextCursor: rawInbox.nextCursor,
        };
    }
    async loadAndProcessInboxWithHeadStart(options) {
        const rawInbox = await (0, loadInboxQueue_1.loadRawInboxQueue)(options);
        const mailboxMessages = rawInbox.items.map(mapRawInboxEmailToMailboxMessage_1.mapRawInboxEmailToMailboxMessage);
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
                    await new Promise((resolve) => {
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
    async listActiveQueue() {
        return this.queueManager.listActiveQueue();
    }
    async listActiveQueueProcessedEmails() {
        const queueItems = await this.queueManager.listActiveQueue();
        const processedItems = [];
        for (const queueItem of queueItems) {
            const mailboxMessage = await this.repositories.mailboxMessageRepository.getById(queueItem.mailboxMessageId);
            const snapshot = await this.repositories.analysisSnapshotRepository.getLatestForQueueItem(queueItem.queueItemId);
            if (!mailboxMessage || !snapshot) {
                continue;
            }
            processedItems.push((0, mapQueueItemToProcessedEmailLike_1.mapQueueItemToProcessedEmailLike)({
                queueItem,
                mailboxMessage,
                snapshot,
            }));
        }
        return processedItems;
    }
    async updateWorkStatus(queueItemId, status) {
        await this.queueManager.updateWorkStatus(queueItemId, status);
    }
    async markResolved(queueItemId) {
        await this.queueManager.markResolved(queueItemId);
    }
    async recomputePriority(queueItemId) {
        return this.queueManager.recomputePriority(queueItemId);
    }
}
exports.QueueApplicationService = QueueApplicationService;
function createQueueApplicationService(options) {
    return new QueueApplicationService(options);
}
