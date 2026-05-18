import { deriveIssueType } from "../domain/issueType";
import type { EmailAnalysis, OrderContext } from "../types/actionDesk";
import {
  getIdentifierReferenceLabel,
  hasCaseIdentifiers,
} from "./caseIdentifiers";

export type ReplyGenerationContext = {
  subject?: string;
  senderName?: string;
  senderEmail?: string;
  body?: string;
  bodyPreview?: string;
  summary?: string;
  customerName?: string;
  threadItemCount?: number;
};

export type ReplyUnavailableReason =
  | "internal_alert"
  | "non_customer_work"
  | "reply_not_needed"
  | "not_action_required"
  | "unclear_request";

type GenerateReplyOptions = {
  allowDeterministicFallback?: boolean;
  context?: ReplyGenerationContext;
};

type ReplyBuilderContext = {
  analysis: EmailAnalysis;
  order?: OrderContext;
  referenceLabel?: string;
  generationContext?: ReplyGenerationContext;
};

const DEFAULT_GREETING = "Hi,";
const DEFAULT_CLOSE = "Best,\nSupport Team";
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function generateReply(
  analysis: EmailAnalysis,
  order?: OrderContext,
  options?: GenerateReplyOptions,
): string {
  const unavailableReason = getReplyUnavailableReason(analysis);
  const referenceLabel = getIdentifierReferenceLabel(analysis);
  const context: ReplyBuilderContext = {
    analysis,
    order,
    referenceLabel,
    generationContext: options?.context,
  };

  if (unavailableReason) {
    return options?.allowDeterministicFallback &&
      shouldUseDeterministicFallbackReply(
        analysis,
        options.context,
        unavailableReason,
        order,
      )
      ? buildDeterministicFallbackReply(context)
      : "";
  }

  if (needsMissingInfoReply(analysis, order)) {
    return buildMissingInfoReply(context);
  }

  let replyDraft: string;

  switch (analysis.intent) {
    case "where_is_my_order":
      replyDraft = buildOrderStatusReply(context);
      break;
    case "pod_request":
      replyDraft = buildPodReply(context);
      break;
    case "cancellation_request":
      replyDraft = buildCancellationReply(context);
      break;
    case "short_shipment":
      replyDraft = buildShortShipmentReply(context);
      break;
    case "damaged_shipment":
      replyDraft = buildDamagedShipmentReply(context);
      break;
    case "address_change":
      replyDraft = buildAddressChangeReply(context);
      break;
    case "billing_question":
      replyDraft = buildBillingReply(context);
      break;
    case "operational_confirmation":
      replyDraft = buildOperationalConfirmationReply(context);
      break;
    case "general_support":
    default:
      replyDraft = buildGeneralSupportReply(context);
      break;
  }

  return replyDraft.trim() ||
    (options?.allowDeterministicFallback &&
    shouldUseDeterministicFallbackReply(analysis, options.context, null, order)
      ? buildDeterministicFallbackReply(context)
      : "");
}

export function getReplyUnavailableReason(
  analysis: EmailAnalysis,
): ReplyUnavailableReason | null {
  if (analysis.messageType === "internal_alert") {
    return "internal_alert";
  }

  if (analysis.workType && analysis.workType !== "customer_support") {
    return "non_customer_work";
  }

  if (analysis.messageType === "awareness_only") {
    return "reply_not_needed";
  }

  if (analysis.replyNeeded === "no") {
    return "reply_not_needed";
  }

  if (analysis.messageType === "informational") {
    return "not_action_required";
  }

  if (analysis.actionability && analysis.actionability !== "action_required") {
    return "not_action_required";
  }

  if (analysis.hasClearRequest === false) {
    return "unclear_request";
  }

  return null;
}

function shouldUseDeterministicFallbackReply(
  analysis: EmailAnalysis,
  context: ReplyGenerationContext | undefined,
  unavailableReason: ReplyUnavailableReason | null,
  order?: OrderContext,
): boolean {
  if (
    unavailableReason === "internal_alert" ||
    unavailableReason === "non_customer_work" ||
    unavailableReason === "reply_not_needed"
  ) {
    return false;
  }

  if (
    unavailableReason === "not_action_required" &&
    analysis.actionability &&
    analysis.actionability !== "review_needed"
  ) {
    return false;
  }

  return Boolean(
    order ||
      hasCaseIdentifiers(analysis) ||
      getIdentifierReferenceLabel(analysis) ||
      hasContextText(context?.subject) ||
      hasContextText(context?.body) ||
      hasContextText(context?.bodyPreview) ||
      hasContextText(context?.summary) ||
      hasContextText(context?.customerName),
  );
}

function hasContextText(value?: string): boolean {
  return Boolean(value?.trim());
}

function needsMissingInfoReply(analysis: EmailAnalysis, order?: OrderContext): boolean {
  const hasIdentifiers = hasCaseIdentifiers(analysis);

  if (analysis.intent === "where_is_my_order") {
    return !order && !analysis.orderNumber && !hasIdentifiers;
  }

  if (
    analysis.intent === "pod_request" ||
    analysis.intent === "cancellation_request" ||
    analysis.intent === "short_shipment" ||
    analysis.intent === "damaged_shipment" ||
    analysis.intent === "address_change" ||
    analysis.intent === "billing_question"
  ) {
    return !order && !analysis.orderNumber && !hasIdentifiers;
  }

  return false;
}

function buildGreeting(context?: ReplyGenerationContext): string {
  const firstName = getSafeFirstName(context?.senderName);

  return firstName ? `Hi ${firstName},` : DEFAULT_GREETING;
}

function buildClose(): string {
  return DEFAULT_CLOSE;
}

function buildReply(
  sentences: string[],
  context?: ReplyGenerationContext,
): string {
  return [buildGreeting(context), sentences.join(" "), buildClose()].join("\n\n");
}

function buildDeterministicFallbackReply({
  analysis,
  order,
  referenceLabel,
  generationContext,
}: ReplyBuilderContext): string {
  const subjectReference = getSubjectReference(generationContext?.subject);
  const customerReference = getCustomerReference(generationContext?.customerName);
  const requestReference = customerReference || subjectReference || "from your message";
  const sentences: string[] = [
    `I can help review the request ${requestReference}.`,
  ];

  if (order) {
    sentences.push(
      `Order ${order.orderNumber} is currently ${order.status}, and the shipment is ${order.shipmentStatus}${buildLastUpdatedClause(order.lastUpdated)}.`,
    );
  } else if (referenceLabel) {
    sentences.push(
      `I have ${referenceLabel}, and I will use that to check the available case details.`,
    );
  }

  sentences.push(buildFallbackNextStep(analysis, Boolean(order || referenceLabel)));

  return buildReply(sentences, generationContext);
}

function buildFallbackNextStep(
  analysis: EmailAnalysis,
  hasReferenceContext: boolean,
): string {
  switch (analysis.intent) {
    case "where_is_my_order":
      return hasReferenceContext
        ? "I will confirm the latest shipment detail and follow up with the next update."
        : "If you have an order number or tracking number, please send it over so I can confirm the latest shipment detail.";
    case "pod_request":
      return hasReferenceContext
        ? "I will check the delivery record and send the proof-of-delivery details if they are available."
        : "If you have an order number or delivery reference, please send it over so I can match the delivery record.";
    case "cancellation_request":
      return hasReferenceContext
        ? "I will review whether the order can still be stopped and follow up with the next step."
        : "If you have the order number, please send it over so I can confirm whether cancellation is still possible.";
    case "short_shipment":
      return "I will compare the shipment details with the reported missing items and follow up with the next step.";
    case "damaged_shipment":
      return "Please send a photo of the damage if you have one, and I will review the next step from there.";
    case "address_change":
      return "Please send the full corrected address exactly as it should appear, and I will confirm what can still be updated.";
    case "billing_question":
      return "I will review the billing details and follow up with the next step once I can verify the charge.";
    case "operational_confirmation":
      return "I will monitor the requested operational step and send a confirmation once it is completed.";
    case "general_support":
    default:
      return "I will review the available details and follow up with the next step.";
  }
}

function getSubjectReference(subject?: string): string {
  const normalizedSubject = normalizeInlineText(subject);

  if (!normalizedSubject) {
    return "";
  }

  return `about "${truncateText(normalizedSubject, 80)}"`;
}

function getCustomerReference(customerName?: string): string {
  const normalizedCustomerName = normalizeInlineText(customerName);

  return normalizedCustomerName
    ? `for ${truncateText(normalizedCustomerName, 80)}`
    : "";
}

function normalizeInlineText(value?: string): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function getSafeFirstName(senderName?: string): string {
  const normalizedName = normalizeInlineText(senderName);

  if (
    !normalizedName ||
    normalizedName.includes("@") ||
    /\b(unknown|support|team|noreply|no-reply|notification|admin)\b/i.test(
      normalizedName,
    )
  ) {
    return "";
  }

  const firstName = normalizedName
    .split(/\s+/)[0]
    .replace(/[^a-z'-]/gi, "");

  if (firstName.length < 2 || firstName.length > 24) {
    return "";
  }

  return `${firstName.charAt(0).toUpperCase()}${firstName.slice(1)}`;
}

function buildMissingInfoReply({ analysis }: ReplyBuilderContext): string {
  if (analysis.intent === "billing_question") {
    return buildReply([
      "I can help with the billing question, but I need the order number or invoice reference before I can verify the charge.",
      "Please send that over, and I will check the details for you.",
    ]);
  }

  if (analysis.intent === "address_change") {
    return buildReply([
      "I can help with the address change, but I need the order number and the full corrected address before I can confirm what is still possible.",
      "Please send both in your reply, and I will review the next step.",
    ]);
  }

  if (analysis.intent === "damaged_shipment") {
    return buildReply([
      "I can help with the damage report, but I need the order number before I can verify the shipment details.",
      "Please send the order number and, if possible, a quick photo of the damage so I can confirm the next step.",
    ]);
  }

  if (analysis.intent === "short_shipment") {
    return buildReply([
      "I can help with the missing item report, but I need the order number before I can compare the shipment against the order.",
      "Please send the order number and the missing item details, and I will review it from there.",
    ]);
  }

  if (analysis.intent === "cancellation_request") {
    return buildReply([
      "I can help with the cancellation request, but I need the order number before I can confirm whether the order can still be stopped.",
      "Please send that over, and I will review the next step with you.",
    ]);
  }

  if (analysis.intent === "pod_request") {
    return buildReply([
      "I can help with the proof of delivery request, but I need the order number or delivery reference before I can pull the record.",
      "Please send that over, and I will check it for you.",
    ]);
  }

  return buildReply([
    "I can help with that, but I need the order number or tracking number before I can confirm the shipment status.",
    "Please send that over, and I will check the latest update for you.",
  ]);
}

function buildOrderStatusReply({ analysis, order, referenceLabel }: ReplyBuilderContext): string {
  if (!order) {
    if (referenceLabel) {
      return buildReply([
        `I have ${referenceLabel}, but I cannot confirm the current shipment status from the available record yet.`,
        "If you have the latest tracking number or ship confirmation, send it over and I can narrow it down faster.",
      ]);
    }

    return buildMissingInfoReply({ analysis });
  }

  const issueType = deriveIssueType(analysis, order);
  const facts = buildOrderFacts(order);

  if (issueType === "delivered_not_received") {
    return buildReply([
      `${facts.orderLabel} shows as ${order.shipmentStatus}${facts.lastUpdatedClause}.`,
      "If you have already checked the delivery area and still do not have it, reply back and we can review the delivery scan and carrier next steps.",
    ]);
  }

  if (order.shipmentStatus === "Exception" || order.status === "Delayed") {
    return buildReply([
      `${facts.orderLabel} is currently ${order.status}, and the shipment is marked ${order.shipmentStatus}${facts.lastUpdatedClause}.`,
      "I will review the latest carrier update and share the next step as soon as that detail is confirmed.",
    ]);
  }

  if (order.shipmentStatus === "Label Created") {
    return buildReply([
      `${facts.orderLabel} currently shows ${order.shipmentStatus}${facts.lastUpdatedClause}.`,
      "That usually means the package has not posted its first carrier movement yet, and I will send the next update once that scan comes through.",
    ]);
  }

  return buildReply([
    `${facts.orderLabel} is currently ${order.status}, and the shipment is ${order.shipmentStatus}${facts.lastUpdatedClause}.`,
    "I will keep an eye on the next carrier update and send a follow-up if the timing changes.",
  ]);
}

function buildPodReply({ order, referenceLabel }: ReplyBuilderContext): string {
  if (!order) {
    if (referenceLabel) {
      return buildReply([
        `I can help with the proof of delivery request for ${referenceLabel}, but I need the delivery record before I can confirm the final POD details.`,
        "If you have the order number or delivery reference handy, send it over and I will match it up.",
      ]);
    }

    return buildMissingInfoReply({
      analysis: {
        intent: "pod_request",
      } as EmailAnalysis,
    });
  }

  if (order.shipmentStatus === "Delivered") {
    return buildReply([
      `Order ${order.orderNumber} shows as ${order.shipmentStatus}${buildLastUpdatedClause(order.lastUpdated)}.`,
      "I will confirm the delivery record and send the POD details in the follow-up.",
    ]);
  }

  return buildReply([
    `Order ${order.orderNumber} is currently ${order.status}, and the shipment is ${order.shipmentStatus}${buildLastUpdatedClause(order.lastUpdated)}.`,
    "A final POD may not be available until delivery is completed, and I will confirm that status before sending the next update.",
  ]);
}

function buildCancellationReply({ order, referenceLabel }: ReplyBuilderContext): string {
  if (!order) {
    if (referenceLabel) {
      return buildReply([
        `I can review the cancellation request for ${referenceLabel}, but I do not have enough confirmed shipment detail yet to say whether it can still be stopped.`,
        "If there is anything on the order that should stay active, include that in your reply and I will review the next step.",
      ]);
    }

    return buildMissingInfoReply({
      analysis: {
        intent: "cancellation_request",
      } as EmailAnalysis,
    });
  }

  if (order.status === "Processing" || order.shipmentStatus === "Label Created") {
    return buildReply([
      `Order ${order.orderNumber} is currently ${order.status}, and the shipment is ${order.shipmentStatus}${buildLastUpdatedClause(order.lastUpdated)}.`,
      "That means cancellation may still be possible, and I will review whether the order can be stopped before it moves further.",
    ]);
  }

  return buildReply([
    `Order ${order.orderNumber} is currently ${order.status}, and the shipment is ${order.shipmentStatus}${buildLastUpdatedClause(order.lastUpdated)}.`,
    "I cannot confirm a cancellation from this status, but if you want to keep moving on this, reply back and I can help review the next available option.",
  ]);
}

function buildShortShipmentReply({ order, referenceLabel }: ReplyBuilderContext): string {
  if (!order) {
    if (referenceLabel) {
      return buildReply([
        `I can help review the missing item report for ${referenceLabel}.`,
        "Please reply with the missing item names or quantities if they are not already in the thread, and I will line that up against the shipment record.",
      ]);
    }

    return buildMissingInfoReply({
      analysis: {
        intent: "short_shipment",
      } as EmailAnalysis,
    });
  }

  return buildReply([
    `I can help review the missing item report for order ${order.orderNumber}. The shipment currently shows ${order.shipmentStatus}${buildLastUpdatedClause(order.lastUpdated)}.`,
    "Please reply with the missing item names or quantities if needed, and I will compare them against the shipment record and confirm the next step.",
  ]);
}

function buildDamagedShipmentReply({ order, referenceLabel }: ReplyBuilderContext): string {
  if (!order) {
    if (referenceLabel) {
      return buildReply([
        `I am sorry the shipment arrived damaged. I can review it for ${referenceLabel}.`,
        "Please reply with a photo of the damage and the affected item details if you have them, and I will confirm the next step from there.",
      ]);
    }

    return buildMissingInfoReply({
      analysis: {
        intent: "damaged_shipment",
      } as EmailAnalysis,
    });
  }

  return buildReply([
    `I am sorry the shipment arrived damaged. Order ${order.orderNumber} currently shows ${order.shipmentStatus}${buildLastUpdatedClause(order.lastUpdated)}.`,
    "Please reply with a photo of the damage and the affected item details if you have them, and I will use that to confirm the next step.",
  ]);
}

function buildAddressChangeReply({ order, referenceLabel }: ReplyBuilderContext): string {
  if (!order) {
    if (referenceLabel) {
      return buildReply([
        `I can review the address change request for ${referenceLabel}.`,
        "Please send the full corrected address exactly as it should appear, and I will confirm whether the shipment can still be updated.",
      ]);
    }

    return buildMissingInfoReply({
      analysis: {
        intent: "address_change",
      } as EmailAnalysis,
    });
  }

  if (order.status === "Processing" || order.shipmentStatus === "Label Created") {
    return buildReply([
      `Order ${order.orderNumber} is currently ${order.status}, and the shipment is ${order.shipmentStatus}${buildLastUpdatedClause(order.lastUpdated)}.`,
      "There may still be time to update the address, so please send the full corrected address exactly as it should appear and I will review what is still possible.",
    ]);
  }

  return buildReply([
    `Order ${order.orderNumber} is currently ${order.status}, and the shipment is ${order.shipmentStatus}${buildLastUpdatedClause(order.lastUpdated)}.`,
    "This order may already be too far along for an address change, but send the corrected address in your reply and I will confirm the remaining options.",
  ]);
}

function buildBillingReply({ order, referenceLabel }: ReplyBuilderContext): string {
  if (!order) {
    if (referenceLabel) {
      return buildReply([
        `I can help review the billing question for ${referenceLabel}.`,
        "Please reply with the invoice number or the specific charge you want checked if it is not already in the thread, and I will line it up with the order record.",
      ]);
    }

    return buildMissingInfoReply({
      analysis: {
        intent: "billing_question",
      } as EmailAnalysis,
    });
  }

  return buildReply([
    `I can help review the billing question for order ${order.orderNumber}. The current order status is ${order.status}${buildLastUpdatedClause(order.lastUpdated)}.`,
    "Please reply with the invoice number or the specific charge you want checked if needed, and I will confirm the next step.",
  ]);
}

function buildOperationalConfirmationReply({ analysis, referenceLabel }: ReplyBuilderContext): string {
  if (analysis.hasOperationalTimingSignal) {
    return buildReply([
      referenceLabel
        ? `I have the logistics update for ${referenceLabel}.`
        : "I have the logistics update.",
      "I will keep an eye on the requested event and send a confirmation once that container or delivery step is completed.",
    ]);
  }

  return buildReply([
    referenceLabel
      ? `I have the logistics update for ${referenceLabel}.`
      : "I have the logistics update.",
    "I will send a confirmation once the requested operational step is completed.",
  ]);
}

function buildGeneralSupportReply({ analysis, order, referenceLabel }: ReplyBuilderContext): string {
  if (analysis.hasDeadlineRequest) {
    return buildReply([
      referenceLabel
        ? `I have ${referenceLabel}, and I understand the timing is important.`
        : "I understand the timing is important.",
      analysis.deadlineState === "past_due"
        ? "I am reviewing the latest available detail now and will send the next step as soon as I can confirm whether the requested timing has already been missed."
        : "I am reviewing the latest available detail now and will send the next step as soon as I can confirm the current timing.",
    ]);
  }

  if (order) {
    return buildReply([
      `I reviewed order ${order.orderNumber}. It is currently ${order.status}, and the shipment is ${order.shipmentStatus}${buildLastUpdatedClause(order.lastUpdated)}.`,
      "If you need me to check a specific part of the order, reply with that detail and I will confirm the next step.",
    ]);
  }

  if (referenceLabel) {
    return buildReply([
      `I can help with ${referenceLabel}.`,
      "If there is a specific question you want checked first, send that in your reply and I will confirm the next step.",
    ]);
  }

  return buildReply([
    "I can help with that.",
    "Please send the order number or the main detail you want checked, and I will confirm the next step.",
  ]);
}

function buildOrderFacts(order: OrderContext): {
  orderLabel: string;
  lastUpdatedClause: string;
} {
  return {
    orderLabel: `Order ${order.orderNumber}`,
    lastUpdatedClause: buildLastUpdatedClause(order.lastUpdated),
  };
}

function buildLastUpdatedClause(value?: string): string {
  const formatted = formatDateLabel(value);
  return formatted ? ` as of ${formatted}` : "";
}

function formatDateLabel(value?: string): string {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return `${MONTH_LABELS[parsed.getUTCMonth()]} ${parsed.getUTCDate()}, ${parsed.getUTCFullYear()}`;
}
