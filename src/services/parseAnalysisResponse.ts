import type { EmailAnalysis } from "../types/actionDesk";
import { normalizeIntent, normalizeRisks } from "./analysisTaxonomy";

export function parseAnalysisResponse(raw: string): EmailAnalysis | null {
  try {
    const parsed: unknown = JSON.parse(raw);

    if (!isParsedEmailAnalysis(parsed)) {
      return null;
    }

    return {
      summary: parsed.summary,
      intent: normalizeIntent(parsed.intent),
      urgency: parsed.urgency,
      confidence: parsed.confidence,
      orderNumber: parsed.orderNumber ?? undefined,
      risks: normalizeRisks(parsed.risks),
      nextAction: parsed.nextAction,
    };
  } catch {
    return null;
  }
}

type ParsedEmailAnalysis = {
  summary: string;
  intent: string;
  urgency: EmailAnalysis["urgency"];
  confidence: EmailAnalysis["confidence"];
  orderNumber?: string | null;
  risks: string[];
  nextAction: string;
};

function isParsedEmailAnalysis(value: unknown): value is ParsedEmailAnalysis {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.summary !== "string") {
    return false;
  }

  if (typeof value.intent !== "string") {
    return false;
  }

  if (!isUrgency(value.urgency)) {
    return false;
  }

  if (!isConfidence(value.confidence)) {
    return false;
  }

  if (!Array.isArray(value.risks) || !value.risks.every((risk) => typeof risk === "string")) {
    return false;
  }

  if (typeof value.nextAction !== "string") {
    return false;
  }

  if (value.orderNumber !== undefined && typeof value.orderNumber !== "string") {
    return false;
  }

  return true;
}

function isUrgency(value: unknown): value is EmailAnalysis["urgency"] {
  return value === "low" || value === "medium" || value === "high";
}

function isConfidence(value: unknown): value is EmailAnalysis["confidence"] {
  return value === "low" || value === "medium" || value === "high";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
