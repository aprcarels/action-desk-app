import type { EmailAnalysis, OrderContext } from "../types/actionDesk";

export type IssueType =
  | "delivered_not_received"
  | "delayed_shipment"
  | "missing_order"
  | "general_issue";

export function deriveIssueType(
  analysis: EmailAnalysis,
  orderContext?: OrderContext,
): IssueType {
  if (analysis.risks.includes("delivered_not_received")) {
    return "delivered_not_received";
  }

  if (
    analysis.risks.includes("delay_or_no_tracking_update") ||
    orderContext?.shipmentStatus === "Delayed" ||
    orderContext?.shipmentStatus === "Exception"
  ) {
    return "delayed_shipment";
  }

  if (analysis.intent === "where_is_my_order" && !analysis.orderNumber && !orderContext) {
    return "missing_order";
  }

  return "general_issue";
}

export function getIssueTypeLabel(issueType: IssueType): string {
  switch (issueType) {
    case "delivered_not_received":
      return "Delivered but not received";
    case "delayed_shipment":
      return "Delayed shipment";
    case "missing_order":
      return "Missing order details";
    case "general_issue":
    default:
      return "General issue";
  }
}

export function getIssueTypeDraftExplanation(issueType: IssueType): string {
  switch (issueType) {
    case "delivered_not_received":
      return "This draft uses a more empathetic tone and suggests confirming delivery details.";
    case "delayed_shipment":
      return "This draft acknowledges the delay and explains that shipment status is being reviewed.";
    case "missing_order":
      return "This draft asks for the order number or identifying information needed to investigate.";
    case "general_issue":
    default:
      return "This draft gives a general support acknowledgment and response.";
  }
}
