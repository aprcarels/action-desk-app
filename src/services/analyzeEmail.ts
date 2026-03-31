import type { EmailAnalysis } from "../types/actionDesk";

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

  const intent = getIntent(normalizedEmail, orderNumber);
  const urgency = getUrgency(normalizedEmail);
  const confidence = getConfidence(intent, orderNumber);
  const risks = getRisks(normalizedEmail);
  const summary = getSummary(intent, urgency, orderNumber);
  const nextAction = getNextAction(normalizedEmail, intent, orderNumber);

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

function getIntent(normalizedEmail: string, orderNumber?: string): string {
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
    return "proof of delivery request";
  }

  if (asksToCancel) {
    return "cancellation request";
  }

  if (reportsShortShipment) {
    return "short shipment";
  }

  if (reportsDamage) {
    return "damaged shipment";
  }

  if (asksForAddressChange) {
    return "address change request";
  }

  if (reportsDuplicateShipment) {
    return "duplicate shipment concern";
  }

  if (asksBillingQuestion) {
    return "billing question";
  }

  if (asksForStatus && orderNumber) {
    return "order status request";
  }

  if (asksForStatus && !orderNumber) {
    return "missing order number";
  }

  return "general support request";
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
  intent: string,
  orderNumber?: string,
): EmailAnalysis["confidence"] {
  if (orderNumber && intent !== "general support request" && intent !== "missing order number") {
    return "high";
  }

  if (intent !== "general support request") {
    return "medium";
  }

  return "low";
}

function getRisks(normalizedEmail: string): string[] {
  const risks: string[] = [];

  if (normalizedEmail.includes("waiting for several days") || normalizedEmail.includes("no update")) {
    risks.push("Customer reports a delay or no recent shipment updates.");
  }

  if (normalizedEmail.includes("frustrated")) {
    risks.push("Customer is frustrated and may need a fast, clear response.");
  }

  if (
    normalizedEmail.includes("still have not received") ||
    normalizedEmail.includes("did not receive") ||
    normalizedEmail.includes("not received")
  ) {
    risks.push("Shipment may be missing after marked delivery.");
  }

  if (
    normalizedEmail.includes("proof of delivery") ||
    normalizedEmail.includes("pod") ||
    normalizedEmail.includes("delivery receipt")
  ) {
    risks.push("Customer needs delivery documentation for confirmation or claim handling.");
  }

  if (normalizedEmail.includes("cancel order") || normalizedEmail.includes("cancel my order")) {
    risks.push("Order may need cancellation review before additional processing or shipment.");
  }

  if (
    normalizedEmail.includes("short shipment") ||
    normalizedEmail.includes("missing item") ||
    normalizedEmail.includes("missing items") ||
    normalizedEmail.includes("only received")
  ) {
    risks.push("Customer reports a short shipment or missing items.");
  }

  if (
    normalizedEmail.includes("damaged") ||
    normalizedEmail.includes("broken") ||
    normalizedEmail.includes("arrived crushed")
  ) {
    risks.push("Shipment may require damage review, replacement, or claim handling.");
  }

  if (
    normalizedEmail.includes("change the address") ||
    normalizedEmail.includes("update the address") ||
    normalizedEmail.includes("wrong address")
  ) {
    risks.push("Shipping address may need to be corrected before delivery progresses.");
  }

  if (
    normalizedEmail.includes("duplicate shipment") ||
    normalizedEmail.includes("duplicate order") ||
    normalizedEmail.includes("received two") ||
    normalizedEmail.includes("sent twice")
  ) {
    risks.push("Customer may have received or expects a duplicate shipment.");
  }

  if (
    normalizedEmail.includes("invoice") ||
    normalizedEmail.includes("billing") ||
    normalizedEmail.includes("charged") ||
    normalizedEmail.includes("charge")
  ) {
    risks.push("Customer has a billing or invoice discrepancy that needs review.");
  }

  return risks;
}

function getSummary(
  intent: string,
  urgency: EmailAnalysis["urgency"],
  orderNumber?: string,
): string {
  if (intent === "proof of delivery request") {
    return orderNumber
      ? `Customer is requesting proof of delivery for order ${orderNumber}.`
      : "Customer is requesting proof of delivery but did not provide an order number.";
  }

  if (intent === "cancellation request") {
    return orderNumber
      ? `Customer wants to cancel order ${orderNumber}.`
      : "Customer wants to cancel an order but did not include the order number.";
  }

  if (intent === "short shipment") {
    return orderNumber
      ? `Customer reports missing items from order ${orderNumber}.`
      : "Customer reports a short shipment or missing items.";
  }

  if (intent === "damaged shipment") {
    return orderNumber
      ? `Customer reports damage on order ${orderNumber}.`
      : "Customer reports a damaged shipment.";
  }

  if (intent === "address change request") {
    return orderNumber
      ? `Customer is requesting an address change for order ${orderNumber}.`
      : "Customer wants to update the shipping address.";
  }

  if (intent === "duplicate shipment concern") {
    return orderNumber
      ? `Customer is concerned about a duplicate shipment for order ${orderNumber}.`
      : "Customer is concerned about a duplicate shipment.";
  }

  if (intent === "billing question") {
    return orderNumber
      ? `Customer has a billing or invoice question for order ${orderNumber}.`
      : "Customer has a billing or invoice question.";
  }

  if (intent === "order status request" && orderNumber) {
    return `Customer is requesting a status update for order ${orderNumber}.`;
  }

  if (intent === "missing order number") {
    return "Customer is asking for an order update but did not provide an order number.";
  }

  if (urgency === "low") {
    return "Customer shared a low-urgency informational support message.";
  }

  return "Customer sent a general support request.";
}

function getNextAction(
  normalizedEmail: string,
  intent: string,
  orderNumber?: string,
): string {
  const suggestsDeliveredNotReceived =
    normalizedEmail.includes("delivered") &&
    (normalizedEmail.includes("not received") ||
      normalizedEmail.includes("did not receive") ||
      normalizedEmail.includes("still have not received"));

  const suggestsDelayOrException =
    normalizedEmail.includes("delayed") ||
    normalizedEmail.includes("exception") ||
    normalizedEmail.includes("no update");

  if (intent === "proof of delivery request") {
    return orderNumber
      ? "Open the order in Extensiv, retrieve the proof of delivery details, confirm the delivery record, and send the documentation or delivery confirmation back to the customer."
      : "Reply requesting the order number so the delivery record and proof of delivery can be retrieved.";
  }

  if (intent === "cancellation request") {
    return orderNumber
      ? "Open the order in Extensiv, confirm whether it has already shipped, review cancellation eligibility, and reply with the next cancellation step."
      : "Reply requesting the order number so cancellation eligibility can be reviewed immediately.";
  }

  if (intent === "short shipment") {
    return orderNumber
      ? "Open the order in Extensiv, compare the ordered items against the shipment contents, confirm what is missing, and respond with the replacement or resolution plan."
      : "Reply requesting the order number so the shipment contents can be reviewed against the order.";
  }

  if (intent === "damaged shipment") {
    return orderNumber
      ? "Open the order in Extensiv, review the shipment details, document the reported damage, and confirm the replacement or claim process before replying."
      : "Reply requesting the order number so the damaged shipment can be reviewed and next steps confirmed.";
  }

  if (intent === "address change request") {
    return orderNumber
      ? "Open the order in Extensiv, verify whether the shipment is still eligible for address changes, update the delivery details if possible, and reply with the outcome."
      : "Reply requesting the order number so the shipping address change can be reviewed.";
  }

  if (intent === "duplicate shipment concern") {
    return orderNumber
      ? "Open the order in Extensiv, verify shipment history and tracking records, confirm whether a duplicate shipment was created, and respond with the resolution."
      : "Reply requesting the order number so shipment history can be checked for duplicate fulfillment.";
  }

  if (intent === "billing question") {
    return orderNumber
      ? "Open the order in Extensiv, review the invoice or charge details tied to the order, confirm the billing status, and respond with the explanation or correction path."
      : "Reply requesting the order number or invoice reference so the billing question can be reviewed.";
  }

  if (!orderNumber) {
    return "Reply to the customer requesting the order number so the shipment can be located and reviewed.";
  }

  if (suggestsDeliveredNotReceived) {
    return "Open the order in Extensiv, review proof of delivery and delivery location details, check carrier notes, then investigate possible misdelivery before replying.";
  }

  if (suggestsDelayOrException) {
    return "Open the order in Extensiv, review the shipment exception details, check carrier updates, and confirm the next movement or delay reason before responding.";
  }

  if (intent === "order status request" && orderNumber) {
    return "Open the order in Extensiv, verify the latest shipment scan, confirm current carrier status, then reply with the update.";
  }

  return "Open the order or request in Extensiv, confirm the latest available details, and respond with the next update.";
}
