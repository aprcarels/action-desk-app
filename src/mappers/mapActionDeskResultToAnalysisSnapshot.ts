import { deriveIssueType } from "../domain/issueType";
import type { ActionDeskAnalysisSnapshot, AnalysisSource, MailboxMessage } from "../domain";
import { mapActionDeskResultToPriorityReasons, mapPriorityScoreToBand } from "./mapPriority";
import type { ActionDeskResult } from "../types/actionDesk";

function mapCurrentAnalysisSource(source: ActionDeskResult["analysisSource"]): AnalysisSource {
  if (source === "ai" || source === "hybrid") {
    return source;
  }

  return "heuristic";
}

function buildExtractedSignals(result: ActionDeskResult): string[] {
  const signals = new Set<string>();

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

export function mapActionDeskResultToAnalysisSnapshot(options: {
  queueItemId: string;
  mailboxMessage: MailboxMessage;
  result: ActionDeskResult;
}): ActionDeskAnalysisSnapshot {
  const { queueItemId, mailboxMessage, result } = options;
  const createdAt = new Date().toISOString();
  const priorityReasons = mapActionDeskResultToPriorityReasons(result);
  const issueType = deriveIssueType(result.analysis, result.orderContext);

  return {
    id: `${queueItemId}:${createdAt}`,
    queueItemId,
    mailboxMessageId: mailboxMessage.id,
    intent: result.analysis.intent,
    urgency: result.analysis.urgency,
    sentiment: result.analysis.risks.includes("customer_frustration") ? "negative" : null,
    issueType,
    category: result.analysis.workType ?? result.analysis.messageType ?? null,
    detectedOrderNumber:
      result.analysis.orderNumber ??
      mailboxMessage.extractedIdentifiers?.orderNumber ??
      null,
    detectedCaseNumber: mailboxMessage.extractedIdentifiers?.caseNumber ?? null,
    detectedTrackingNumber: mailboxMessage.extractedIdentifiers?.trackingNumber ?? null,
    actionable: result.analysis.actionability === "action_required",
    customerFacing: result.analysis.workType === "customer_support",
    riskFlags: [...result.analysis.risks],
    extractedSignals: buildExtractedSignals(result),
    priorityScore: result.priorityScore,
    priorityBand: mapPriorityScoreToBand(result.priorityScore),
    priorityReasons,
    summary: result.analysis.summary || null,
    recommendedAction: result.analysis.nextAction || null,
    replyDraft: result.replyDraft || null,
    warnings: result.warning ? [result.warning] : [],
    analysisSource: mapCurrentAnalysisSource(result.analysisSource),
    aiClassification: result.aiClassification
      ? { ...result.aiClassification }
      : undefined,
    createdAt,
  };
}
