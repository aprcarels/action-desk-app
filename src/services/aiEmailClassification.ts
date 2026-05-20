import type { AiEmailClassification } from "../types/actionDesk";

export type AiClassifyEmailRequest = {
  subject: string;
  from: string;
  body: string;
};

const AI_CLASSIFICATION_CATEGORIES = [
  "customer support request",
  "order/shipment issue",
  "billing/refund",
  "vendor sales outreach",
  "internal operational update",
  "operational report",
  "internal communication",
  "spam/phishing",
  "no action needed",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAiClassificationCategory(
  value: unknown,
): value is AiEmailClassification["category"] {
  return (
    typeof value === "string" &&
    (AI_CLASSIFICATION_CATEGORIES as readonly string[]).includes(value)
  );
}

function normalizeAiClassificationCategory(
  value: unknown,
): AiEmailClassification["category"] | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, " ");

  return isAiClassificationCategory(normalized) ? normalized : null;
}

function isAiClassificationUrgency(
  value: unknown,
): value is AiEmailClassification["urgency"] {
  return value === "low" || value === "medium" || value === "high";
}

export function isAiEmailClassification(
  value: unknown,
): value is AiEmailClassification {
  return (
    isRecord(value) &&
    isAiClassificationCategory(value.category) &&
    typeof value.actionable === "boolean" &&
    isAiClassificationUrgency(value.urgency) &&
    typeof value.summary === "string" &&
    value.summary.trim().length > 0 &&
    typeof value.confidence === "number" &&
    Number.isFinite(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 1 &&
    value.aiSource === "ollama"
  );
}

export function normalizeAiEmailClassification(
  value: unknown,
): AiEmailClassification | null {
  if (!isRecord(value)) {
    return null;
  }

  const category = normalizeAiClassificationCategory(value.category);

  if (
    !category ||
    typeof value.actionable !== "boolean" ||
    !isAiClassificationUrgency(value.urgency) ||
    typeof value.summary !== "string" ||
    value.summary.trim().length === 0 ||
    typeof value.confidence !== "number" ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1 ||
    value.aiSource !== "ollama"
  ) {
    return null;
  }

  return {
    category,
    actionable: value.actionable,
    urgency: value.urgency,
    summary: value.summary.trim(),
    confidence: value.confidence,
    aiSource: "ollama",
  };
}

export function formatAiConfidence(confidence: number): string {
  if (!Number.isFinite(confidence)) {
    return "0%";
  }

  return `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`;
}
