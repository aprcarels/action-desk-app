"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapActionDeskResultToAnalysisSnapshot = mapActionDeskResultToAnalysisSnapshot;
const issueType_1 = require("../domain/issueType");
const mapPriority_1 = require("./mapPriority");
function mapCurrentAnalysisSource(source) {
    return source === "ai" ? "ai" : "heuristic";
}
function buildExtractedSignals(result) {
    const signals = new Set();
    if (result.analysis.hasClearRequest) {
        signals.add("clear_request");
    }
    if (result.analysis.hasDeadlineRequest) {
        signals.add("deadline_request");
    }
    if (result.analysis.hasConfirmationRequest) {
        signals.add("confirmation_request");
    }
    if (result.analysis.hasLogisticsContext) {
        signals.add("logistics_context");
    }
    if (result.analysis.hasOperationalTimingSignal) {
        signals.add("operational_timing_signal");
    }
    if (result.analysis.isThreadContinuation) {
        signals.add("thread_continuation");
    }
    return Array.from(signals);
}
function mapActionDeskResultToAnalysisSnapshot(options) {
    const { queueItemId, mailboxMessage, result } = options;
    const createdAt = new Date().toISOString();
    const priorityReasons = (0, mapPriority_1.mapActionDeskResultToPriorityReasons)(result);
    const issueType = (0, issueType_1.deriveIssueType)(result.analysis, result.orderContext);
    return {
        id: `${queueItemId}:${createdAt}`,
        queueItemId,
        mailboxMessageId: mailboxMessage.id,
        intent: result.analysis.intent,
        urgency: result.analysis.urgency,
        sentiment: result.analysis.risks.includes("customer_frustration") ? "negative" : null,
        issueType,
        category: result.analysis.workType ?? result.analysis.messageType ?? null,
        detectedOrderNumber: result.analysis.orderNumber ??
            mailboxMessage.extractedIdentifiers?.orderNumber ??
            null,
        detectedCaseNumber: mailboxMessage.extractedIdentifiers?.caseNumber ?? null,
        detectedTrackingNumber: mailboxMessage.extractedIdentifiers?.trackingNumber ?? null,
        actionable: result.analysis.actionability === "action_required",
        customerFacing: result.analysis.workType === "customer_support",
        riskFlags: [...result.analysis.risks],
        extractedSignals: buildExtractedSignals(result),
        priorityScore: result.priorityScore,
        priorityBand: (0, mapPriority_1.mapPriorityScoreToBand)(result.priorityScore),
        priorityReasons,
        summary: result.analysis.summary || null,
        recommendedAction: result.analysis.nextAction || null,
        replyDraft: result.replyDraft || null,
        warnings: result.warning ? [result.warning] : [],
        analysisSource: mapCurrentAnalysisSource(result.analysisSource),
        createdAt,
    };
}
