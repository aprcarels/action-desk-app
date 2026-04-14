import type { EmailAnalysis } from "../types/actionDesk";
import type { IntentCode, RiskCode } from "../types/actionDesk";
import { parseAnalysisInput } from "./analysisInput";
import {
  extractCaseIdentifiers,
  getIdentifierReferenceLabel,
  getPrimaryOrderNumber,
} from "./caseIdentifiers";
import {
  extractLatestMessageText,
  getLatestUrgencySignal,
  hasConfirmationRequest,
  hasClearRequest,
  hasLogisticsCoordinationSignals,
  hasOperationalTimingSignal,
  hasShippingDeadlineRequest,
  isInternalOperationsThread,
} from "./emailWorkHeuristics";
import { generateRecommendedAction } from "./generateRecommendedAction";
import { refineEmailAnalysis } from "./refineEmailAnalysis";
const LOW_URGENCY_KEYWORDS = [
  "for your information",
  "fyi",
  "just letting you know",
  "no action needed",
  "informational",
];

export function analyzeEmail(email: string): EmailAnalysis {
  const parsedInput = parseAnalysisInput(email);
  const emailText = parsedInput.body || email;
  const fullText = parsedInput.fullText || emailText;
  const normalizedEmail = fullText.toLowerCase();
  const latestMessageText = extractLatestMessageText(emailText);
  const normalizedLatestMessage = (latestMessageText || fullText).toLowerCase();
  const caseIdentifiers = extractCaseIdentifiers({
    subject: parsedInput.subject,
    latestMessageText,
    bodyText: emailText,
  });
  const orderNumber = getPrimaryOrderNumber(caseIdentifiers);
  const hasDeadlineRequest = hasShippingDeadlineRequest(normalizedLatestMessage);
  const confirmationRequest = hasConfirmationRequest(normalizedLatestMessage);
  const logisticsContext = hasLogisticsCoordinationSignals(normalizedLatestMessage);
  const operationalTimingSignal =
    hasDeadlineRequest || hasOperationalTimingSignal(normalizedLatestMessage);

  const intent = getIntent(normalizedLatestMessage, normalizedEmail);
  const urgency = getUrgency(normalizedLatestMessage, normalizedEmail);
  const confidence = getConfidence(intent, orderNumber);
  const risks = getRisks(normalizedLatestMessage);
  const summary = getSummary(intent, urgency, normalizedLatestMessage, {
    orderNumber,
    caseIdentifiers,
  });
  const nextAction = generateRecommendedAction({
    intent,
    urgency,
    risks,
    orderNumber,
    caseIdentifiers,
    hasDeadlineRequest,
  });

  const analysis: EmailAnalysis = {
    summary,
    intent,
    urgency,
    confidence,
    orderNumber,
    caseIdentifiers,
    hasDeadlineRequest,
    deadlineState: hasDeadlineRequest ? "current" : "none",
    risks,
    nextAction,
    hasConfirmationRequest: confirmationRequest,
    hasLogisticsContext: logisticsContext,
    hasOperationalTimingSignal: operationalTimingSignal,
  };

  return refineEmailAnalysis(email, analysis);
}

function getIntent(normalizedLatestMessage: string, normalizedEmail: string): IntentCode {
  const isInternalOperations = isInternalOperationsThread(normalizedLatestMessage);
  const asksForPod =
    normalizedLatestMessage.includes("proof of delivery") ||
    normalizedLatestMessage.includes("pod") ||
    normalizedLatestMessage.includes("delivery receipt");
  const asksToCancel =
    normalizedLatestMessage.includes("cancel order") ||
    normalizedLatestMessage.includes("cancel my order") ||
    normalizedLatestMessage.includes("cancellation") ||
    normalizedLatestMessage.includes("please cancel") ||
    normalizedLatestMessage.includes("cancel all") ||
    normalizedLatestMessage.includes("cancel those") ||
    normalizedLatestMessage.includes("once canceled") ||
    normalizedLatestMessage.includes("confirm once canceled");
  const reportsShortShipment =
    normalizedLatestMessage.includes("short shipment") ||
    normalizedLatestMessage.includes("missing item") ||
    normalizedLatestMessage.includes("missing items") ||
    normalizedLatestMessage.includes("only received");
  const reportsDamage =
    normalizedLatestMessage.includes("damaged") ||
    normalizedLatestMessage.includes("broken") ||
    normalizedLatestMessage.includes("arrived crushed");
  const asksForAddressChange =
    normalizedLatestMessage.includes("change the address") ||
    normalizedLatestMessage.includes("update the address") ||
    normalizedLatestMessage.includes("wrong address") ||
    normalizedLatestMessage.includes("shipping address") ||
    normalizedLatestMessage.includes("change details") ||
    normalizedLatestMessage.includes("modify order") ||
    normalizedLatestMessage.includes("correct shipping details");
  const reportsDuplicateShipment =
    normalizedLatestMessage.includes("duplicate shipment") ||
    normalizedLatestMessage.includes("duplicate order") ||
    normalizedLatestMessage.includes("received two") ||
    normalizedLatestMessage.includes("sent twice");
  const asksBillingQuestion =
    normalizedLatestMessage.includes("invoice") ||
    normalizedLatestMessage.includes("billing") ||
    normalizedLatestMessage.includes("charged") ||
    normalizedLatestMessage.includes("charge") ||
    normalizedLatestMessage.includes("bill");
  const asksForStatus =
    normalizedLatestMessage.includes("status") ||
    normalizedLatestMessage.includes("where is my order") ||
    normalizedLatestMessage.includes("track") ||
    normalizedLatestMessage.includes("shipment") ||
    normalizedLatestMessage.includes("shipping") ||
    normalizedLatestMessage.includes("ship today") ||
    hasShippingDeadlineRequest(normalizedLatestMessage);
  const asksForGeneralUpdate =
    normalizedLatestMessage.includes("please update") ||
    normalizedLatestMessage.includes("send me") ||
    normalizedLatestMessage.includes("let me know once");
  const hasExplicitConfirmationRequest = hasConfirmationRequest(normalizedLatestMessage);
  const hasLogisticsContext = hasLogisticsCoordinationSignals(normalizedLatestMessage);

  if (isInternalOperations) {
    return "general_support";
  }

  if (hasExplicitConfirmationRequest && hasLogisticsContext) {
    return "operational_confirmation";
  }

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

  if ((asksForStatus || reportsDuplicateShipment) && !asksForGeneralUpdate) {
    return "where_is_my_order";
  }

  if (
    asksForGeneralUpdate &&
    (normalizedEmail.includes("order") || normalizedEmail.includes("shipment") || normalizedEmail.includes("tracking"))
  ) {
    return "where_is_my_order";
  }

  return "general_support";
}

function getUrgency(
  normalizedLatestMessage: string,
  normalizedEmail: string,
): EmailAnalysis["urgency"] {
  const latestUrgencySignal = getLatestUrgencySignal(normalizedLatestMessage);
  const hasDeadlineRequest = hasShippingDeadlineRequest(normalizedLatestMessage);
  const confirmationRequest = hasConfirmationRequest(normalizedLatestMessage);
  const logisticsContext = hasLogisticsCoordinationSignals(normalizedLatestMessage);
  const operationalTimingSignal = hasOperationalTimingSignal(normalizedLatestMessage);

  if (isInternalOperationsThread(normalizedLatestMessage)) {
    return "low";
  }

  if (
    LOW_URGENCY_KEYWORDS.some((keyword) => normalizedLatestMessage.includes(keyword)) &&
    !hasClearRequest(normalizedLatestMessage)
  ) {
    return "low";
  }

  if (latestUrgencySignal === "high" && (hasClearRequest(normalizedLatestMessage) || hasDeadlineRequest)) {
    return "high";
  }

  if (latestUrgencySignal === "medium" && (hasClearRequest(normalizedLatestMessage) || hasDeadlineRequest)) {
    return "medium";
  }

  if (hasDeadlineRequest) {
    return normalizedLatestMessage.includes("today") ||
      normalizedLatestMessage.includes("tomorrow") ||
      normalizedLatestMessage.includes("overnight") ||
      normalizedLatestMessage.includes("same day")
      ? "high"
      : "medium";
  }

  if (confirmationRequest && logisticsContext) {
    return latestUrgencySignal === "high" || operationalTimingSignal ? "high" : "medium";
  }

  if (hasClearRequest(normalizedLatestMessage)) {
    return latestUrgencySignal === "high" || normalizedEmail.includes("urgent") || normalizedEmail.includes("asap")
      ? "high"
      : "medium";
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

function getRisks(normalizedLatestMessage: string): RiskCode[] {
  if (isInternalOperationsThread(normalizedLatestMessage)) {
    return [];
  }

  const risks: RiskCode[] = [];

  if (normalizedLatestMessage.includes("waiting for several days") || normalizedLatestMessage.includes("no update")) {
    risks.push("delay_or_no_tracking_update");
  }

  if (normalizedLatestMessage.includes("frustrated")) {
    risks.push("customer_frustration");
  }

  if (
    normalizedLatestMessage.includes("still have not received") ||
    normalizedLatestMessage.includes("did not receive") ||
    normalizedLatestMessage.includes("not received")
  ) {
    risks.push("delivered_not_received");
  }

  if (
    normalizedLatestMessage.includes("proof of delivery") ||
    normalizedLatestMessage.includes("pod") ||
    normalizedLatestMessage.includes("delivery receipt")
  ) {
    risks.push("pod_needed");
  }

  if (
    normalizedLatestMessage.includes("cancel order") ||
    normalizedLatestMessage.includes("cancel my order") ||
    normalizedLatestMessage.includes("please cancel") ||
    normalizedLatestMessage.includes("cancel all") ||
    normalizedLatestMessage.includes("once canceled")
  ) {
    risks.push("cancellation_review_needed");
  }

  if (
    normalizedLatestMessage.includes("short shipment") ||
    normalizedLatestMessage.includes("missing item") ||
    normalizedLatestMessage.includes("missing items") ||
    normalizedLatestMessage.includes("only received")
  ) {
    risks.push("missing_items_reported");
  }

  if (
    normalizedLatestMessage.includes("damaged") ||
    normalizedLatestMessage.includes("broken") ||
    normalizedLatestMessage.includes("arrived crushed")
  ) {
    risks.push("damage_reported");
  }

  if (
    normalizedLatestMessage.includes("change the address") ||
    normalizedLatestMessage.includes("update the address") ||
    normalizedLatestMessage.includes("wrong address")
  ) {
    risks.push("address_correction_needed");
  }

  if (
    normalizedLatestMessage.includes("duplicate shipment") ||
    normalizedLatestMessage.includes("duplicate order") ||
    normalizedLatestMessage.includes("received two") ||
    normalizedLatestMessage.includes("sent twice")
  ) {
    risks.push("duplicate_shipment_possible");
  }

  if (
    normalizedLatestMessage.includes("invoice") ||
    normalizedLatestMessage.includes("billing") ||
    normalizedLatestMessage.includes("charged") ||
    normalizedLatestMessage.includes("charge")
  ) {
    risks.push("billing_discrepancy");
  }

  return Array.from(new Set(risks));
}

function getSummary(
  intent: IntentCode,
  urgency: EmailAnalysis["urgency"],
  normalizedLatestMessage: string,
  analysis: Pick<EmailAnalysis, "orderNumber" | "caseIdentifiers">,
): string {
  const referenceLabel = getIdentifierReferenceLabel(analysis);
  const hasDeadlineRequest = hasShippingDeadlineRequest(normalizedLatestMessage);

  if (intent === "pod_request") {
    return referenceLabel
      ? `Customer is requesting proof of delivery for ${referenceLabel}.`
      : "Customer is requesting proof of delivery but did not include a usable identifier.";
  }

  if (intent === "cancellation_request") {
    return referenceLabel
      ? `Customer wants to cancel ${referenceLabel}.`
      : "Customer wants to cancel an order and is asking for confirmation.";
  }

  if (intent === "short_shipment") {
    return referenceLabel
      ? `Customer reports missing items tied to ${referenceLabel}.`
      : "Customer reports a short shipment or missing items.";
  }

  if (intent === "damaged_shipment") {
    return referenceLabel
      ? `Customer reports damage tied to ${referenceLabel}.`
      : "Customer reports a damaged shipment.";
  }

  if (intent === "address_change") {
    return referenceLabel
      ? `Customer is requesting an address change for ${referenceLabel}.`
      : "Customer wants to update the shipping address.";
  }

  if (intent === "billing_question") {
    return referenceLabel
      ? `Customer has a billing or invoice question tied to ${referenceLabel}.`
      : "Customer has a billing or invoice question.";
  }

  if (intent === "operational_confirmation") {
    return referenceLabel
      ? `Customer provided inbound or logistics details for ${referenceLabel} and requested confirmation of receipt or follow-up once the event occurs.`
      : "Customer provided inbound or logistics details and requested confirmation of receipt or follow-up once the event occurs.";
  }

  if (intent === "where_is_my_order") {
    if (hasDeadlineRequest) {
      return referenceLabel
        ? `Customer needs shipping or delivery timing confirmation for ${referenceLabel}.`
        : "Customer needs shipping or delivery timing confirmation and expects a current update.";
    }

    return referenceLabel
      ? `Customer is requesting a status update for ${referenceLabel}.`
      : "Customer is asking for an order update but did not provide a usable identifier.";
  }

  if (hasDeadlineRequest) {
    return referenceLabel
      ? `Customer needs ship-timing confirmation for ${referenceLabel}.`
      : "Customer needs ship-timing confirmation and expects a current update.";
  }

  if (urgency === "low") {
    return "Customer shared a low-urgency informational support message.";
  }

  return "Customer sent a general support request.";
}
