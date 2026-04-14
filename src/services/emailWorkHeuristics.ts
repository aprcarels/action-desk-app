const CLEAR_REQUEST_PATTERNS = [
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
];

function normalizeWhitespace(value: string): string {
  return value.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
}

export function includesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
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

  return includesAny(normalized, CLEAR_REQUEST_PATTERNS);
}

export function isLikelyThreadContinuation(latestMessageText: string, fullEmailText: string): boolean {
  const normalizedLatest = normalizeWhitespace(latestMessageText).toLowerCase();
  const normalizedFull = normalizeWhitespace(fullEmailText).toLowerCase();

  if (!normalizedLatest) {
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
  return includesAny(normalizeWhitespace(text).toLowerCase(), INTERNAL_OPERATION_PATTERNS);
}

export function hasShippingDeadlineRequest(text: string): boolean {
  return includesAny(normalizeWhitespace(text).toLowerCase(), SHIPPING_DEADLINE_PATTERNS);
}

export function hasConfirmationRequest(text: string): boolean {
  return includesAny(normalizeWhitespace(text).toLowerCase(), CONFIRMATION_REQUEST_PATTERNS);
}

export function hasLogisticsCoordinationSignals(text: string): boolean {
  return includesAny(normalizeWhitespace(text).toLowerCase(), LOGISTICS_COORDINATION_PATTERNS);
}

export function hasOperationalTimingSignal(text: string): boolean {
  return includesAny(normalizeWhitespace(text).toLowerCase(), OPERATIONAL_TIMING_PATTERNS);
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
