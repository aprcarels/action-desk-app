import { computePriorityScore } from "../domain/priorityScore";
import {
  extractLatestMessageText,
  getDeadlineState,
  hasClearRequest,
  includesAny,
  isInternalOperationalReport,
  isInternalOperationsThread,
  isLikelyThreadContinuation,
  isVendorSalesOutreach,
} from "./emailWorkHeuristics";
import { generateRecommendedAction } from "./generateRecommendedAction";
import { generateReply } from "./generateReply";
import type {
  ActionDeskResult,
  EmailAnalysis,
  EmailItem,
  ProcessedEmail,
  WorkType,
} from "../types/actionDesk";

const CUSTOMER_SUPPORT_PATTERNS = [
  "where is my order",
  "order",
  "order status",
  "status update",
  "status request",
  "update request",
  "shipment",
  "tracking",
  "tracking number",
  "delivery",
  "delivered",
  "late",
  "delay",
  "delayed",
  "damaged",
  "damage",
  "missing item",
  "missing items",
  "wrong item",
  "incorrect item",
  "not received",
  "never received",
  "short shipment",
  "cancel",
  "cancellation",
  "address change",
  "shipping address",
  "proof of delivery",
  "delivery receipt",
  "invoice",
  "billing",
  "charged",
  "charge",
  "refund",
  "replacement",
  "return",
  "exchange",
  "help",
  "help me",
  "please help",
  "issue",
  "problem",
  "complaint",
  "disappointed",
  "unacceptable",
  "customer",
];

const SUSPICIOUS_PATTERNS = [
  "phishing",
  "scam",
  "suspicious",
  "is this real",
  "is this legit",
  "not sure if this is real",
  "fraud alert",
  "spam",
  "malware",
  "credential",
  "quarantine",
  "unsafe link",
];

const SYSTEM_PATTERNS = [
  "calendar",
  "meeting",
  "invite",
  "invitation",
  "accepted:",
  "declined:",
  "tentative:",
  "automatic reply",
  "out of office",
  "system alert",
  "automated",
  "notification",
  "no-reply",
  "noreply",
  "do not reply",
  "password reset",
  "sign-in",
  "signin",
  "mfa",
  "2fa",
  "security code",
];

const SYSTEM_REPORT_PATTERNS = [
  "tracking_summary",
  "tracking summary",
  "daily report",
  "daily summary",
  "summary report",
  "scheduled report",
  "automated report",
  "generated report",
  "system report",
];

const DEFINITE_SYSTEM_REPORT_PATTERNS = [
  "outboundyesterdaytracking_summary",
  "outbound yesterday tracking summary",
  "automated report",
  "generated report",
  "system report",
  "scheduled report",
];

const INTERNAL_PATTERNS = [
  "fyi",
  "for awareness",
  "for visibility",
  "heads up",
  "just letting you know",
  "no action needed",
  "no action required",
  "reply not needed",
  "please see below",
  "looping you in",
  "cc'ing you",
  "ccing you",
  "internal",
];

const VENDOR_PATTERNS = [
  "vendor",
  "supplier",
  "account maintenance",
  "account update",
  "portal",
  "subscription",
  "renewal",
  "w-9",
  "tax form",
  "banking update",
  "payment method",
  "remittance",
  "certificate of insurance",
  "pricing update",
  "business account",
];

const ACTIONABLE_CUSTOMER_PATTERNS = [
  "where is",
  "can you help",
  "please help",
  "need help",
  "please advise",
  "please update",
  "please send",
  "please confirm",
  "let me know",
  "refund",
  "replace",
  "return",
  "cancel",
  "damaged",
  "missing",
  "wrong item",
  "not received",
  "status",
  "tracking",
];

const ORDER_IDENTIFIER_PATTERN =
  /\b(?:ord-\d+|order\s*#?\s*[a-z0-9-]{4,}|\bpo[-\s]?\d+|\b\d{4,}-\d{4,}\b)\b/i;

const SYSTEM_SENDER_PATTERNS = [
  "noreply@",
  "no-reply@",
  "donotreply@",
  "do-not-reply@",
  "mailer-daemon@",
  "postmaster@",
  "notifications@",
  "calendar-notification@",
];

const SYSTEM_REPORT_SENDER_PATTERNS = [
  "systems@",
  "reports@",
  "reporting@",
  "scheduledreports@",
];

function isInternalSender(senderEmail: string): boolean {
  return senderEmail.endsWith("@apexpress.com");
}

function normalizeEmailText(email: EmailItem): string {
  return [email.subject, email.previewText, email.body]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .toLowerCase();
}

export function isLowValueSystemReportEmail(email: Pick<
  EmailItem,
  "senderEmail" | "subject" | "previewText" | "body"
>): boolean {
  const sender = (email.senderEmail || "").toLowerCase();
  const normalizedText = normalizeEmailText(email as EmailItem);
  const senderLooksLikeReport = SYSTEM_REPORT_SENDER_PATTERNS.some((pattern) =>
    sender.includes(pattern),
  );
  const textLooksLikeReport = includesAny(normalizedText, SYSTEM_REPORT_PATTERNS);
  const textIsDefiniteSystemReport = includesAny(
    normalizedText,
    DEFINITE_SYSTEM_REPORT_PATTERNS,
  );

  return (
    sender === "systems@apexpress.com" ||
    textIsDefiniteSystemReport ||
    (senderLooksLikeReport && textLooksLikeReport)
  );
}

function getLatestNormalizedMessage(email: EmailItem): string {
  const latestMessageText = extractLatestMessageText(email.body || "");

  return (
    latestMessageText ||
    [email.subject, email.previewText, email.body]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join("\n")
  ).toLowerCase();
}

function hasTextOrderIdentifier(text: string): boolean {
  return ORDER_IDENTIFIER_PATTERN.test(text);
}

function hasOrderIdentifier(
  text: string,
  analysis?: EmailAnalysis,
  options?: { allowAnalysisIdentifiers?: boolean },
): boolean {
  return (
    hasTextOrderIdentifier(text) ||
    (options?.allowAnalysisIdentifiers === true &&
      (Boolean(analysis?.orderNumber) || Boolean(analysis?.caseIdentifiers?.length)))
  );
}

function hasDirectCustomerSignals(text: string, analysis?: EmailAnalysis): boolean {
  return (
    includesAny(text, CUSTOMER_SUPPORT_PATTERNS) ||
    includesAny(text, ACTIONABLE_CUSTOMER_PATTERNS) ||
    hasOrderIdentifier(text, analysis, { allowAnalysisIdentifiers: false }) ||
    Boolean(analysis?.hasDeadlineRequest) ||
    Boolean(analysis?.hasConfirmationRequest && analysis?.hasLogisticsContext)
  );
}

function hasActionableRequestSignals(text: string, analysis?: EmailAnalysis): boolean {
  return (
    hasClearRequest(text) ||
    Boolean(analysis?.replyNeeded === "yes") ||
    Boolean(analysis?.actionability === "action_required")
  );
}

function hasCustomerTopicSignals(text: string, analysis?: EmailAnalysis): boolean {
  return (
    includesAny(text, CUSTOMER_SUPPORT_PATTERNS) ||
    includesAny(text, ACTIONABLE_CUSTOMER_PATTERNS) ||
    hasOrderIdentifier(text, analysis, { allowAnalysisIdentifiers: true }) ||
    Boolean(analysis?.hasDeadlineRequest) ||
    Boolean(analysis?.hasConfirmationRequest && analysis?.hasLogisticsContext) ||
    Boolean(analysis && analysis.intent !== "general_support") ||
    Boolean(analysis && analysis.risks.length > 0)
  );
}

function hasCustomerSignals(text: string, analysis?: EmailAnalysis): boolean {
  return (
    hasCustomerTopicSignals(text, analysis) || hasActionableRequestSignals(text, analysis)
  );
}

export function getWorkTypeLabel(workType?: WorkType): string {
  switch (workType) {
    case "customer_support":
      return "Customer Support";
    case "internal":
      return "Internal";
    case "vendor":
      return "Vendor";
    case "system":
      return "System";
    case "suspicious":
      return "Suspicious";
    case "unknown":
    default:
      return "Unknown";
  }
}

export function classifyWorkType(
  email: EmailItem,
  analysis?: EmailAnalysis,
): WorkType {
  const normalizedText = normalizeEmailText(email);
  const latestMessageText = extractLatestMessageText(
    email.body || normalizedText,
  );
  const normalizedLatestMessage = (
    latestMessageText || normalizedText || ""
  ).toLowerCase();
  const sender = (email.senderEmail || "").toLowerCase();

  const explicitCustomerCase =
    hasDirectCustomerSignals(normalizedLatestMessage, analysis) ||
    hasTextOrderIdentifier(normalizedLatestMessage);

  const customerSignals = hasCustomerSignals(normalizedLatestMessage, analysis);
  const suspicious = includesAny(normalizedLatestMessage, SUSPICIOUS_PATTERNS);
  const threadContinuation = isLikelyThreadContinuation(
    latestMessageText,
    email.body || "",
  );
  const internalOperationalReport =
    isInternalOperationalReport(normalizedLatestMessage) ||
    isInternalOperationalReport(normalizedText);
  const internalOperations =
    isInternalOperationsThread(normalizedLatestMessage) ||
    isInternalOperationsThread(normalizedText);

  const system =
    isLowValueSystemReportEmail(email) ||
    includesAny(normalizedLatestMessage, SYSTEM_PATTERNS) ||
    SYSTEM_SENDER_PATTERNS.some((pattern) => sender.includes(pattern));

  const vendorSalesOutreach =
    isVendorSalesOutreach(normalizedLatestMessage) ||
    isVendorSalesOutreach(normalizedText);

  const vendor =
    (vendorSalesOutreach || includesAny(normalizedLatestMessage, VENDOR_PATTERNS)) &&
    !hasDirectCustomerSignals(normalizedLatestMessage, analysis) &&
    !hasTextOrderIdentifier(normalizedLatestMessage);

  const internal =
    includesAny(normalizedLatestMessage, INTERNAL_PATTERNS) ||
    internalOperations ||
    internalOperationalReport ||
    (isInternalSender(sender) && internalOperationalReport) ||
    (threadContinuation && !hasClearRequest(normalizedLatestMessage));

  if (suspicious) {
    return "suspicious";
  }

  if (vendorSalesOutreach) {
    return "vendor";
  }

  if (internalOperationalReport && !hasClearRequest(normalizedLatestMessage)) {
    return "internal";
  }

  if (system) {
    return "system";
  }

  if (vendor) {
    return "vendor";
  }

  if (threadContinuation && !hasClearRequest(normalizedLatestMessage) && !explicitCustomerCase) {
    return "internal";
  }

  if (internal && !hasDirectCustomerSignals(normalizedLatestMessage, analysis)) {
    return "internal";
  }

  if (explicitCustomerCase || customerSignals) {
    return "customer_support";
  }

  if (internal) {
    return "internal";
  }

  return "unknown";
}

function createSuppressedAnalysis(
  analysis: EmailAnalysis,
  workType: Exclude<WorkType, "customer_support">,
): EmailAnalysis {
  const summary =
    workType === "suspicious"
      ? "Suspicious or phishing-related message. Review internally before taking any action."
      : workType === "system"
        ? "System, calendar, or automated administrative message. Not a customer-service case."
        : workType === "vendor"
          ? "Vendor sales outreach or account-maintenance thread. Not a customer-service case."
          : workType === "internal"
            ? "Internal operational report or awareness-only message. Keep for review, not for customer-service follow-up."
            : "This message is not clearly a customer-service case and should be reviewed before any reply.";
  const nextAction =
    workType === "suspicious"
      ? "Review internally as suspicious or phishing-related mail. Do not send a customer-service reply unless ownership is confirmed."
      : workType === "system"
        ? "No customer-service reply recommended. Keep for awareness or route to the appropriate internal owner if follow-up is needed."
        : workType === "vendor"
          ? "No customer-service action needed. Mark not relevant unless an internal owner intentionally wants to review the vendor outreach."
          : workType === "internal"
            ? "No customer-service reply recommended. Keep this for internal awareness or review only unless a clear customer action is requested."
            : "Review first and confirm whether this belongs in customer service before replying or taking action.";

  return {
    ...analysis,
    summary,
    intent: "general_support",
    urgency: "low",
    confidence: analysis.confidence === "high" ? "medium" : "low",
    orderNumber: undefined,
    risks: [],
    nextAction,
    actionability:
      workType === "suspicious" || analysis.hasClearRequest ? "review_needed" : "no_action_needed",
    replyNeeded: "no",
    messageType:
      workType === "internal" && !analysis.hasClearRequest ? "awareness_only" : "internal_alert",
    workType,
  };
}

export function normalizeProcessedEmailResult(
  email: EmailItem,
  result: ActionDeskResult,
): ActionDeskResult {
  const latestMessageText = extractLatestMessageText(email.body);
  const normalizedLatestMessage = (latestMessageText || email.body).toLowerCase();
  const deadlineState = result.analysis.hasDeadlineRequest
    ? getDeadlineState(latestMessageText || email.body, email.receivedAt)
    : "none";
  const derivedAnalysis: EmailAnalysis = {
    ...result.analysis,
    deadlineState,
    urgency:
      result.analysis.hasDeadlineRequest && deadlineState === "past_due"
        ? "high"
        : result.analysis.urgency,
    hasClearRequest: hasClearRequest(normalizedLatestMessage),
    isThreadContinuation: isLikelyThreadContinuation(latestMessageText, email.body),
  };
  const workType = classifyWorkType(email, derivedAnalysis);
  const analysis =
    workType === "customer_support"
      ? {
          ...derivedAnalysis,
          workType,
        }
      : createSuppressedAnalysis(derivedAnalysis, workType);
  const orderContext =
    workType === "customer_support" ? result.orderContext : undefined;
  const nextAction = generateRecommendedAction({
    intent: analysis.intent,
    urgency: analysis.urgency,
    risks: analysis.risks,
    orderNumber: analysis.orderNumber,
    caseIdentifiers: analysis.caseIdentifiers,
    hasDeadlineRequest: analysis.hasDeadlineRequest,
    deadlineState: analysis.deadlineState,
    messageType: analysis.messageType,
    actionability: analysis.actionability,
    replyNeeded: analysis.replyNeeded,
    workType: analysis.workType,
    hasConfirmationRequest: analysis.hasConfirmationRequest,
    hasLogisticsContext: analysis.hasLogisticsContext,
    hasOperationalTimingSignal: analysis.hasOperationalTimingSignal,
    orderContext,
  });
  const nextAnalysis = {
    ...analysis,
    nextAction,
  };
  const replyDraft = generateReply(nextAnalysis, orderContext);
  const priorityResult = computePriorityScore(nextAnalysis, orderContext);

  return {
    ...result,
    analysis: nextAnalysis,
    orderContext,
    replyDraft,
    priorityScore: priorityResult.score,
    priorityBreakdown: priorityResult.breakdown,
    warning:
      nextAnalysis.orderNumber &&
      !orderContext &&
      nextAnalysis.actionability === "action_required"
        ? "Order status not confirmed yet"
        : undefined,
  };
}

export function shouldShowInCustomerServiceQueue(item: ProcessedEmail): boolean {
  if (item.status !== "processed" || !item.result) {
    return true;
  }

  const analysis = item.result.analysis;
  const latestMessageText = getLatestNormalizedMessage(item.email);
  const fullText = normalizeEmailText(item.email);
  const hasBroadCustomerSignals =
    hasCustomerTopicSignals(latestMessageText, analysis) ||
    hasCustomerTopicSignals(fullText, analysis);
  const hasDirectCustomerContext =
    hasDirectCustomerSignals(latestMessageText, analysis) ||
    hasDirectCustomerSignals(fullText, analysis);
  const hasActionableCustomerAsk =
    hasActionableRequestSignals(latestMessageText, analysis);
  const internalOperationalReport =
    isInternalOperationalReport(latestMessageText) ||
    isInternalOperationalReport(fullText);
  const isContinuationWithoutAsk =
    analysis.isThreadContinuation === true &&
    !analysis.hasClearRequest &&
    !hasBroadCustomerSignals;

  if (analysis.workType === "customer_support") {
    return true;
  }

  if (
    analysis.workType === "suspicious" ||
    analysis.workType === "system" ||
    analysis.workType === "vendor"
  ) {
    return false;
  }

  if (analysis.workType === "internal") {
    if (internalOperationalReport && !hasActionableCustomerAsk) {
      return false;
    }

    return hasDirectCustomerContext || hasActionableCustomerAsk;
  }

  if (isContinuationWithoutAsk) {
    return false;
  }

  return hasBroadCustomerSignals || hasActionableCustomerAsk;
}
