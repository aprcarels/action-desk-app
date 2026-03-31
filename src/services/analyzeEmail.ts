import type { EmailAnalysis } from "../types/actionDesk";
import type { IntentCode, RiskCode } from "../types/actionDesk";
import { generateRecommendedAction } from "./generateRecommendedAction";

const ORDER_NUMBER_REGEX = /\bORD-\d+\b/i;
const HIGH_URGENCY_KEYWORDS = ["urgent", "asap", "immediately"];
const LOW_URGENCY_KEYWORDS = [
  "for your information",
  "fyi",
  "just letting you know",
  "no action needed",
  "informational",
];

export function analyzeEmail(email: string): EmailAnalysis {
  const normalizedEmail = email.toLowerCase();
  const orderNumberMatch = email.match(ORDER_NUMBER_REGEX);
  const orderNumber = orderNumberMatch?.[0]?.toUpperCase();

  const intent = getIntent(normalizedEmail);
  const urgency = getUrgency(normalizedEmail);
  const confidence = getConfidence(intent, orderNumber);
  const risks = getRisks(normalizedEmail);
  const summary = getSummary(intent, urgency, orderNumber);
  const nextAction = generateRecommendedAction({
    intent,
    urgency,
    risks,
    orderNumber,
  });

  return {
    summary,
    intent,
    urgency,
    confidence,
    orderNumber,
    risks,
    nextAction,
  };
}

function getIntent(normalizedEmail: string): IntentCode {
  const asksForPod =
    normalizedEmail.includes("proof of delivery") ||
    normalizedEmail.includes("pod") ||
    normalizedEmail.includes("delivery receipt");
  const asksToCancel =
    normalizedEmail.includes("cancel order") ||
    normalizedEmail.includes("cancel my order") ||
    normalizedEmail.includes("cancellation");
  const reportsShortShipment =
    normalizedEmail.includes("short shipment") ||
    normalizedEmail.includes("missing item") ||
    normalizedEmail.includes("missing items") ||
    normalizedEmail.includes("only received");
  const reportsDamage =
    normalizedEmail.includes("damaged") ||
    normalizedEmail.includes("broken") ||
    normalizedEmail.includes("arrived crushed");
  const asksForAddressChange =
    normalizedEmail.includes("change the address") ||
    normalizedEmail.includes("update the address") ||
    normalizedEmail.includes("wrong address") ||
    normalizedEmail.includes("shipping address");
  const reportsDuplicateShipment =
    normalizedEmail.includes("duplicate shipment") ||
    normalizedEmail.includes("duplicate order") ||
    normalizedEmail.includes("received two") ||
    normalizedEmail.includes("sent twice");
  const asksBillingQuestion =
    normalizedEmail.includes("invoice") ||
    normalizedEmail.includes("billing") ||
    normalizedEmail.includes("charged") ||
    normalizedEmail.includes("charge") ||
    normalizedEmail.includes("bill");
  const asksForStatus =
    normalizedEmail.includes("status") ||
    normalizedEmail.includes("update") ||
    normalizedEmail.includes("where is my order") ||
    normalizedEmail.includes("track") ||
    normalizedEmail.includes("shipment");

  if (asksForPod) {
    return "pod_request";
  }

  if (asksToCancel) {
    return "cancellation_request";
  }

  if (reportsShortShipment) {
    return "short_shipment";
  }

  if (reportsDamage) {
    return "damaged_shipment";
  }

  if (asksForAddressChange) {
    return "address_change";
  }

  if (asksBillingQuestion) {
    return "billing_question";
  }

  if (asksForStatus || reportsDuplicateShipment) {
    return "where_is_my_order";
  }

  return "general_support";
}

function getUrgency(normalizedEmail: string): EmailAnalysis["urgency"] {
  if (HIGH_URGENCY_KEYWORDS.some((keyword) => normalizedEmail.includes(keyword))) {
    return "high";
  }

  if (LOW_URGENCY_KEYWORDS.some((keyword) => normalizedEmail.includes(keyword))) {
    return "low";
  }

  return "medium";
}

function getConfidence(
  intent: IntentCode,
  orderNumber?: string,
): EmailAnalysis["confidence"] {
  if (orderNumber && intent !== "general_support") {
    return "high";
  }

  if (intent !== "general_support") {
    return "medium";
  }

  return "low";
}

function getRisks(normalizedEmail: string): RiskCode[] {
  const risks: RiskCode[] = [];

  if (normalizedEmail.includes("waiting for several days") || normalizedEmail.includes("no update")) {
    risks.push("delay_or_no_tracking_update");
  }

  if (normalizedEmail.includes("frustrated")) {
    risks.push("customer_frustration");
  }

  if (
    normalizedEmail.includes("still have not received") ||
    normalizedEmail.includes("did not receive") ||
    normalizedEmail.includes("not received")
  ) {
    risks.push("delivered_not_received");
  }

  if (
    normalizedEmail.includes("proof of delivery") ||
    normalizedEmail.includes("pod") ||
    normalizedEmail.includes("delivery receipt")
  ) {
    risks.push("pod_needed");
  }

  if (normalizedEmail.includes("cancel order") || normalizedEmail.includes("cancel my order")) {
    risks.push("cancellation_review_needed");
  }

  if (
    normalizedEmail.includes("short shipment") ||
    normalizedEmail.includes("missing item") ||
    normalizedEmail.includes("missing items") ||
    normalizedEmail.includes("only received")
  ) {
    risks.push("missing_items_reported");
  }

  if (
    normalizedEmail.includes("damaged") ||
    normalizedEmail.includes("broken") ||
    normalizedEmail.includes("arrived crushed")
  ) {
    risks.push("damage_reported");
  }

  if (
    normalizedEmail.includes("change the address") ||
    normalizedEmail.includes("update the address") ||
    normalizedEmail.includes("wrong address")
  ) {
    risks.push("address_correction_needed");
  }

  if (
    normalizedEmail.includes("duplicate shipment") ||
    normalizedEmail.includes("duplicate order") ||
    normalizedEmail.includes("received two") ||
    normalizedEmail.includes("sent twice")
  ) {
    risks.push("duplicate_shipment_possible");
  }

  if (
    normalizedEmail.includes("invoice") ||
    normalizedEmail.includes("billing") ||
    normalizedEmail.includes("charged") ||
    normalizedEmail.includes("charge")
  ) {
    risks.push("billing_discrepancy");
  }

  return Array.from(new Set(risks));
}

function getSummary(
  intent: IntentCode,
  urgency: EmailAnalysis["urgency"],
  orderNumber?: string,
): string {
  if (intent === "pod_request") {
    return orderNumber
      ? `Customer is requesting proof of delivery for order ${orderNumber}.`
      : "Customer is requesting proof of delivery but did not provide an order number.";
  }

  if (intent === "cancellation_request") {
    return orderNumber
      ? `Customer wants to cancel order ${orderNumber}.`
      : "Customer wants to cancel an order but did not include the order number.";
  }

  if (intent === "short_shipment") {
    return orderNumber
      ? `Customer reports missing items from order ${orderNumber}.`
      : "Customer reports a short shipment or missing items.";
  }

  if (intent === "damaged_shipment") {
    return orderNumber
      ? `Customer reports damage on order ${orderNumber}.`
      : "Customer reports a damaged shipment.";
  }

  if (intent === "address_change") {
    return orderNumber
      ? `Customer is requesting an address change for order ${orderNumber}.`
      : "Customer wants to update the shipping address.";
  }

  if (intent === "billing_question") {
    return orderNumber
      ? `Customer has a billing or invoice question for order ${orderNumber}.`
      : "Customer has a billing or invoice question.";
  }

  if (intent === "where_is_my_order") {
    return orderNumber
      ? `Customer is requesting a status update for order ${orderNumber}.`
      : "Customer is asking for an order update but did not provide an order number.";
  }

  if (urgency === "low") {
    return "Customer shared a low-urgency informational support message.";
  }

  return "Customer sent a general support request.";
}
