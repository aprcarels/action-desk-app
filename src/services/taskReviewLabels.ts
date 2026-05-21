import type { AiEmailClassification, EmailAnalysis } from "../types/actionDesk";

export const OPERATIONAL_LOGISTICS_REVIEW_LABELS = [
  "Review pickup/scheduling details",
  "Reply only if schedule conflict or missing pickup details",
] as const;

export const OPERATIONAL_EXCEPTION_REVIEW_LABELS = [
  "Review missed pickup list",
  "Assign follow-up for affected shipments/customers",
] as const;

function isOperationalLogisticsIntent(intent?: EmailAnalysis["intent"]): boolean {
  return (
    intent === "operational_logistics_scheduling" ||
    intent === "routing_coordination" ||
    intent === "carrier_pickup_scheduling"
  );
}

function isOperationalExceptionIntent(intent?: EmailAnalysis["intent"]): boolean {
  return intent === "missed_pickups_report" || intent === "operational_exception";
}

export function getReviewTaskLabels(
  analysis?: Pick<EmailAnalysis, "intent">,
): string[] {
  if (isOperationalLogisticsIntent(analysis?.intent)) {
    return [...OPERATIONAL_LOGISTICS_REVIEW_LABELS];
  }

  if (isOperationalExceptionIntent(analysis?.intent)) {
    return [...OPERATIONAL_EXCEPTION_REVIEW_LABELS];
  }

  return [];
}

export function getAssistiveAiTaskSuggestion(
  aiClassification?: AiEmailClassification,
): string | undefined {
  const suggestion = aiClassification?.taskSuggestion?.trim();

  return suggestion || undefined;
}
