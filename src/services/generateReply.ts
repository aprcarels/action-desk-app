import type { EmailAnalysis, OrderContext } from "../types/actionDesk";

export function generateReply(
  analysis: EmailAnalysis,
  order?: OrderContext,
): string {
  if (!analysis.orderNumber) {
    return "Hello,\n\nI can help with that. Please send over your order number so I can check the latest status for you.\n\nBest,\nSupport Team";
  }

  if (!order) {
    const concernLine =
      analysis.risks.length > 0
        ? "I understand why you reached out, and I am sorry for the inconvenience.\n\n"
        : "";

    return `Hello,\n\n${concernLine}I checked for the latest update on order ${analysis.orderNumber}, but I am not able to confirm the shipment details just yet. Our team is still reviewing it and will share an update as soon as possible.\n\nBest,\nSupport Team`;
  }

  const acknowledgesMissingDelivery =
    order.shipmentStatus === "Delivered" &&
    analysis.risks.some((risk) => risk.includes("not received"));

  const openingLine = analysis.risks.length > 0
    ? "I understand your concern, and I appreciate your patience."
    : "I took a look at your order.";

  const scenarioMessage = getScenarioMessage(order, acknowledgesMissingDelivery);

  return `Hello,\n\n${openingLine}\n\nI checked on order ${order.orderNumber}. ${scenarioMessage}\n\nOrder status: ${order.status}\nShipment status: ${order.shipmentStatus}\nLast updated: ${order.lastUpdated}\n\nIf you have any other questions, feel free to reply.\n\nBest,\nSupport Team`;
}

function getScenarioMessage(
  order: OrderContext,
  acknowledgesMissingDelivery: boolean,
): string {
  if (acknowledgesMissingDelivery) {
    return "I am sorry to hear the tracking shows as delivered and the package still has not arrived. We will review the delivery details and look into this further.";
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
