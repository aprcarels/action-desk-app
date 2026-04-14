import type {
  Actionability,
  EmailAnalysis,
  MessageType,
  ReplyNeeded,
  RiskCode,
  WorkType,
} from "../types/actionDesk";
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
  includesAny,
  isInternalOperationsThread,
  isLikelyThreadContinuation,
} from "./emailWorkHeuristics";

const ALERT_PATTERNS = [
  "alert",
  "warning",
  "notification",
  "automated",
  "system generated",
  "system alert",
  "monitor",
  "exception",
  "failure",
  "failed",
  "do not reply",
  "noreply",
  "no-reply",
];

const AWARENESS_PATTERNS = [
  "fyi",
  "for awareness",
  "for visibility",
  "copied for visibility",
  "just letting you know",
  "heads up",
  "no action needed",
  "no action required",
  "reply not needed",
  "cc'ing you",
  "ccing you",
  "for review only",
];

const SUSPICIOUS_PATTERNS = [
  "phishing",
  "scam",
  "suspicious",
  "not sure if this is real",
  "is this real",
  "is this legit",
  "do not click",
  "malware",
];

const CALENDAR_ADMIN_PATTERNS = [
  "meeting",
  "calendar",
  "invite",
  "invitation",
  "accepted:",
  "declined:",
  "tentative:",
  "out of office",
  "automatic reply",
];

const VENDOR_PATTERNS = [
  "vendor",
  "supplier",
  "account maintenance",
  "subscription",
  "renewal",
  "portal",
  "w-9",
  "tax form",
  "remittance",
  "banking update",
];

const FRUSTRATION_PATTERNS = [
  "frustrated",
  "upset",
  "disappointed",
  "unacceptable",
  "still waiting",
  "this is ridiculous",
];

function hasRisk(risks: RiskCode[], risk: RiskCode): boolean {
  return risks.includes(risk);
}

function getWorkType(options: {
  normalizedEmail: string;
  likelyAutomatedAlert: boolean;
  awarenessOnly: boolean;
  hasExplicitRequest: boolean;
  isInternalOperations: boolean;
  analysis: EmailAnalysis;
}): WorkType {
  if (includesAny(options.normalizedEmail, SUSPICIOUS_PATTERNS)) {
    return "suspicious";
  }

  if (
    options.likelyAutomatedAlert ||
    includesAny(options.normalizedEmail, CALENDAR_ADMIN_PATTERNS)
  ) {
    return "system";
  }

  if (
    includesAny(options.normalizedEmail, VENDOR_PATTERNS) &&
    !options.hasExplicitRequest
  ) {
    return "vendor";
  }

  if (options.isInternalOperations) {
    return "internal";
  }

  if (options.awarenessOnly) {
    return "internal";
  }

  if (
    options.hasExplicitRequest ||
    options.analysis.intent !== "general_support" ||
    options.analysis.risks.length > 0
  ) {
    return "customer_support";
  }

  return "unknown";
}

function getMessageType(options: {
  normalizedEmail: string;
  hasExplicitRequest: boolean;
  awarenessOnly: boolean;
  informational: boolean;
  likelyAutomatedAlert: boolean;
  refinedIntent: EmailAnalysis["intent"];
  isThreadContinuation: boolean;
  isInternalOperations: boolean;
}): MessageType {
  if (options.likelyAutomatedAlert) {
    return "internal_alert";
  }

  if (options.isInternalOperations) {
    return "internal_alert";
  }

  if (options.awarenessOnly) {
    return "awareness_only";
  }

  if (options.isThreadContinuation && !options.hasExplicitRequest) {
    return "informational";
  }

  if (options.informational && !options.hasExplicitRequest) {
    return "informational";
  }

  if (options.refinedIntent !== "general_support") {
    return "customer_request";
  }

  return "general_support";
}

function getActionability(options: {
  likelyAutomatedAlert: boolean;
  awarenessOnly: boolean;
  noActionNeeded: boolean;
  hasExplicitRequest: boolean;
  isThreadContinuation: boolean;
  analysis: EmailAnalysis;
}): Actionability {
  if (options.noActionNeeded) {
    return "no_action_needed";
  }

  if (options.isThreadContinuation && !options.hasExplicitRequest) {
    return "review_needed";
  }

  if (options.awarenessOnly) {
    return "awareness_only";
  }

  if (
    options.hasExplicitRequest ||
    options.analysis.intent !== "general_support" ||
    hasRisk(options.analysis.risks, "customer_frustration") ||
    hasRisk(options.analysis.risks, "damage_reported") ||
    hasRisk(options.analysis.risks, "missing_items_reported") ||
    hasRisk(options.analysis.risks, "cancellation_review_needed") ||
    hasRisk(options.analysis.risks, "billing_discrepancy")
  ) {
    return "action_required";
  }

  if (options.likelyAutomatedAlert) {
    return "review_needed";
  }

  return "review_needed";
}

function getReplyNeeded(actionability: Actionability): ReplyNeeded {
  if (actionability === "action_required") {
    return "yes";
  }

  if (actionability === "review_needed") {
    return "maybe";
  }

  return "no";
}

function getRefinedUrgency(options: {
  normalizedEmail: string;
  analysis: EmailAnalysis;
  actionability: Actionability;
  messageType: MessageType;
  latestMessageText: string;
  isThreadContinuation: boolean;
  hasConfirmationRequest: boolean;
  hasLogisticsContext: boolean;
  hasOperationalTimingSignal: boolean;
}): EmailAnalysis["urgency"] {
  const latestUrgencySignal = getLatestUrgencySignal(options.latestMessageText);
  const hasDeadlineRequest =
    options.analysis.hasDeadlineRequest || hasShippingDeadlineRequest(options.latestMessageText);
  const hasExplicitHighUrgency =
    options.analysis.urgency === "high" || latestUrgencySignal === "high";
  const hasMaterialCustomerRisk =
    hasRisk(options.analysis.risks, "customer_frustration") ||
    hasRisk(options.analysis.risks, "damage_reported") ||
    hasRisk(options.analysis.risks, "missing_items_reported") ||
    hasRisk(options.analysis.risks, "delivered_not_received") ||
    hasRisk(options.analysis.risks, "cancellation_review_needed") ||
    hasRisk(options.analysis.risks, "billing_discrepancy");
  const isActionableCustomerRequest =
    options.analysis.workType === "customer_support" &&
    options.actionability === "action_required";

  if (
    options.actionability === "no_action_needed" ||
    options.actionability === "awareness_only"
  ) {
    return "low";
  }

  if (options.isThreadContinuation && options.actionability !== "action_required") {
    return "low";
  }

  if (options.analysis.workType && options.analysis.workType !== "customer_support") {
    return "low";
  }

  if (options.messageType === "internal_alert" && !hasMaterialCustomerRisk) {
    return "low";
  }

  if (
    !options.analysis.hasClearRequest &&
    options.hasLogisticsContext &&
    !options.hasConfirmationRequest
  ) {
    return options.hasOperationalTimingSignal ? "medium" : "low";
  }

  if (isActionableCustomerRequest && (hasExplicitHighUrgency || hasDeadlineRequest)) {
    return "high";
  }

  if (
    isActionableCustomerRequest &&
    options.hasConfirmationRequest &&
    options.hasLogisticsContext
  ) {
    return options.hasOperationalTimingSignal || latestUrgencySignal === "high"
      ? "high"
      : "medium";
  }

  if (hasExplicitHighUrgency && hasMaterialCustomerRisk) {
    return "high";
  }

  if (isActionableCustomerRequest && (latestUrgencySignal === "medium" || options.analysis.intent !== "general_support")) {
    return options.analysis.urgency === "low" ? "medium" : options.analysis.urgency;
  }

  if (hasMaterialCustomerRisk) {
    return options.analysis.urgency === "low" ? "medium" : options.analysis.urgency;
  }

  if (latestUrgencySignal === "medium") {
    return "medium";
  }

  return options.analysis.urgency;
}

function getRefinedConfidence(options: {
  analysis: EmailAnalysis;
  messageType: MessageType;
  actionability: Actionability;
}): EmailAnalysis["confidence"] {
  if (
    options.messageType === "internal_alert" ||
    options.actionability === "awareness_only" ||
    options.actionability === "no_action_needed"
  ) {
    return options.analysis.confidence === "high" ? "medium" : options.analysis.confidence;
  }

  return options.analysis.confidence;
}

function getRefinedSummary(options: {
  analysis: EmailAnalysis;
  messageType: MessageType;
  actionability: Actionability;
  isThreadContinuation: boolean;
}): string {
  if (options.actionability === "no_action_needed") {
    return "Informational message indicates no immediate action is needed.";
  }

  if (options.isThreadContinuation && !options.analysis.hasClearRequest) {
    return "Short thread continuation with limited standalone context. Review only if follow-up is still needed.";
  }

  if (options.actionability === "awareness_only") {
    return "Informational message appears to be for awareness only, with no clear action requested.";
  }

  if (options.messageType === "internal_alert") {
    return "Internal alert or automated notification. Review for awareness and only act if follow-up is needed.";
  }

  if (
    options.analysis.intent === "general_support" &&
    options.analysis.summary.toLowerCase().includes("customer is asking for an order update")
  ) {
    return "General support message needs review before taking action.";
  }

  return options.analysis.summary;
}

function applyIdentifierContext(email: string, analysis: EmailAnalysis): EmailAnalysis {
  const parsedInput = parseAnalysisInput(email);
  const emailText = parsedInput.body || email;
  const latestMessageText = extractLatestMessageText(emailText);
  const caseIdentifiers = extractCaseIdentifiers({
    subject: parsedInput.subject,
    latestMessageText,
    bodyText: emailText,
  });
  const orderNumber = analysis.orderNumber ?? getPrimaryOrderNumber(caseIdentifiers);
  const referenceLabel = getIdentifierReferenceLabel({
    orderNumber,
    caseIdentifiers,
  });
  const hasDeadlineRequest =
    analysis.hasDeadlineRequest || hasShippingDeadlineRequest(latestMessageText);
  const summaryMentionsMissingOrder =
    analysis.summary.toLowerCase().includes("did not provide an order number") ||
    analysis.summary.toLowerCase().includes("did not provide a usable identifier");

  if (!referenceLabel) {
    return {
      ...analysis,
      caseIdentifiers,
      hasDeadlineRequest,
      orderNumber,
    };
  }

  const summary =
    summaryMentionsMissingOrder && analysis.intent === "where_is_my_order"
      ? `Customer is requesting a status update for ${referenceLabel}.`
      : summaryMentionsMissingOrder && analysis.intent === "pod_request"
        ? `Customer is requesting proof of delivery for ${referenceLabel}.`
        : analysis.summary;

  return {
    ...analysis,
    summary,
    orderNumber,
    caseIdentifiers,
    hasDeadlineRequest,
    confidence:
      orderNumber && analysis.intent !== "general_support"
        ? "high"
        : analysis.confidence,
  };
}

export function refineEmailAnalysis(email: string, analysis: EmailAnalysis): EmailAnalysis {
  const analysisWithIdentifiers = applyIdentifierContext(email, analysis);
  const parsedInput = parseAnalysisInput(email);
  const emailText = parsedInput.body || email;
  const fullText = parsedInput.fullText || emailText;
  const normalizedEmail = fullText.toLowerCase();
  const latestMessageText = extractLatestMessageText(emailText);
  const normalizedLatestMessage = (latestMessageText || fullText).toLowerCase();
  const likelyAutomatedAlert = includesAny(normalizedEmail, ALERT_PATTERNS);
  const noActionNeeded =
    normalizedLatestMessage.includes("no action needed") ||
    normalizedLatestMessage.includes("no action required") ||
    normalizedLatestMessage.includes("do not reply");
  const hasExplicitRequest = hasClearRequest(normalizedLatestMessage);
  const awarenessOnly =
    includesAny(normalizedLatestMessage, AWARENESS_PATTERNS) && !hasExplicitRequest;
  const informational = awarenessOnly || normalizedLatestMessage.includes("for your information");
  const isThreadContinuation = isLikelyThreadContinuation(latestMessageText, emailText);
  const isInternalOperations = isInternalOperationsThread(normalizedLatestMessage);
  const confirmationRequest = hasConfirmationRequest(normalizedLatestMessage);
  const logisticsContext = hasLogisticsCoordinationSignals(normalizedLatestMessage);
  const operationalTimingSignal =
    hasShippingDeadlineRequest(normalizedLatestMessage) ||
    hasOperationalTimingSignal(normalizedLatestMessage);
  const alertLikeStatusRequest =
    (likelyAutomatedAlert || isInternalOperations || isThreadContinuation) &&
    (analysisWithIdentifiers.intent === "where_is_my_order" || analysisWithIdentifiers.intent === "general_support");
  const refinedIntent = alertLikeStatusRequest ? "general_support" : analysisWithIdentifiers.intent;
  const workType = getWorkType({
    normalizedEmail,
    likelyAutomatedAlert,
    awarenessOnly,
    hasExplicitRequest,
    isInternalOperations,
    analysis: {
      ...analysisWithIdentifiers,
      intent: refinedIntent,
    },
  });

  const messageType = getMessageType({
    normalizedEmail,
    hasExplicitRequest,
    awarenessOnly,
    informational,
    likelyAutomatedAlert,
    refinedIntent,
    isThreadContinuation,
    isInternalOperations,
  });
  const actionability = getActionability({
    likelyAutomatedAlert,
    awarenessOnly,
    noActionNeeded:
      noActionNeeded ||
      (workType !== "customer_support" && workType !== "unknown"),
    hasExplicitRequest,
    isThreadContinuation,
    analysis: {
      ...analysisWithIdentifiers,
      intent: refinedIntent,
    },
  });
  const replyNeeded = getReplyNeeded(actionability);
  const urgency = getRefinedUrgency({
    normalizedEmail,
    analysis: {
      ...analysisWithIdentifiers,
      intent: refinedIntent,
      hasClearRequest: hasExplicitRequest,
      isThreadContinuation,
    },
    actionability,
    messageType,
    latestMessageText: normalizedLatestMessage,
    isThreadContinuation,
    hasConfirmationRequest: confirmationRequest,
    hasLogisticsContext: logisticsContext,
    hasOperationalTimingSignal: operationalTimingSignal,
  });

  const refinedRisks = Array.from(new Set([
    ...analysisWithIdentifiers.risks,
    ...(includesAny(normalizedEmail, FRUSTRATION_PATTERNS) ? ["customer_frustration" as const] : []),
  ]));

  return {
    ...analysisWithIdentifiers,
    intent: refinedIntent,
    urgency,
    confidence: getRefinedConfidence({
      analysis: {
        ...analysisWithIdentifiers,
        urgency,
        hasClearRequest: hasExplicitRequest,
        isThreadContinuation,
      },
      messageType,
      actionability,
    }),
    risks: refinedRisks,
    summary: getRefinedSummary({
      analysis: {
        ...analysisWithIdentifiers,
        intent: refinedIntent,
        urgency,
        hasClearRequest: hasExplicitRequest,
        isThreadContinuation,
      },
      messageType,
      actionability,
      isThreadContinuation,
    }),
    messageType,
    actionability,
    replyNeeded,
    workType,
    hasClearRequest: hasExplicitRequest,
    isThreadContinuation,
    hasConfirmationRequest: confirmationRequest,
    hasLogisticsContext: logisticsContext,
    hasOperationalTimingSignal: operationalTimingSignal,
  };
}
