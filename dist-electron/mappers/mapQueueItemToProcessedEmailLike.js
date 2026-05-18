"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapQueueItemToProcessedEmailLike = mapQueueItemToProcessedEmailLike;
const analysisTaxonomy_1 = require("../services/analysisTaxonomy");
const mapMailboxMessageToEmailItem_1 = require("./mapMailboxMessageToEmailItem");
function mapSnapshotAnalysisToCurrentAnalysis(queueItem, snapshot) {
    const urgency = snapshot.urgency === "high" ||
        snapshot.urgency === "low" ||
        snapshot.urgency === "medium"
        ? snapshot.urgency
        : "medium";
    const normalizedIntent = snapshot.intent
        ? (0, analysisTaxonomy_1.normalizeIntent)(snapshot.intent)
        : "general_support";
    const normalizedRisks = (0, analysisTaxonomy_1.normalizeRisks)(snapshot.riskFlags);
    const customerFacing = snapshot.customerFacing;
    const actionable = snapshot.actionable;
    return {
        summary: queueItem.summary ?? snapshot.summary ?? "",
        intent: normalizedIntent,
        urgency,
        confidence: snapshot.analysisSource === "ai" ? "high" : "medium",
        orderNumber: queueItem.orderNumber ??
            snapshot.detectedOrderNumber ??
            undefined,
        risks: normalizedRisks,
        nextAction: queueItem.recommendedAction ??
            snapshot.recommendedAction ??
            "",
        actionability: actionable ? "action_required" : "review_needed",
        replyNeeded: (queueItem.replyDraft ?? snapshot.replyDraft)?.trim()
            ? "yes"
            : actionable
                ? "maybe"
                : "no",
        workType: customerFacing ? "customer_support" : "unknown",
        messageType: customerFacing ? "customer_request" : "general_support",
        hasClearRequest: actionable,
        isThreadContinuation: false,
    };
}
function mapSnapshotSourceToCurrentSource(source) {
    return source;
}
function mapQueueItemToOrderContext(queueItem) {
    if (!queueItem.orderNumber) {
        return undefined;
    }
    return {
        orderNumber: queueItem.orderNumber,
        status: "Unknown",
        shipmentStatus: "Unknown",
        lastUpdated: queueItem.updatedAt,
    };
}
function mapQueueItemToProcessedEmailLike(options) {
    const { queueItem, mailboxMessage, snapshot } = options;
    const email = (0, mapMailboxMessageToEmailItem_1.mapMailboxMessageToEmailItem)(mailboxMessage);
    const result = {
        analysis: mapSnapshotAnalysisToCurrentAnalysis(queueItem, snapshot),
        analysisSource: mapSnapshotSourceToCurrentSource(snapshot.analysisSource),
        orderContext: mapQueueItemToOrderContext(queueItem),
        replyDraft: queueItem.replyDraft ?? snapshot.replyDraft ?? "",
        priorityScore: queueItem.priorityScore,
        priorityBreakdown: queueItem.priorityReasons.map((reason) => ({
            label: reason,
            points: 0,
        })),
        warning: queueItem.warnings[0],
    };
    return {
        email,
        status: "processed",
        result,
        issueCount: result.analysis.risks.length,
        previewText: queueItem.summary?.trim() ||
            email.previewText?.trim() ||
            email.body.replace(/\s+/g, " ").trim(),
        // ✅ THIS IS THE IMPORTANT ADD
        queueItemId: queueItem.id,
    };
}
