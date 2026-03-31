import { deriveIssueType } from "../domain/issueType";
import type { EmailAnalysis, OrderContext } from "../types/actionDesk";

export function generateReply(
  analysis: EmailAnalysis,
  order?: OrderContext,
): string {
  const issueType = deriveIssueType(analysis, order);

  if (issueType === "missing_order") {
    return "Hello,\n\nI can help with that. Please send over your order number, or the best identifying details from the confirmation, so I can look up the shipment and share the latest status.\n\nBest,\nSupport Team";
  }

  if (!order) {
    const concernLine = getConcernLine(issueType, analysis.risks.length > 0);
    const reviewLine =
      issueType === "delivered_not_received"
        ? "We are reviewing the delivery details and will confirm the latest scan information as soon as possible."
        : issueType === "delayed_shipment"
          ? "We are reviewing the current shipment status and the next carrier update now, and we will share the latest information as soon as possible."
          : "Our team is still reviewing it and will share an update as soon as possible.";

    return `Hello,\n\n${concernLine}I checked for the latest update on order ${analysis.orderNumber}, but I am not able to confirm the shipment details just yet. ${reviewLine}\n\nBest,\nSupport Team`;
  }

  const acknowledgesMissingDelivery =
    order.shipmentStatus === "Delivered" &&
    analysis.risks.includes("delivered_not_received");

  const openingLine = getOpeningLine(issueType, analysis.risks.length > 0);

  const scenarioMessage = getScenarioMessage(order, issueType, acknowledgesMissingDelivery);

  return `Hello,\n\n${openingLine}\n\nI checked on order ${order.orderNumber}. ${scenarioMessage}\n\nOrder status: ${order.status}\nShipment status: ${order.shipmentStatus}\nLast updated: ${order.lastUpdated}\n\nIf you have any other questions, feel free to reply.\n\nBest,\nSupport Team`;
}

function getConcernLine(issueType: ReturnType<typeof deriveIssueType>, hasRisks: boolean): string {
  if (issueType === "delivered_not_received") {
    return "I am sorry to hear the shipment shows as delivered and has still not arrived.\n\n";
  }

  if (issueType === "delayed_shipment") {
    return "I understand the delay is frustrating, and I appreciate your patience.\n\n";
  }

  return hasRisks
    ? "I understand why you reached out, and I am sorry for the inconvenience.\n\n"
    : "";
}

function getOpeningLine(issueType: ReturnType<typeof deriveIssueType>, hasRisks: boolean): string {
  if (issueType === "delivered_not_received") {
    return "I am sorry to hear the tracking shows the order as delivered and you still have not received it.";
  }

  if (issueType === "delayed_shipment") {
    return "I understand the delay is frustrating, and I reviewed the latest shipment status for you.";
  }

  return hasRisks
    ? "I understand your concern, and I appreciate your patience."
    : "I took a look at your order.";
}

function getScenarioMessage(
  order: OrderContext,
  issueType: ReturnType<typeof deriveIssueType>,
  acknowledgesMissingDelivery: boolean,
): string {
  if (acknowledgesMissingDelivery) {
    return "We will review the delivery details, confirm the latest scan information, and investigate where the package may have been left.";
  }

  if (issueType === "delayed_shipment") {
    if (order.shipmentStatus === "Exception") {
      return "It looks like the shipment has run into a carrier issue, which is likely causing the delay. We are reviewing the exception details and next step now.";
    }

    if (order.shipmentStatus === "In Transit") {
      return "The shipment is still moving through the carrier network. We are reviewing the latest status so we can confirm the next expected update.";
    }
  }

  if (order.shipmentStatus === "Exception") {
    return "It looks like the shipment has run into a carrier issue, which is likely causing the delay. We are reviewing the latest details now.";
  }

  if (order.shipmentStatus === "In Transit") {
    return "The shipment is still in transit, and the latest tracking activity shows it is moving through the carrier network.";
  }

  if (order.shipmentStatus === "Label Created") {
    return "A shipping label has been created for the order, which usually means the package has not been picked up by the carrier yet.";
  }

  return "Here is the latest update I found for your order.";
}
