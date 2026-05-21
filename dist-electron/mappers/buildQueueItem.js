"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildQueueItem = buildQueueItem;
const mapPriority_1 = require("./mapPriority");
function buildQueueItem(options) {
    const { mailboxMessage, snapshot, existingItem } = options;
    const now = new Date().toISOString();
    const isResolved = existingItem?.isResolved === true ||
        existingItem?.workStatus === "done" ||
        existingItem?.workStatus === "not_relevant";
    const workStatus = isResolved ? existingItem?.workStatus ?? "done" : existingItem?.workStatus ?? "active";
    const isActive = workStatus !== "done" &&
        workStatus !== "not_relevant";
    return {
        id: existingItem?.id ?? snapshot.queueItemId,
        queueItemId: existingItem?.queueItemId ?? snapshot.queueItemId,
        mailboxMessageId: mailboxMessage.id,
        conversationId: mailboxMessage.conversationId,
        subject: mailboxMessage.subject,
        customerName: mailboxMessage.fromName ?? null,
        customerEmail: mailboxMessage.fromEmail,
        orderNumber: snapshot.detectedOrderNumber ?? mailboxMessage.extractedIdentifiers?.orderNumber ?? null,
        caseNumber: snapshot.detectedCaseNumber ?? mailboxMessage.extractedIdentifiers?.caseNumber ?? null,
        trackingNumber: snapshot.detectedTrackingNumber ?? mailboxMessage.extractedIdentifiers?.trackingNumber ?? null,
        workStatus,
        ownerId: existingItem?.ownerId ?? null,
        priorityScore: snapshot.priorityScore,
        priorityBand: snapshot.priorityBand,
        priorityReasons: (0, mapPriority_1.mapSnapshotToPriorityReasons)(snapshot),
        category: snapshot.category ?? null,
        issueType: snapshot.issueType ?? null,
        summary: snapshot.summary ?? null,
        recommendedAction: snapshot.recommendedAction ?? null,
        replyDraft: snapshot.replyDraft ?? null,
        replyDraftSource: snapshot.replyDraftSource ?? null,
        warnings: [...snapshot.warnings],
        isActive,
        isResolved,
        snoozedUntil: existingItem?.snoozedUntil ?? null,
        completedAt: isResolved ? existingItem?.completedAt ?? now : null,
        deferredUntil: existingItem?.deferredUntil ?? null,
        firstSeenAt: existingItem?.firstSeenAt ?? mailboxMessage.receivedAt,
        latestCustomerMessageAt: mailboxMessage.receivedAt,
        lastSyncedAt: mailboxMessage.syncedAt,
        lastEvaluatedAt: mailboxMessage.lastEvaluatedAt ?? snapshot.createdAt,
        updatedAt: now,
        createdAt: existingItem?.createdAt ?? now,
    };
}
