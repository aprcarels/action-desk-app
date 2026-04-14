import type { ActionDeskResult } from "../types/actionDesk";
import { computePriorityScore } from "../domain/priorityScore";
import { analyzeEmailWithSource } from "../services/aiService";
import { generateRecommendedAction } from "../services/generateRecommendedAction";
import { generateReply } from "../services/generateReply";
import { getOrderContextProvider } from "../services/orderContextProvider";
import { refineEmailAnalysis } from "../services/refineEmailAnalysis";

type RunActionDeskOptions = {
  includeReplyDraft?: boolean;
};

export async function runActionDesk(
  email: string,
  options?: RunActionDeskOptions,
): Promise<ActionDeskResult> {
  const includeReplyDraft = options?.includeReplyDraft ?? true;

  const { analysis, analysisSource } = await analyzeEmailWithSource(email);
  const refinedAnalysis = refineEmailAnalysis(email, analysis);

  const orderContextProvider = getOrderContextProvider();
  const fetchedOrderContext = refinedAnalysis.orderNumber
    ? await orderContextProvider.getOrderContext(refinedAnalysis.orderNumber)
    : null;
  const orderContext = fetchedOrderContext ?? undefined;

  const nextAction = generateRecommendedAction({
    intent: refinedAnalysis.intent,
    urgency: refinedAnalysis.urgency,
    risks: refinedAnalysis.risks,
    orderNumber: refinedAnalysis.orderNumber,
    caseIdentifiers: refinedAnalysis.caseIdentifiers,
    hasDeadlineRequest: refinedAnalysis.hasDeadlineRequest,
    deadlineState: refinedAnalysis.deadlineState,
    messageType: refinedAnalysis.messageType,
    actionability: refinedAnalysis.actionability,
    replyNeeded: refinedAnalysis.replyNeeded,
    workType: refinedAnalysis.workType,
    hasConfirmationRequest: refinedAnalysis.hasConfirmationRequest,
    hasLogisticsContext: refinedAnalysis.hasLogisticsContext,
    hasOperationalTimingSignal: refinedAnalysis.hasOperationalTimingSignal,
    orderContext,
  });

  const nextAnalysis = {
    ...refinedAnalysis,
    nextAction,
  };

  const replyDraft = includeReplyDraft
    ? generateReply(nextAnalysis, orderContext)
    : "";

  const priorityResult = computePriorityScore(nextAnalysis, orderContext);

  return {
    analysis: nextAnalysis,
    analysisSource,
    orderContext,
    replyDraft,
    priorityScore: priorityResult.score,
    priorityBreakdown: priorityResult.breakdown,
    warning:
      refinedAnalysis.orderNumber &&
      !orderContext &&
      refinedAnalysis.actionability === "action_required"
        ? "Order status not confirmed yet"
        : undefined,
  };
}