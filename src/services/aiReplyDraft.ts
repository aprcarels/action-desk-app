import type {
  AiReplyDraft,
  EmailAnalysis,
  OrderContext,
} from "../types/actionDesk";

export type AiDraftReplyRequest = {
  subject: string;
  from: string;
  body: string;
  analysis: EmailAnalysis;
  orderContext?: OrderContext;
  recommendedNextAction: string;
};

const TRACKING_NUMBER_PATTERN =
  /\b(?:1Z[A-Z0-9]{10,}|[A-Z]{2}\d{9}[A-Z]{2}|\d{12,22})\b/gi;

const DELIVERY_DATE_FACT_PATTERNS = [
  /\b(?:will|should|is expected to|expected to|scheduled to)\s+(?:arrive|deliver|be delivered)\s+(?:on|by|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b[^.!\n]*/gi,
  /\b(?:eta|estimated delivery|delivery date|delivery window)\s+(?:is|will be|:)\s+[^.!\n]+/gi,
];

const SHIPMENT_STATUS_FACT_PATTERNS = [
  /\b(?:has|have)\s+(?:shipped|been shipped|been delivered|delivered)\b/gi,
  /\b(?:is|are)\s+(?:in transit|out for delivery|delivered|delayed|shipped|processing|completed|cancelled|canceled|label created|marked exception|on hold)\b/gi,
];

const REFUND_APPROVAL_FACT_PATTERNS = [
  /\b(?:refund|credit)\s+(?:has been|was|is)\s+(?:approved|issued|processed)\b/gi,
  /\b(?:we|i)\s+(?:approved|issued|processed)\s+(?:the\s+)?(?:refund|credit)\b/gi,
];

const COMPLETED_ACTION_FACT_PATTERNS = [
  /\b(?:we|i)\s+(?:have\s+)?(?:processed|completed|canceled|cancelled|shipped|issued|approved|refunded|updated|changed|scheduled|created)\b/gi,
];

const POLICY_PROMISE_FACT_PATTERNS = [
  /\b(?:we|i)\s+(?:will|can)\s+(?:guarantee|approve|issue|process|refund|replace|cover|waive)\b/gi,
  /\b(?:free replacement|policy\s+(?:allows|guarantees|requires)|guaranteed delivery)\b/gi,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildGroundingText(request: AiDraftReplyRequest): string {
  return [
    request.subject,
    request.from,
    request.body,
    request.analysis.summary,
    request.analysis.nextAction,
    request.recommendedNextAction,
    request.analysis.orderNumber,
    ...(request.analysis.caseIdentifiers?.map((identifier) => identifier.value) ?? []),
    request.orderContext?.orderNumber,
    request.orderContext?.status,
    request.orderContext?.shipmentStatus,
    request.orderContext?.lastUpdated,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .toLowerCase();
}

function normalizeFactText(value?: string): string {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

function hasNegationNear(replyDraft: string, startIndex: number): boolean {
  const prefix = replyDraft
    .slice(Math.max(0, startIndex - 40), startIndex)
    .toLowerCase();

  return /\b(?:cannot|can't|can not|do not|don't|not|unable|not able|no confirmed|without confirmed)\b/.test(
    prefix,
  );
}

function isNegatedFactText(value: string): boolean {
  return /\b(?:cannot|can't|can not|do not|don't|not|unable|unknown|unavailable|not confirmed|no confirmed)\b/i.test(
    value,
  );
}

function findUnsupportedFacts(
  replyDraft: string,
  patterns: RegExp[],
): RegExpMatchArray[] {
  return patterns.flatMap((pattern) =>
    Array.from(replyDraft.matchAll(pattern)).filter((match) => {
      const index = match.index ?? 0;

      return !hasNegationNear(replyDraft, index) && !isNegatedFactText(match[0]);
    }),
  );
}

function extractTrackingTokens(text: string): string[] {
  return Array.from(text.matchAll(TRACKING_NUMBER_PATTERN), (match) =>
    match[0].toUpperCase(),
  );
}

function hasInventedTrackingNumber(replyDraft: string, groundingText: string): boolean {
  const groundedTracking = new Set(extractTrackingTokens(groundingText));

  return extractTrackingTokens(replyDraft).some((token) => !groundedTracking.has(token));
}

function isGroundedShipmentStatusFact(
  fact: string,
  request: AiDraftReplyRequest,
  groundingText: string,
): boolean {
  const normalizedFact = normalizeFactText(fact);
  const normalizedGrounding = normalizeFactText(groundingText);
  const groundedStatuses = [
    request.orderContext?.status,
    request.orderContext?.shipmentStatus,
  ]
    .map(normalizeFactText)
    .filter(Boolean);

  return (
    normalizedGrounding.includes(normalizedFact) ||
    groundedStatuses.some((status) => normalizedFact.includes(status))
  );
}

function hasUnsupportedSpecificFact(
  replyDraft: string,
  request: AiDraftReplyRequest,
  groundingText: string,
): boolean {
  const unsupportedSpecificFacts = findUnsupportedFacts(replyDraft, [
    ...DELIVERY_DATE_FACT_PATTERNS,
    ...REFUND_APPROVAL_FACT_PATTERNS,
    ...COMPLETED_ACTION_FACT_PATTERNS,
    ...POLICY_PROMISE_FACT_PATTERNS,
  ]);

  if (unsupportedSpecificFacts.length > 0) {
    return true;
  }

  return findUnsupportedFacts(replyDraft, SHIPMENT_STATUS_FACT_PATTERNS).some(
    (match) => !isGroundedShipmentStatusFact(match[0], request, groundingText),
  );
}

export function canRequestAiReplyDraft(
  analysis: EmailAnalysis,
  rulesReplyDraft: string,
): boolean {
  const hasDraftFallback = rulesReplyDraft.trim().length > 0;
  const replyRecommended =
    analysis.replyNeeded === "yes" || analysis.replyNeeded === "recommended";
  const actionabilityAllowed =
    analysis.actionability === "action_required" ||
    analysis.actionability === "review_needed";

  return (
    hasDraftFallback &&
    replyRecommended &&
    actionabilityAllowed &&
    analysis.workType === "customer_support" &&
    analysis.messageType !== "internal_alert" &&
    analysis.messageType !== "awareness_only" &&
    analysis.actionability !== "no_action_needed"
  );
}

export function normalizeAiReplyDraft(
  value: unknown,
  request: AiDraftReplyRequest,
): AiReplyDraft | null {
  if (!isRecord(value)) {
    return null;
  }

  const replyDraft =
    typeof value.replyDraft === "string"
      ? value.replyDraft.replace(/\\n/g, "\n").trim()
      : "";

  if (
    !replyDraft ||
    typeof value.aiSource !== "string" ||
    value.aiSource !== "ollama"
  ) {
    return null;
  }

  const groundingText = buildGroundingText(request);

  if (
    hasInventedTrackingNumber(replyDraft, groundingText) ||
    hasUnsupportedSpecificFact(replyDraft, request, groundingText) ||
    /\b(as an ai|ai assistant|language model)\b/i.test(replyDraft)
  ) {
    return null;
  }

  return {
    replyDraft,
    aiSource: "ollama",
  };
}
