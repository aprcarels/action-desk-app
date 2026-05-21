import { normalizeIntent, normalizeRisks } from "../services/analysisTaxonomy";
import type { ProcessedEmail } from "../types/actionDesk";
import type {
  ActionDeskResult,
  EmailAnalysis,
  OrderContext,
} from "../types/actionDesk";
import type {
  ActionDeskAnalysisSnapshot as PersistedAnalysisSnapshot,
  MailboxMessage as PersistedMailboxMessage,
  QueueItem,
} from "../domain";
import { mapMailboxMessageToEmailItem } from "./mapMailboxMessageToEmailItem";

function mapSnapshotAnalysisToCurrentAnalysis(
  queueItem: QueueItem,
  snapshot: PersistedAnalysisSnapshot,
): EmailAnalysis {
  const urgency =
    snapshot.urgency === "high" ||
    snapshot.urgency === "low" ||
    snapshot.urgency === "medium"
      ? snapshot.urgency
      : "medium";

  const normalizedIntent = snapshot.intent
    ? normalizeIntent(snapshot.intent)
    : "general_support";

  const normalizedRisks = normalizeRisks(snapshot.riskFlags);

  const customerFacing = snapshot.customerFacing;
  const actionable = snapshot.actionable;

  return {
    summary: queueItem.summary ?? snapshot.summary ?? "",
    intent: normalizedIntent,
    urgency,
    confidence: snapshot.analysisSource === "ai" ? "high" : "medium",
    orderNumber:
      queueItem.orderNumber ??
      snapshot.detectedOrderNumber ??
      undefined,
    risks: normalizedRisks,
    nextAction:
      queueItem.recommendedAction ??
      snapshot.recommendedAction ??
      "",
    actionability: actionable ? "action_required" : "review_needed",
    replyNeeded:
      (queueItem.replyDraft ?? snapshot.replyDraft)?.trim()
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

function mapSnapshotSourceToCurrentSource(
  source: PersistedAnalysisSnapshot["analysisSource"],
): ActionDeskResult["analysisSource"] {
  return source;
}

function mapQueueItemToOrderContext(
  queueItem: QueueItem,
): OrderContext | undefined {
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

export function mapQueueItemToProcessedEmailLike(options: {
  queueItem: QueueItem;
  mailboxMessage: PersistedMailboxMessage;
  snapshot: PersistedAnalysisSnapshot;
}): ProcessedEmail {
  const { queueItem, mailboxMessage, snapshot } = options;

  const email = mapMailboxMessageToEmailItem(mailboxMessage);

  const result: ActionDeskResult = {
    analysis: mapSnapshotAnalysisToCurrentAnalysis(queueItem, snapshot),
    analysisSource: mapSnapshotSourceToCurrentSource(
      snapshot.analysisSource,
    ),
    aiClassification: snapshot.aiClassification
      ? { ...snapshot.aiClassification }
      : undefined,
    orderContext: mapQueueItemToOrderContext(queueItem),
    replyDraft: queueItem.replyDraft ?? snapshot.replyDraft ?? "",
    replyDraftSource: queueItem.replyDraftSource ?? snapshot.replyDraftSource ?? "rules",
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
    previewText:
      queueItem.summary?.trim() ||
      email.previewText?.trim() ||
      email.body.replace(/\s+/g, " ").trim(),

    // ✅ THIS IS THE IMPORTANT ADD
    queueItemId: queueItem.id,
  };
}
