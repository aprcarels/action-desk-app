import type {
  AiClassification,
  ClassificationCategory,
  ClassificationSeverity,
  ClassificationSuggestedAction,
  ClassificationValidationStatus,
} from "../repositories/mariadb/schemaTypes";

const CATEGORIES = [
  "billing",
  "technical",
  "complaint",
  "internal_request",
  "management_task",
  "inquiry",
  "escalation",
  "other",
] as const;

const SEVERITIES = ["low", "medium", "high", "critical"] as const;

const SUGGESTED_ACTIONS = [
  "assign_csr",
  "escalate",
  "create_task",
  "route_to_department",
  "hold_for_review",
] as const;

export const AI_CLASSIFICATION_FALLBACK: AiClassification = {
  category: "other",
  urgency: "medium",
  importance: "medium",
  suggestedAction: "hold_for_review",
  requiresResponse: true,
  estimatedDueDate: null,
  summary: "Auto-classified due to AI failure.",
  confidence: 0,
};

export type AiClassificationValidationResult = {
  classification: AiClassification;
  validationStatus: ClassificationValidationStatus;
  usedFallback: boolean;
  validationErrors: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOneOf<T extends readonly string[]>(
  value: unknown,
  allowedValues: T,
): value is T[number] {
  return (
    typeof value === "string" &&
    (allowedValues as readonly string[]).includes(value)
  );
}

function isIsoDateTimeOrNull(value: unknown): value is string | null {
  if (value === null) {
    return true;
  }

  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && value.includes("T");
}

function fallbackResult(
  validationStatus: ClassificationValidationStatus,
  validationErrors: string[],
): AiClassificationValidationResult {
  return {
    classification: AI_CLASSIFICATION_FALLBACK,
    validationStatus,
    usedFallback: true,
    validationErrors,
  };
}

export function validateAiClassificationResponse(
  rawResponse: string | null | undefined,
): AiClassificationValidationResult {
  const raw = rawResponse?.trim();

  if (!raw) {
    return fallbackResult("llm_unavailable", ["LLM response was empty."]);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallbackResult("invalid_json", ["LLM response was not valid JSON."]);
  }

  if (!isRecord(parsed)) {
    return fallbackResult("invalid_schema", ["LLM response must be a JSON object."]);
  }

  const errors: string[] = [];

  if (!isOneOf(parsed.category, CATEGORIES)) {
    errors.push("category is invalid.");
  }

  if (!isOneOf(parsed.urgency, SEVERITIES)) {
    errors.push("urgency is invalid.");
  }

  if (!isOneOf(parsed.importance, SEVERITIES)) {
    errors.push("importance is invalid.");
  }

  if (!isOneOf(parsed.suggestedAction, SUGGESTED_ACTIONS)) {
    errors.push("suggestedAction is invalid.");
  }

  if (typeof parsed.requiresResponse !== "boolean") {
    errors.push("requiresResponse must be boolean.");
  }

  if (!isIsoDateTimeOrNull(parsed.estimatedDueDate)) {
    errors.push("estimatedDueDate must be an ISO datetime string or null.");
  }

  if (typeof parsed.summary !== "string" || !parsed.summary.trim()) {
    errors.push("summary must be a non-empty string.");
  }

  if (
    typeof parsed.confidence !== "number" ||
    Number.isNaN(parsed.confidence) ||
    parsed.confidence < 0 ||
    parsed.confidence > 1
  ) {
    errors.push("confidence must be a number from 0 to 1.");
  }

  if (errors.length > 0) {
    return fallbackResult("invalid_schema", errors);
  }

  return {
    classification: {
      category: parsed.category as ClassificationCategory,
      urgency: parsed.urgency as ClassificationSeverity,
      importance: parsed.importance as ClassificationSeverity,
      suggestedAction: parsed.suggestedAction as ClassificationSuggestedAction,
      requiresResponse: parsed.requiresResponse as boolean,
      estimatedDueDate: parsed.estimatedDueDate as string | null,
      summary: (parsed.summary as string).trim(),
      confidence: parsed.confidence as number,
    },
    validationStatus: "valid",
    usedFallback: false,
    validationErrors: [],
  };
}

export function buildStrictClassificationInstruction(): string {
  return [
    "Return JSON only.",
    "Required fields: category, urgency, importance, suggestedAction, requiresResponse, estimatedDueDate, summary, confidence.",
    `category must be one of: ${CATEGORIES.join(", ")}.`,
    `urgency and importance must be one of: ${SEVERITIES.join(", ")}.`,
    `suggestedAction must be one of: ${SUGGESTED_ACTIONS.join(", ")}.`,
    "estimatedDueDate must be an ISO datetime string or null.",
    "summary must be one sentence.",
    "confidence must be a number from 0 to 1.",
  ].join(" ");
}
