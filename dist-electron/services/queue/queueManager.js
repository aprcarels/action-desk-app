"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueManager = void 0;
const analysisInput_1 = require("../analysisInput");
const runActionDesk_1 = require("../../app/runActionDesk");
const buildQueueItem_1 = require("../../mappers/buildQueueItem");
const mapActionDeskResultToAnalysisSnapshot_1 = require("../../mappers/mapActionDeskResultToAnalysisSnapshot");
function getComparableBody(message) {
    return (message.bodyText ?? message.bodyPreview ?? "").trim();
}
function hasMessageMeaningfullyChanged(currentMessage, storedMessage) {
    return (currentMessage.subject !== storedMessage.subject ||
        currentMessage.receivedAt !== storedMessage.receivedAt ||
        currentMessage.fromEmail !== storedMessage.fromEmail ||
        getComparableBody(currentMessage) !== getComparableBody(storedMessage));
}
function chunkArray(items, chunkSize) {
    const chunks = [];
    for (let index = 0; index < items.length; index += chunkSize) {
        chunks.push(items.slice(index, index + chunkSize));
    }
    return chunks;
}
class QueueManager {
    constructor(dependencies) {
        this.mailboxMessageRepository = dependencies.mailboxMessageRepository;
        this.queueItemRepository = dependencies.queueItemRepository;
        this.analysisSnapshotRepository = dependencies.analysisSnapshotRepository;
    }
    async ingestMessages(messages) {
        const queueItems = [];
        // Process small groups in parallel instead of fully one-by-one.
        // This keeps load controlled while speeding up queue hydration.
        const chunks = chunkArray(messages, 3);
        for (const chunk of chunks) {
            const processedChunk = await Promise.all(chunk.map((message) => this.processMessage(message)));
            queueItems.push(...processedChunk);
        }
        return queueItems;
    }
    async processMessage(message) {
        const queueItemId = `queue:${message.id}`;
        const existingItem = await this.queueItemRepository.getByMailboxMessageId(message.id);
        const existingSnapshot = await this.analysisSnapshotRepository.getLatestForQueueItem(queueItemId);
        const storedMessage = await this.mailboxMessageRepository.getById(message.id);
        const messageChanged = !storedMessage || hasMessageMeaningfullyChanged(message, storedMessage);
        const persistedMessage = {
            ...message,
            lastEvaluatedAt: !messageChanged && storedMessage?.lastEvaluatedAt
                ? storedMessage.lastEvaluatedAt
                : new Date().toISOString(),
            updatedAt: !messageChanged && storedMessage?.updatedAt
                ? storedMessage.updatedAt
                : new Date().toISOString(),
            createdAt: storedMessage?.createdAt ?? message.createdAt,
            syncedAt: new Date().toISOString(),
        };
        if (storedMessage && existingItem && existingSnapshot && !messageChanged) {
            await this.mailboxMessageRepository.upsert(persistedMessage);
            return existingItem;
        }
        const result = await (0, runActionDesk_1.runActionDesk)((0, analysisInput_1.buildAnalysisInput)({
            subject: message.subject,
            body: message.bodyText ?? message.bodyPreview ?? "",
        }), {
            includeReplyDraft: false,
            aiInput: {
                subject: message.subject,
                from: [message.fromName, message.fromEmail].filter(Boolean).join(" "),
                body: message.bodyText ?? message.bodyPreview ?? "",
            },
        });
        const snapshot = (0, mapActionDeskResultToAnalysisSnapshot_1.mapActionDeskResultToAnalysisSnapshot)({
            queueItemId,
            mailboxMessage: persistedMessage,
            result,
        });
        const queueItem = (0, buildQueueItem_1.buildQueueItem)({
            mailboxMessage: persistedMessage,
            snapshot,
            existingItem,
        });
        await this.mailboxMessageRepository.upsert(persistedMessage);
        await this.analysisSnapshotRepository.append(snapshot);
        await this.queueItemRepository.upsert(queueItem);
        return queueItem;
    }
    async listActiveQueue() {
        const items = await this.queueItemRepository.listActive();
        return [...items].sort((left, right) => {
            if (right.priorityScore !== left.priorityScore) {
                return right.priorityScore - left.priorityScore;
            }
            return Date.parse(left.latestCustomerMessageAt) - Date.parse(right.latestCustomerMessageAt);
        });
    }
    async updateWorkStatus(id, status) {
        await this.queueItemRepository.updateWorkStatus(id, status);
    }
    async recomputePriority(id) {
        const existingItem = await this.queueItemRepository.getById(id);
        if (!existingItem) {
            return null;
        }
        const message = await this.mailboxMessageRepository.getById(existingItem.mailboxMessageId);
        if (!message) {
            return null;
        }
        const reprocessMessage = {
            ...message,
            updatedAt: new Date().toISOString(),
            syncedAt: new Date().toISOString(),
            lastEvaluatedAt: new Date().toISOString(),
        };
        const result = await (0, runActionDesk_1.runActionDesk)((0, analysisInput_1.buildAnalysisInput)({
            subject: reprocessMessage.subject,
            body: reprocessMessage.bodyText ?? reprocessMessage.bodyPreview ?? "",
        }), {
            includeReplyDraft: false,
            aiInput: {
                subject: reprocessMessage.subject,
                from: [reprocessMessage.fromName, reprocessMessage.fromEmail]
                    .filter(Boolean)
                    .join(" "),
                body: reprocessMessage.bodyText ?? reprocessMessage.bodyPreview ?? "",
            },
        });
        const snapshot = (0, mapActionDeskResultToAnalysisSnapshot_1.mapActionDeskResultToAnalysisSnapshot)({
            queueItemId: existingItem.queueItemId,
            mailboxMessage: reprocessMessage,
            result,
        });
        const queueItem = (0, buildQueueItem_1.buildQueueItem)({
            mailboxMessage: reprocessMessage,
            snapshot,
            existingItem,
        });
        await this.mailboxMessageRepository.upsert(reprocessMessage);
        await this.analysisSnapshotRepository.append(snapshot);
        await this.queueItemRepository.upsert(queueItem);
        return queueItem;
    }
    async markResolved(id) {
        await this.updateWorkStatus(id, "done");
    }
    async getLatestSnapshot(queueItemId) {
        return this.analysisSnapshotRepository.getLatestForQueueItem(queueItemId);
    }
}
exports.QueueManager = QueueManager;
