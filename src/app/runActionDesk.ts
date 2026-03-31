import type { ActionDeskResult } from "../types/actionDesk";
import { analyzeEmailWithSource } from "../services/aiService";
import { getMockOrderStatus } from "../services/getMockOrderStatus";
import { generateReply } from "../services/generateReply";

export async function runActionDesk(email: string): Promise<ActionDeskResult> {
  const { analysis, analysisSource } = await analyzeEmailWithSource(email);
  const fetchedOrderContext = analysis.orderNumber
    ? await getMockOrderStatus(analysis.orderNumber)
    : null;
  const orderContext = fetchedOrderContext ?? undefined;
  const replyDraft = generateReply(analysis, orderContext);

  return {
    analysis,
    analysisSource,
    orderContext,
    replyDraft,
    warning:
      analysis.orderNumber && !orderContext
        ? "Order status not confirmed yet"
        : undefined,
  };
}
