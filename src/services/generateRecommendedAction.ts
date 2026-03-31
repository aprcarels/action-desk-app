import type { EmailAnalysis, OrderContext, RiskCode } from "../types/actionDesk";

type RecommendedActionInput = Pick<
  EmailAnalysis,
  "intent" | "urgency" | "risks" | "orderNumber"
> & {
  orderContext?: OrderContext;
};

function hasRisk(risks: RiskCode[], risk: RiskCode): boolean {
  return risks.includes(risk);
}

function getOrderLabel(orderNumber?: string): string {
  return orderNumber ? `for ${orderNumber}` : "for the order";
}

export function generateRecommendedAction({
  intent,
  urgency,
  risks,
  orderNumber,
  orderContext,
}: RecommendedActionInput): string {
  const orderLabel = getOrderLabel(orderNumber);
  const statusLabel = orderContext
    ? `${orderContext.status.toLowerCase()} / ${orderContext.shipmentStatus.toLowerCase()}`
    : null;
  const hasDelayRisk = hasRisk(risks, "delay_or_no_tracking_update");
  const hasMissingDeliveryRisk = hasRisk(risks, "delivered_not_received");
  const hasFrustrationRisk = hasRisk(risks, "customer_frustration");
  const hasDuplicateShipmentRisk = hasRisk(risks, "duplicate_shipment_possible");

  if (intent === "pod_request") {
    return orderNumber
      ? orderContext?.shipmentStatus === "Delivered"
        ? `Pull the POD ${orderLabel}, confirm who signed, and send the delivery record back to the customer.`
        : `Review the latest delivery status ${orderLabel}, confirm whether POD is available yet, and update the customer.`
      : "Ask for the order number so the delivery record and POD can be retrieved.";
  }

  if (intent === "cancellation_request") {
    return orderNumber
      ? orderContext?.status === "Processing" || orderContext?.shipmentStatus === "Label Created"
        ? `Try to stop fulfillment ${orderLabel}, confirm whether cancellation is still possible, and reply with the outcome.`
        : `Confirm whether ${orderLabel} has already shipped, then advise the customer on cancellation or return options.`
      : "Ask for the order number so cancellation eligibility can be checked.";
  }

  if (intent === "short_shipment") {
    return orderNumber
      ? `Review the shipped quantity ${orderLabel}, confirm which items are short, and reply with the replacement or credit plan.`
      : "Ask for the order number so the shipment contents can be checked against the order.";
  }

  if (intent === "damaged_shipment") {
    return orderNumber
      ? `Document the reported damage ${orderLabel}, confirm replacement or claim steps, and send the resolution plan.`
      : "Ask for the order number so the damaged shipment can be reviewed and next steps confirmed.";
  }

  if (intent === "address_change") {
    return orderNumber
      ? orderContext?.status === "Processing" || orderContext?.shipmentStatus === "Label Created"
        ? `Check whether the ship-to address can still be corrected ${orderLabel}, update it if allowed, and confirm back to the customer.`
        : `Confirm whether ${orderLabel} is already too far in transit for an address change, then reply with the available options.`
      : "Ask for the order number so the address change request can be reviewed.";
  }

  if (intent === "billing_question") {
    return orderNumber
      ? `Review the invoice and charges ${orderLabel}, confirm the source of the discrepancy, and reply with the correction or explanation.`
      : "Ask for the order number or invoice reference so the billing issue can be reviewed.";
  }

  if (intent === "where_is_my_order") {
    if (!orderNumber) {
      return "Ask the customer for the order number so the shipment can be located before sending a status update.";
    }

    if (hasDuplicateShipmentRisk) {
      return `Check shipment history and tracking ${orderLabel}, confirm whether a duplicate shipment was released, and reply with the resolution.`;
    }

    if (hasMissingDeliveryRisk) {
      return `Review the delivery scan and carrier notes ${orderLabel}, check for misdelivery, and update the customer on the investigation.`;
    }

    if (orderContext?.shipmentStatus === "Exception" || orderContext?.status === "Delayed") {
      return `Review the carrier exception ${orderLabel}, confirm the latest movement and delay reason, and send the customer a concrete update.`;
    }

    if (statusLabel) {
      return `Verify the latest shipment status (${statusLabel}) ${orderLabel}, then send the customer the current tracking update.`;
    }

    if (hasDelayRisk) {
      return `Check the latest shipment scan ${orderLabel}, confirm why updates have stalled, and reply with the next expected movement.`;
    }

    return `Verify the latest shipment status ${orderLabel} and send the customer the current update.`;
  }

  if (orderNumber && hasFrustrationRisk) {
    return `Review the latest order details ${orderLabel}, confirm the next clear step, and send the customer a direct update today.`;
  }

  if (orderNumber) {
    return `Review the latest order details ${orderLabel} and reply with the next support step.`;
  }

  if (urgency === "high") {
    return "Review the request promptly, identify the missing details needed to act, and send the customer a clear next step.";
  }

  return "Review the request details and reply with the next support step.";
}
