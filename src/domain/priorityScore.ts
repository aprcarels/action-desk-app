import type {
  EmailAnalysis,
  OrderContext,
  PriorityBreakdownItem,
} from "../types/actionDesk";

type PriorityScoreResult = {
  score: number;
  breakdown: PriorityBreakdownItem[];
};

function isOperationalLogisticsIntent(intent: EmailAnalysis["intent"]): boolean {
  return (
    intent === "operational_logistics_scheduling" ||
    intent === "routing_coordination" ||
    intent === "carrier_pickup_scheduling"
  );
}

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

  if (analysis.workType === "suspicious") {
    addPoints("Suspicious or phishing-related work", -40);
  } else if (analysis.workType === "system") {
    addPoints("System or admin work", -35);
  } else if (analysis.workType === "internal") {
    addPoints("Internal or awareness-only work", -25);
  } else if (analysis.workType === "vendor") {
    addPoints("Vendor or account-maintenance work", -20);
  } else if (analysis.workType === "unknown") {
    addPoints("Ownership unclear", -15);
  } else if (analysis.workType === "customer_support") {
    addPoints("Customer-support case", 10);
  }

  if (analysis.isThreadContinuation && !analysis.hasClearRequest) {
    addPoints("Short continuation reply without a clear ask", -25);
  }

  if (analysis.urgency === "high") {
    addPoints("High urgency", 40);
  } else if (analysis.urgency === "medium") {
    addPoints("Medium urgency", 20);
  }

  if (analysis.actionability === "action_required") {
    addPoints("Action required", 15);
  } else if (analysis.actionability === "review_needed") {
    addPoints("Review needed", 5);
  } else if (analysis.actionability === "awareness_only") {
    addPoints("Awareness only", -10);
  } else if (analysis.actionability === "no_action_needed") {
    addPoints("No action needed", -20);
  }

  if (analysis.messageType === "internal_alert") {
    addPoints("Automated or internal alert", -10);
  } else if (analysis.messageType === "informational") {
    addPoints("Informational message", -10);
  }

  if (analysis.replyNeeded === "yes") {
    addPoints("Customer reply needed", 10);
  } else if (analysis.replyNeeded === "no") {
    addPoints("No customer reply needed", -10);
  }

  if (analysis.hasClearRequest) {
    addPoints("Explicit current request", 10);
  }

  if (analysis.hasDeadlineRequest) {
    addPoints("Deadline-driven shipping request", 20);
  }

  if (analysis.intent === "operational_confirmation") {
    addPoints("Operational confirmation request", 15);
  }

  if (isOperationalLogisticsIntent(analysis.intent)) {
    addPoints("Operational logistics scheduling", 15);
  }

  if (analysis.hasConfirmationRequest && analysis.hasLogisticsContext) {
    addPoints("Current logistics confirmation ask", 15);
  }

  if (analysis.hasOperationalTimingSignal && analysis.hasConfirmationRequest) {
    addPoints("Time-bound confirmation request", 10);
  }

  if (analysis.deadlineState === "past_due") {
    addPoints("Requested timing may already be past due", 15);
  }

  if (
    analysis.intent === "billing_question" ||
    analysis.intent === "cancellation_request" ||
    analysis.intent === "damaged_shipment" ||
    analysis.intent === "short_shipment" ||
    analysis.intent === "operational_confirmation" ||
    analysis.intent === "where_is_my_order"
  ) {
    addPoints("Customer-impacting issue type", 10);
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
    score: Math.max(0, Math.min(100, score)),
    breakdown,
  };
}
