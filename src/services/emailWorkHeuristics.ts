const CLEAR_REQUEST_PATTERNS = [
  "are the",
  "getting prepared",
  "when will",
  "please cancel",
  "cancel all",
  "cancel this",
  "cancel these",
  "cancel order",
  "pls confirm",
  "please confirm",
  "kindly confirm",
  "confirm receipt",
  "please confirm receipt",
  "acknowledge receipt",
  "please acknowledge",
  "please acknowledge receipt",
  "please send",
  "please update",
  "please provide",
  "please proceed",
  "please advise",
  "please help",
  "can you",
  "could you",
  "would you",
  "we need",
  "let me know once",
  "let me know when",
  "confirm once",
  "send me",
  "update on your end",
  "whichever is easier",
  "would you prefer to cancel",
  "please review",
  "please investigate",
  "please change",
  "please correct",
];

const TOPIC_REQUEST_PATTERNS = [
  "pallet details",
  "pallet detail",
  "ship date",
  "outbound ship date",
  "status",
  "eta",
];

const TOPIC_REQUEST_FRAMING_PATTERNS = [
  "please",
  "pls",
  "can you",
  "could you",
  "would you",
  "do you",
  "do we",
  "are the",
  "are there",
  "when will",
  "waiting for",
  "need",
  "provide",
  "send",
  "update",
  "confirm",
  "let me know",
];

const CONTINUATION_PATTERNS = [
  "i just sent it",
  "i just sent it in a separate email",
  "sent it in a separate email",
  "see below",
  "following up",
  "thanks",
  "thank you",
  "got it",
  "please see attached",
  "see attached",
  "attached",
  "noted",
  "understood",
];

const CUSTOMER_FOLLOW_UP_PATTERNS = [
  "are the",
  "are there",
  "can you provide",
  "could you provide",
  "do you have",
  "do we have",
  "waiting for",
  "status",
  "eta",
  "when will",
  "getting prepared",
  "please provide",
  "kindly provide",
  "pallet details",
  "pallet detail",
  "pallet weight",
  "pallet dimensions",
  "total cases",
  "cases per pallet",
  "units per case",
  "pick ticket",
  "ship date",
  "outbound ship date",
  "routing details",
  "bol",
  "asn",
];

const INTERNAL_OPERATION_PATTERNS = [
  "transfer",
  "stock transfer",
  "rework",
  "allocate",
  "allocation",
  "cycle count",
  "stock",
  "inventory",
  "reserve",
  "vas",
  "rsv",
  "apcar",
  "apcrsv",
  "pick ticket",
  "due date",
  "rework product",
  "warehouse manager",
  "customer service supervisor",
  "pallet",
  "units on hand",
];

const INTERNAL_OPERATION_REPORT_PATTERNS = [
  "all orders are on track",
  "orders are on track",
  "tracking numbers are in excel",
  "tracking numbers are attached",
  "tracking number report",
  "tracking report",
  "orders rolling over",
  "order rolling over",
  "rolling over to process tomorrow",
  "roll over to process tomorrow",
  "rolling over for tomorrow",
  "process tomorrow",
  "processing tomorrow",
  "eod report",
  "eod status",
  "end of day report",
  "end-of-day report",
  "daily status report",
  "daily operations report",
  "operations report",
  "status report",
  "excel report",
];

const INTERNAL_OPERATION_REPORT_MARKERS = [
  "eod",
  "end of day",
  "end-of-day",
  "daily status",
  "daily report",
  "status report",
  "operations report",
  "operational report",
];

const HIGH_URGENCY_PATTERNS = [
  "hot!",
  "hot",
  "urgent",
  "asap",
  "immediately",
  "time-sensitive",
  "importance: high",
  "high importance",
  "ship today",
  "shipping today",
  "confirm this will be shipping today",
  "confirm this will ship today",
  "confirm today",
  "standard overnight",
  "overnight",
  "same day",
  "arrive tomorrow",
  "need these shipped today",
  "needs to go out today",
  "go out today",
  "by end of day",
  " eod",
];

const MEDIUM_URGENCY_PATTERNS = [
  "arrive on friday",
  "arrive friday",
];

const SHIPPING_DEADLINE_PATTERNS = [
  "ship today",
  "shipping today",
  "confirm this will be shipping today",
  "confirm this will ship today",
  "will this ship today",
  "will this be shipping today",
  "standard overnight",
  "overnight",
  "same day",
  "arrive on friday",
  "arrive friday",
  "arrive tomorrow",
  "need these shipped today",
  "needs to go out today",
  "go out today",
  "by end of day",
  " eod",
];

const CONFIRMATION_REQUEST_PATTERNS = [
  "please confirm",
  "pls confirm",
  "confirm receipt",
  "please confirm receipt",
  "confirm once",
  "confirm once delivered",
  "confirm once dropped",
  "confirm once the container has dropped",
  "let me know once",
  "let me know when",
  "advise once",
  "acknowledge receipt",
  "please acknowledge",
  "please advise once complete",
];

const LOGISTICS_COORDINATION_PATTERNS = [
  "inbound",
  "inbound container",
  "container",
  "container number",
  "appointment",
  "scheduled appointment",
  "eta",
  "drop eta",
  "drop",
  "dropped",
  "delivered to ap",
  "ofd",
  "receipt",
  "packing list attached",
  "shipment reference",
  "inbship",
  "trailer",
  "forwarder",
  "driver",
  "dock",
  "facility drop",
];

const OPERATIONAL_LOGISTICS_SCHEDULING_PHRASES = [
  "scheduled load",
  "multi pick up",
  "multi pickup",
  "multi-pick up",
  "multi-pickup",
  "carrier pickup date",
  "carrier pickup",
  "pickup date",
  "pickup appointment",
  "pickup number",
  "scheduled pickup",
  "routing status",
  "routing instruction",
  "routing instructions",
  "routing coordination",
  "reply if date/time does not work",
  "reply if the date/time does not work",
  "date/time does not work",
  "loading and transit times",
  "loading time",
  "transit time",
  "stop time",
  "stop times",
  "tonu",
  "otif",
];

const MISSED_PICKUP_PATTERNS = [
  "missed pickups",
  "missed pickup",
  "pickup missed",
  "pickup was missed",
  "pickup has been missed",
  "driver did not check in",
  "driver didn't check in",
  "pickup not completed",
  "not picked up",
  "failed pickup",
  "attached are the missed pickups",
];

const OPERATIONAL_EXCEPTION_PATTERNS = [
  ...MISSED_PICKUP_PATTERNS,
  "shipment exception",
  "shipment exceptions",
  "pickup exception",
  "pickup exceptions",
  "scheduling issue",
  "routing issue",
  "carrier exception",
  "carrier exceptions",
  "pickup issue",
  "pickup issues",
];

const OPERATIONAL_LOGISTICS_SCHEDULING_REGEXES = [
  /\bmpu\b/,
  /\bcdd\b/,
  /\bstop\s*#?\s*[12]\b/,
  /\bpickup\s*(?:no\.?|number|#)\b/,
  /\bload\s*#?\s*\d{5,}\b/,
];

const LOGISTICS_SCHEDULE_CONFLICT_PATTERNS = [
  "this date/time does not work",
  "the date/time does not work for us",
  "does not work for us",
  "doesn't work for us",
  "will not work for us",
  "won't work for us",
  "schedule conflict",
  "scheduling conflict",
  "need alternate",
  "need an alternate",
  "alternate pickup",
  "alternate scheduling",
  "different pickup time",
  "different pickup date",
  "please reschedule",
  "need to reschedule",
  "must reschedule",
  "cannot make the pickup",
  "can't make the pickup",
  "unable to make the pickup",
];

const LOGISTICS_FAILURE_ESCALATION_PATTERNS = [
  "missed pickup",
  "missed appointment",
  "failed pickup",
  "pickup failed",
  "did not pick up",
  "didn't pick up",
  "not picked up",
  "unable to pick up",
  "cannot pick up",
  "can't pick up",
  "escalate",
  "escalation",
  "failure",
  "failed",
  "charge already applied",
  "charges already applied",
  "charges were applied",
  "tonu applied",
  "otif charge applied",
  "penalty assessed",
];

const OPERATIONAL_TIMING_PATTERNS = [
  "appointment",
  "scheduled appointment",
  "eta",
  "drop eta",
  "today",
  "tomorrow",
  "friday",
  "overnight",
  "same day",
  "by end of day",
  " eod",
  "arrive",
  "delivered",
  "drop",
  "dropped",
  "scheduled load",
  "carrier pickup date",
  "pickup appointment",
  "pickup date",
  "loading and transit times",
];

const BILLING_CORE_PATTERNS = [
  "invoice",
  "billing",
  "refund",
  "refunded",
  "credit memo",
  "credit request",
  "payment",
  "overcharged",
  "over charge",
  "charged twice",
  "double charged",
  "charged incorrectly",
  "incorrect charge",
  "wrong charge",
  "dispute charge",
  "chargeback",
  "past due balance",
];

const BILLING_ASK_REGEXES = [
  /\b(?:why|what|can|could|please|need|help|review|correct|dispute)\b.{0,80}\b(?:bill|billing|invoice|payment|refund|credit|charge|charged)\b/,
  /\b(?:bill|billing|invoice|payment|refund|credit|charge|charged)\b.{0,80}\b(?:wrong|incorrect|mistake|dispute|refund|credit|overcharge|twice|duplicate|explain|review|correct)\b/,
  /\b(?:we|i)\s+(?:were|was|have been)\s+charged\b/,
];

const VENDOR_SALES_OUTREACH_PATTERNS = [
  "account executive",
  "book a demo",
  "book time",
  "can i show you",
  "can we show you",
  "cold outreach",
  "demo",
  "for your it",
  "new hire deployment",
  "our platform",
  "our service",
  "our solution",
  "pricing",
  "quick chat",
  "quick call",
  "quick conversation",
  "recover devices",
  "recovery rate",
  "roi",
  "sales",
  "schedule a call",
  "schedule a demo",
  "show you what it looks like",
  "technical sales manager",
  "we help companies",
  "we help teams",
  "worth a conversation",
  "your it team",
];

const VENDOR_SALES_VALUE_PATTERNS = [
  "asset recovery",
  "device recovery",
  "durability",
  "hardware durability",
  "industrial environment",
  "industrial environments",
  "it asset",
  "made in america",
  "made in the usa",
  "new hire",
  "onboarding",
  "offboarding",
  "railroad environment",
  "railroad environments",
  "recover",
  "reduce cost",
  "rugged hardware",
  "save money",
  "savings",
  "service",
  "software",
];

const VENDOR_SALES_CALL_TO_ACTION_PATTERNS = [
  "are you open to",
  "open to a call",
  "open to a quick chat",
  "book",
  "can i show you",
  "can we show you",
  "demo",
  "quick chat",
  "quick conversation",
  "schedule",
  "show you",
  "talk next week",
  "worth a conversation",
  "would you be open",
];

const CUSTOMER_SERVICE_REQUEST_PATTERNS = [
  "address change",
  "cancel my order",
  "cancel order",
  "damaged shipment",
  "delivery receipt",
  "did not receive",
  "missing item",
  "missing items",
  "my order",
  "not received",
  "order status",
  "proof of delivery",
  "shipment status",
  "tracking number",
  "where is my order",
];

const CUSTOMER_CASE_IDENTIFIER_PATTERN =
  /\b(?:ord-\d+|order\s*#?\s*[a-z0-9-]{4,}|\bpo[-\s]?\d+|\b\d{4,}-\d{4,}\b)\b/i;

function normalizeWhitespace(value: string): string {
  return value.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
}

export function includesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

function countOperationalLogisticsSchedulingSignals(normalized: string): number {
  const matches = new Set<string>();

  for (const phrase of OPERATIONAL_LOGISTICS_SCHEDULING_PHRASES) {
    if (normalized.includes(phrase)) {
      matches.add(phrase);
    }
  }

  OPERATIONAL_LOGISTICS_SCHEDULING_REGEXES.forEach((pattern, index) => {
    if (pattern.test(normalized)) {
      matches.add(`regex:${index}`);
    }
  });

  return matches.size;
}

export function isVendorSalesOutreach(text: string): boolean {
  const normalized = normalizeWhitespace(text).toLowerCase();

  if (!normalized) {
    return false;
  }

  const hasExplicitCustomerCase =
    includesAny(normalized, CUSTOMER_SERVICE_REQUEST_PATTERNS) ||
    CUSTOMER_CASE_IDENTIFIER_PATTERN.test(normalized);

  if (hasExplicitCustomerCase) {
    return false;
  }

  const hasSalesPhrase = includesAny(normalized, VENDOR_SALES_OUTREACH_PATTERNS);
  const hasValueProp =
    includesAny(normalized, VENDOR_SALES_VALUE_PATTERNS) ||
    /\b\d{1,3}%\s+(?:recovery|recovered|savings|roi|return)\b/.test(normalized);
  const hasCallToAction = includesAny(
    normalized,
    VENDOR_SALES_CALL_TO_ACTION_PATTERNS,
  );

  return (
    (hasSalesPhrase && (hasValueProp || hasCallToAction)) ||
    (hasValueProp && hasCallToAction && normalized.includes("we "))
  );
}

export function isInternalOperationalReport(text: string): boolean {
  const normalized = normalizeWhitespace(text).toLowerCase();

  if (!normalized) {
    return false;
  }

  const hasReportMarker =
    INTERNAL_OPERATION_REPORT_MARKERS.some((marker) => (
      marker === "eod"
        ? /\beod\b/.test(normalized)
        : normalized.includes(marker)
    )) ||
    /\beod\s+\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/.test(normalized);
  const hasOperationalReportLanguage = includesAny(
    normalized,
    INTERNAL_OPERATION_REPORT_PATTERNS,
  );
  const hasExcelTrackingRollup =
    normalized.includes("excel") &&
    normalized.includes("order") &&
    (normalized.includes("tracking number") ||
      normalized.includes("tracking numbers") ||
      normalized.includes("tracking"));
  const hasRolloverLanguage =
    normalized.includes("roll") &&
    normalized.includes("over") &&
    normalized.includes("process") &&
    normalized.includes("tomorrow");

  return (
    (hasReportMarker &&
      (hasOperationalReportLanguage ||
        hasExcelTrackingRollup ||
        hasRolloverLanguage)) ||
    (hasExcelTrackingRollup && hasRolloverLanguage)
  );
}

function includesTopicRequestPattern(text: string): boolean {
  return TOPIC_REQUEST_PATTERNS.some((pattern) => (
    pattern === "eta" ? /\beta\b/.test(text) : text.includes(pattern)
  ));
}

function hasTopicRequestFraming(text: string): boolean {
  return text.includes("?") || includesAny(text, TOPIC_REQUEST_FRAMING_PATTERNS);
}

export function hasCustomerFollowUpRequest(text: string): boolean {
  const normalized = normalizeWhitespace(text).toLowerCase();

  if (!normalized) {
    return false;
  }

  const hasQuestion = normalized.includes("?");
  const hasFollowUpLanguage = includesAny(normalized, CUSTOMER_FOLLOW_UP_PATTERNS);
  const hasDirectCustomerQuestion =
  normalized.includes("is the team working on this order") ||
  normalized.includes("any chance we receive") ||
  normalized.includes("please provide") ||
  normalized.includes("kindly provide") ||
  normalized.includes("can you provide") ||
  normalized.includes("can we receive") ||
  normalized.includes("pallet details") ||
  normalized.includes("pallet detail");
  const hasOperationalLanguage =
    hasLogisticsCoordinationSignals(normalized) ||
    isInternalOperationsThread(normalized) ||
    normalized.includes("pallet") ||
    normalized.includes("pick ticket") ||
    normalized.includes("ship date");

  return (
  (hasQuestion && hasOperationalLanguage) ||
  hasFollowUpLanguage ||
  hasDirectCustomerQuestion
);
}

export function extractLatestMessageText(email: string): string {
  const lines = email.replace(/\r/g, "").split("\n");
  const latestLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (
      /^>/.test(trimmed) ||
      /^from:/i.test(trimmed) ||
      /^sent:/i.test(trimmed) ||
      /^subject:/i.test(trimmed) ||
      /^to:/i.test(trimmed) ||
      /^cc:/i.test(trimmed) ||
      /^begin forwarded message:/i.test(trimmed) ||
      /^_{2,}$/.test(trimmed) ||
      /^-{2,}$/.test(trimmed) ||
      /^on .+ wrote:$/i.test(trimmed) ||
      /^-+original message-+$/i.test(trimmed) ||
      /^-+ forwarded message -+$/i.test(trimmed)
    ) {
      break;
    }

    latestLines.push(line);
  }

  return normalizeWhitespace(latestLines.join("\n"));
}

export function hasClearRequest(text: string): boolean {
  const normalized = normalizeWhitespace(text).toLowerCase();

  if (!normalized) {
    return false;
  }

  return (
    includesAny(normalized, CLEAR_REQUEST_PATTERNS) ||
    (includesTopicRequestPattern(normalized) && hasTopicRequestFraming(normalized))
  );
}

export function isLikelyThreadContinuation(latestMessageText: string, fullEmailText: string): boolean {
  const normalizedLatest = normalizeWhitespace(latestMessageText).toLowerCase();
  const normalizedFull = normalizeWhitespace(fullEmailText).toLowerCase();

  if (!normalizedLatest) {
    return false;
  }

  if (hasCustomerFollowUpRequest(normalizedLatest)) {
    return false;
  }

  const wordCount = normalizedLatest.split(/\s+/).filter(Boolean).length;
  const hasQuotedThreadMarkers = normalizedFull !== normalizedLatest;
  const matchesContinuationPattern = includesAny(normalizedLatest, CONTINUATION_PATTERNS);

  if (matchesContinuationPattern && !hasClearRequest(normalizedLatest)) {
    return true;
  }

  return hasQuotedThreadMarkers && wordCount <= 8 && !hasClearRequest(normalizedLatest);
}

export function isInternalOperationsThread(text: string): boolean {
  const normalized = normalizeWhitespace(text).toLowerCase();

  return (
    includesAny(normalized, INTERNAL_OPERATION_PATTERNS) ||
    isInternalOperationalReport(normalized)
  );
}

export function hasShippingDeadlineRequest(text: string): boolean {
  return includesAny(normalizeWhitespace(text).toLowerCase(), SHIPPING_DEADLINE_PATTERNS);
}

export function hasConfirmationRequest(text: string): boolean {
  return includesAny(normalizeWhitespace(text).toLowerCase(), CONFIRMATION_REQUEST_PATTERNS);
}

export function hasOperationalLogisticsSchedulingSignals(text: string): boolean {
  const normalized = normalizeWhitespace(text).toLowerCase();

  if (!normalized) {
    return false;
  }

  const signalCount = countOperationalLogisticsSchedulingSignals(normalized);
  const hasStrongSchedulingSignal =
    normalized.includes("scheduled load") ||
    normalized.includes("multi pick up") ||
    normalized.includes("multi pickup") ||
    normalized.includes("carrier pickup date") ||
    normalized.includes("routing status") ||
    normalized.includes("reply if date/time does not work") ||
    normalized.includes("reply if the date/time does not work") ||
    /\bmpu\b/.test(normalized);
  const hasLogisticsNoun =
    /\b(?:load|pickup|pick up|routing|carrier|stop|appointment)\b/.test(normalized);

  return (
    (hasStrongSchedulingSignal && signalCount >= 2) ||
    (hasLogisticsNoun && signalCount >= 3)
  );
}

export function hasOperationalLogisticsScheduleConflict(text: string): boolean {
  const normalized = normalizeWhitespace(text).toLowerCase();

  if (!normalized) {
    return false;
  }

  return includesAny(normalized, LOGISTICS_SCHEDULE_CONFLICT_PATTERNS);
}

export function hasOperationalLogisticsFailureOrEscalationSignals(text: string): boolean {
  const normalized = normalizeWhitespace(text).toLowerCase();

  if (!normalized) {
    return false;
  }

  return includesAny(normalized, LOGISTICS_FAILURE_ESCALATION_PATTERNS) ||
    hasOperationalExceptionSignals(normalized);
}

export function hasMissedPickupSignals(text: string): boolean {
  const normalized = normalizeWhitespace(text).toLowerCase();

  if (!normalized) {
    return false;
  }

  return includesAny(normalized, MISSED_PICKUP_PATTERNS);
}

export function hasOperationalExceptionSignals(text: string): boolean {
  const normalized = normalizeWhitespace(text).toLowerCase();

  if (!normalized) {
    return false;
  }

  const hasTodayPickupException =
    /\b(?:today|tonight)\b/.test(normalized) &&
    /\b(?:pickup|pickups|picked up|carrier|driver)\b/.test(normalized) &&
    /\b(?:exception|exceptions|missed|failed|not completed|did not|didn't)\b/.test(normalized);

  return includesAny(normalized, OPERATIONAL_EXCEPTION_PATTERNS) ||
    hasTodayPickupException;
}

export function hasActualBillingQuestion(text: string): boolean {
  const normalized = normalizeWhitespace(text).toLowerCase();

  if (!normalized) {
    return false;
  }

  const hasBillingCore = includesAny(normalized, BILLING_CORE_PATTERNS);
  const hasBillingAsk = BILLING_ASK_REGEXES.some((pattern) => pattern.test(normalized));

  if (hasOperationalLogisticsSchedulingSignals(normalized)) {
    return hasBillingAsk && hasBillingCore;
  }

  return hasBillingCore || hasBillingAsk;
}

export function hasLogisticsCoordinationSignals(text: string): boolean {
  const normalized = normalizeWhitespace(text).toLowerCase();

  return (
    includesAny(normalized, LOGISTICS_COORDINATION_PATTERNS) ||
    hasOperationalLogisticsSchedulingSignals(normalized)
  );
}

export function hasOperationalTimingSignal(text: string): boolean {
  const normalized = normalizeWhitespace(text).toLowerCase();

  return (
    includesAny(normalized, OPERATIONAL_TIMING_PATTERNS) ||
    hasOperationalLogisticsSchedulingSignals(normalized)
  );
}

export function getLatestUrgencySignal(text: string): "none" | "medium" | "high" {
  const normalized = normalizeWhitespace(text).toLowerCase();

  if (!normalized) {
    return "none";
  }

  if (includesAny(normalized, HIGH_URGENCY_PATTERNS)) {
    return "high";
  }

  if (includesAny(normalized, MEDIUM_URGENCY_PATTERNS)) {
    return "medium";
  }

  return "none";
}

function getDaysBetweenUtc(start: Date, end: Date): number {
  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());

  return Math.floor((endDay - startDay) / 86400000);
}

function getUpcomingWeekdayFromReceivedDate(receivedAt: Date, weekday: number): Date {
  const currentWeekday = receivedAt.getUTCDay();
  const delta = (weekday - currentWeekday + 7) % 7;
  const dueDate = new Date(Date.UTC(
    receivedAt.getUTCFullYear(),
    receivedAt.getUTCMonth(),
    receivedAt.getUTCDate() + delta,
  ));

  return dueDate;
}

export function getDeadlineState(
  text: string,
  receivedAt: string,
  now: Date = new Date(),
): "none" | "current" | "past_due" {
  const normalized = normalizeWhitespace(text).toLowerCase();

  if (!hasShippingDeadlineRequest(normalized)) {
    return "none";
  }

  const receivedDate = new Date(receivedAt);

  if (Number.isNaN(receivedDate.getTime())) {
    return "current";
  }

  const elapsedDays = getDaysBetweenUtc(receivedDate, now);

  if (
    normalized.includes("today") ||
    normalized.includes("same day") ||
    normalized.includes("confirm today") ||
    normalized.includes("by end of day") ||
    normalized.includes(" eod")
  ) {
    return elapsedDays >= 1 ? "past_due" : "current";
  }

  if (
    normalized.includes("tomorrow") ||
    normalized.includes("overnight")
  ) {
    return elapsedDays >= 2 ? "past_due" : "current";
  }

  if (normalized.includes("friday")) {
    const fridayDate = getUpcomingWeekdayFromReceivedDate(receivedDate, 5);
    return now.getTime() > fridayDate.getTime() + 86400000 ? "past_due" : "current";
  }

  return elapsedDays >= 1 ? "past_due" : "current";
}
