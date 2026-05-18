import type { AnalysisSource } from "../types/actionDesk";

export type SourceDisclosureKind =
  | "rules_based"
  | "ai_assisted"
  | "unknown";

export type SourceDisclosure = {
  kind: SourceDisclosureKind;
  label: "Rules-Based" | "AI Assisted" | "Source Unknown";
  detail: string;
};

type SourceValue = AnalysisSource | null | undefined;

export function getAnalysisSourceDisclosure(
  source: SourceValue,
): SourceDisclosure {
  switch (source) {
    case "ai":
      return {
        kind: "ai_assisted",
        label: "AI Assisted",
        detail: "Analysis used an LLM-backed path with Action Desk rules and checks.",
      };
    case "hybrid":
      return {
        kind: "ai_assisted",
        label: "AI Assisted",
        detail: "Analysis combined LLM-backed classification with Action Desk rules.",
      };
    case "fallback":
    case "heuristic":
      return {
        kind: "rules_based",
        label: "Rules-Based",
        detail: "Analysis was produced by Action Desk heuristics and triage rules.",
      };
    default:
      return {
        kind: "unknown",
        label: "Source Unknown",
        detail: "Analysis source was not stored for this result.",
      };
  }
}

export function getDraftSourceDisclosure(source: SourceValue): SourceDisclosure {
  switch (source) {
    case "ai":
    case "hybrid":
      return {
        kind: "ai_assisted",
        label: "AI Assisted",
        detail:
          "Draft uses Action Desk reply templates with AI-assisted triage context.",
      };
    case "fallback":
    case "heuristic":
      return {
        kind: "rules_based",
        label: "Rules-Based",
        detail:
          "Draft was produced by deterministic reply templates and available order context.",
      };
    default:
      return {
        kind: "unknown",
        label: "Source Unknown",
        detail: "Draft source was not stored for this result.",
      };
  }
}
