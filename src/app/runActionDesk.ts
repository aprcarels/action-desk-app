import type { ActionDeskResult } from "../types/actionDesk";
import { computePriorityScore } from "../domain/priorityScore";
import { analyzeEmailWithSource } from "../services/aiService";
import { generateRecommendedAction } from "../services/generateRecommendedAction";
import { getMockOrderStatus } from "../services/getMockOrderStatus";
import { generateReply } from "../services/generateReply";

export async function runActionDesk(email: string): Promise<ActionDeskResult> {
  const { analysis, analysisSource } = await analyzeEmailWithSource(email);
  const fetchedOrderContext = analysis.orderNumber
    ? await getMockOrderStatus(analysis.orderNumber)
    : null;
  const orderContext = fetchedOrderContext ?? undefined;
  const nextAction = generateRecommendedAction({
    intent: analysis.intent,
    urgency: analysis.urgency,
    risks: analysis.risks,
    orderNumber: analysis.orderNumber,
    orderContext,
  });
  const nextAnalysis = {
    ...analysis,
    nextAction,
  };
  const replyDraft = generateReply(nextAnalysis, orderContext);
  const priorityResult = computePriorityScore(nextAnalysis, orderContext);

  return {
    analysis: nextAnalysis,
    analysisSource,
    orderContext,
    replyDraft,
    priorityScore: priorityResult.score,
    priorityBreakdown: priorityResult.breakdown,
    warning:
      analysis.orderNumber && !orderContext
        ? "Order status not confirmed yet"
        : undefined,
  };
}
