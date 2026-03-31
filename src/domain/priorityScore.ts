import type {
  EmailAnalysis,
  OrderContext,
  PriorityBreakdownItem,
} from "../types/actionDesk";

type PriorityScoreResult = {
  score: number;
  breakdown: PriorityBreakdownItem[];
};

export function computePriorityScore(
  analysis: EmailAnalysis,
  orderContext?: OrderContext,
): PriorityScoreResult {
  let score = 0;
  const breakdown: PriorityBreakdownItem[] = [];

  function addPoints(label: string, points: number) {
    score += points;
    breakdown.push({ label, points });
  }

  if (analysis.urgency === "high") {
    addPoints("High urgency", 40);
  } else if (analysis.urgency === "medium") {
    addPoints("Medium urgency", 20);
  }

  if (analysis.orderNumber && !orderContext) {
    addPoints("Order number present but order context unavailable", 20);
  }

  if (orderContext?.status === "Delayed" || orderContext?.shipmentStatus === "Exception") {
    addPoints("Delayed or exception shipment status", 30);
  } else if (
    orderContext?.shipmentStatus === "Delivered" &&
    analysis.risks.includes("delivered_not_received")
  ) {
    addPoints("Delivered order reported as not received", 30);
  } else if (analysis.risks.includes("delay_or_no_tracking_update")) {
    addPoints("Missing or delayed order updates", 20);
  }

  analysis.risks.forEach((risk) => {
    addPoints(`Risk: ${risk}`, 10);
  });

  return {
    score,
    breakdown,
  };
}
