import type { AnalysisSource, ReplyDraftSource } from "../types/actionDesk";

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
type DraftSourceValue = AnalysisSource | ReplyDraftSource | null | undefined;

export function getAnalysisSourceDisclosure(
  source: SourceValue,
): SourceDisclosure {
  switch (source) {
    case "ai":
      return {
        kind: "ai_assisted",
        label: "AI Assisted",
        detail:
          "Analysis used an LLM-backed assistive layer; Action Desk rules remain authoritative.",
      };
    case "hybrid":
      return {
        kind: "ai_assisted",
        label: "AI Assisted",
        detail:
          "Analysis includes assistive AI classification, while Action Desk rules remain authoritative.",
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

export function getDraftSourceDisclosure(source: DraftSourceValue): SourceDisclosure {
  switch (source) {
    case "ai":
      return {
        kind: "ai_assisted",
        label: "AI Assisted",
        detail:
          "Draft was produced by the assistive AI reply drafting layer; Action Desk rules remain authoritative.",
      };
    case "rules":
      return {
        kind: "rules_based",
        label: "Rules-Based",
        detail:
          "Draft was produced by deterministic reply templates and available order context.",
      };
    case "hybrid":
      return {
        kind: "rules_based",
        label: "Rules-Based",
        detail:
          "Draft was produced by deterministic reply templates; AI classification is assistive context only.",
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
