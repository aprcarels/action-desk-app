import type { CaseIdentifier, CaseIdentifierKind, EmailAnalysis } from "../types/actionDesk";

const ORDER_NUMBER_REGEX = /\bORD-\d+\b/gi;
const STOCK_TRANSFER_REGEX = /\b\d{4}-\d{6}\b/g;
const REWORK_REGEX = /\bR\d{4}-\d{2}[A-Z]{2}\b/gi;
const LABEL_REGEX =
  /\b(sales order|orders|order|stock transfer|transfer|rework|po|reference|ref|ticket)\s*(?:numbers?)?\s*(?:#|:)?\s*([A-Z0-9][A-Z0-9/-]*(?:\s*(?:\/|,|and)\s*[A-Z0-9][A-Z0-9/-]*)*)/gi;
const GENERIC_REFERENCE_REGEX = /\b(?:PO|REF|TICKET)[-:\s#]*([A-Z0-9-]{4,})\b/gi;
function normalizeIdentifierValue(value: string): string {
  return value
    .trim()
    .replace(/^[#:/\s-]+|[#:/,\s.]+$/g, "")
    .toUpperCase();
}

function isLikelyIdentifier(value: string): boolean {
  const normalized = normalizeIdentifierValue(value);

  if (!normalized || normalized.length < 4 || normalized.length > 24) {
    return false;
  }

  if (!/[0-9]/.test(normalized)) {
    return false;
  }

  if (/^(ORDER|ORDERS|TRACKING|STATUS|PLEASE|UPDATE|NUMBER|NUMBERS)$/i.test(normalized)) {
    return false;
  }

  if (/^\d{1,4}$/.test(normalized)) {
    return false;
  }

  return /^[A-Z0-9-]+$/.test(normalized);
}

function mapLabelToKind(label: string): CaseIdentifierKind {
  const normalized = label.toLowerCase();

  if (normalized.includes("stock transfer") || normalized === "transfer") {
    return "transfer";
  }

  if (normalized === "rework") {
    return "rework";
  }

  if (normalized === "po") {
    return "po";
  }

  if (normalized === "reference" || normalized === "ref") {
    return "reference";
  }

  if (normalized === "ticket") {
    return "ticket";
  }

  return "order";
}

function addIdentifier(
  identifiers: CaseIdentifier[],
  seen: Set<string>,
  identifier: CaseIdentifier,
): void {
  const dedupeKey = `${identifier.kind}:${identifier.value}`;

  if (seen.has(dedupeKey)) {
    return;
  }

  seen.add(dedupeKey);
  identifiers.push(identifier);
}

function extractLabeledIdentifiers(
  text: string,
  source: CaseIdentifier["source"],
  identifiers: CaseIdentifier[],
  seen: Set<string>,
): void {
  for (const match of text.matchAll(LABEL_REGEX)) {
    const kind = mapLabelToKind(match[1]);
    const rawValue = match[2];
    const candidates = rawValue.match(/\b[A-Z0-9-]{4,}\b/gi) ?? [rawValue];

    for (const candidate of candidates) {
      const value = normalizeIdentifierValue(candidate);

      if (!isLikelyIdentifier(value)) {
        continue;
      }

      addIdentifier(identifiers, seen, {
        value,
        kind,
        source,
      });
    }
  }
}

function extractPatternIdentifiers(
  text: string,
  source: CaseIdentifier["source"],
  identifiers: CaseIdentifier[],
  seen: Set<string>,
): void {
  for (const match of text.matchAll(ORDER_NUMBER_REGEX)) {
    addIdentifier(identifiers, seen, {
      value: normalizeIdentifierValue(match[0]),
      kind: "order",
      source,
    });
  }

  for (const match of text.matchAll(STOCK_TRANSFER_REGEX)) {
    addIdentifier(identifiers, seen, {
      value: normalizeIdentifierValue(match[0]),
      kind: "transfer",
      source,
    });
  }

  for (const match of text.matchAll(REWORK_REGEX)) {
    addIdentifier(identifiers, seen, {
      value: normalizeIdentifierValue(match[0]),
      kind: "rework",
      source,
    });
  }

  for (const match of text.matchAll(GENERIC_REFERENCE_REGEX)) {
    const kind = match[0].toUpperCase().startsWith("PO") ? "po" : match[0].toUpperCase().startsWith("REF") ? "reference" : "ticket";
    const value = normalizeIdentifierValue(match[1]);

    if (!isLikelyIdentifier(value)) {
      continue;
    }

    addIdentifier(identifiers, seen, {
      value,
      kind,
      source,
    });
  }
}

export function extractCaseIdentifiers(options: {
  subject?: string;
  latestMessageText?: string;
  bodyText?: string;
}): CaseIdentifier[] {
  const identifiers: CaseIdentifier[] = [];
  const seen = new Set<string>();
  const segments: Array<{ text: string | undefined; source: CaseIdentifier["source"] }> = [
    { text: options.subject, source: "subject" },
    { text: options.latestMessageText, source: "latest_message" },
    { text: options.bodyText, source: "body" },
  ];

  for (const segment of segments) {
    const text = segment.text?.trim();

    if (!text) {
      continue;
    }

    extractLabeledIdentifiers(text, segment.source, identifiers, seen);
    extractPatternIdentifiers(text, segment.source, identifiers, seen);
  }

  return identifiers;
}

export function getPrimaryOrderNumber(identifiers: CaseIdentifier[]): string | undefined {
  return identifiers.find((identifier) => identifier.kind === "order")?.value;
}

export function hasCaseIdentifiers(analysis: Pick<EmailAnalysis, "orderNumber" | "caseIdentifiers">): boolean {
  return Boolean(analysis.orderNumber) || Boolean(analysis.caseIdentifiers?.length);
}

function joinValues(values: string[]): string {
  if (values.length <= 1) {
    return values[0] ?? "";
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

export function getIdentifierReferenceLabel(analysis: Pick<EmailAnalysis, "orderNumber" | "caseIdentifiers">): string | undefined {
  const identifiers = analysis.caseIdentifiers ?? [];
  const orderValues = identifiers
    .filter((identifier) => identifier.kind === "order")
    .map((identifier) => identifier.value);

  if (analysis.orderNumber && !orderValues.includes(analysis.orderNumber)) {
    orderValues.unshift(analysis.orderNumber);
  }

  if (orderValues.length > 0) {
    return orderValues.length === 1
      ? `order ${orderValues[0]}`
      : `orders ${joinValues(Array.from(new Set(orderValues)))}`;
  }

  const primaryIdentifier = identifiers[0];

  if (!primaryIdentifier) {
    return undefined;
  }

  if (primaryIdentifier.kind === "transfer") {
    return `transfer ${primaryIdentifier.value}`;
  }

  if (primaryIdentifier.kind === "rework") {
    return `rework ${primaryIdentifier.value}`;
  }

  if (primaryIdentifier.kind === "po") {
    return `PO ${primaryIdentifier.value}`;
  }

  if (primaryIdentifier.kind === "reference") {
    return `reference ${primaryIdentifier.value}`;
  }

  if (primaryIdentifier.kind === "ticket") {
    return `ticket ${primaryIdentifier.value}`;
  }

  return primaryIdentifier.value;
}

export function getIdentifierReviewLabel(analysis: Pick<EmailAnalysis, "orderNumber" | "caseIdentifiers">): string {
  const identifiers = analysis.caseIdentifiers ?? [];
  const label = getIdentifierReferenceLabel(analysis);

  if (!label) {
    return "the referenced details";
  }

  if ((analysis.orderNumber || identifiers.some((identifier) => identifier.kind === "order")) && label.startsWith("order")) {
    return label;
  }

  if (identifiers.some((identifier) => identifier.kind === "transfer" || identifier.kind === "rework")) {
    return "the referenced transfer/rework details";
  }

  return label;
}
