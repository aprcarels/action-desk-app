import { getRiskLabel, RISK_LABELS } from "./analysisTaxonomy";
import { getPrimarySlaDisplayState, getSlaStateLabel } from "./sla";
import type {
  PriorityBreakdownItem,
  ProcessedEmail,
  RiskCode,
  WorkflowThread,
} from "../types/actionDesk";

type PriorityExplanationThread = Pick<WorkflowThread, "sla">;

type PriorityExplanationOptions = {
  item: ProcessedEmail;
  thread?: PriorityExplanationThread;
  maxReasons?: number;
};

const DEFAULT_MAX_REASONS = 5;

const BREAKDOWN_LABEL_COPY: Record<string, string> = {
  "Customer-support case": "Customer-support case.",
  "High urgency": "High urgency.",
  "Medium urgency": "Medium urgency.",
  "Action required": "Action required.",
  "Review needed": "Review needed.",
  "Customer reply needed": "Customer reply needed.",
  "Explicit current request": "Explicit current request.",
  "Deadline-driven shipping request": "Deadline-driven shipping request.",
  "Operational confirmation request": "Operational confirmation request.",
  "Current logistics confirmation ask": "Current logistics confirmation ask.",
  "Time-bound confirmation request": "Time-bound confirmation request.",
  "Requested timing may already be past due": "Requested timing may already be past due.",
  "Customer-impacting issue type": "Customer-impacting issue type.",
  "Order number present but order context unavailable":
    "Order number present but order context is unavailable.",
  "Delayed or exception shipment status": "Delayed or exception shipment status.",
  "Delivered order reported as not received": "Delivered order reported as not received.",
  "Missing or delayed order updates": "Missing or delayed order updates.",
};

function isRiskCode(value: string): value is RiskCode {
  return value in RISK_LABELS;
}

function normalizeReasonKey(reason: string): string {
  return reason.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function addReason(reasons: string[], seen: Set<string>, reason: string | undefined) {
  const trimmed = reason?.trim();

  if (!trimmed) {
    return;
  }

  const key = normalizeReasonKey(trimmed);

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  reasons.push(trimmed);
}

function asSentence(label: string): string {
  const trimmed = label.trim();

  if (!trimmed) {
    return "";
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function formatBreakdownReason(breakdownItem: PriorityBreakdownItem): string {
  const riskCode = breakdownItem.label.startsWith("Risk: ")
    ? breakdownItem.label.slice("Risk: ".length)
    : "";

  if (riskCode && isRiskCode(riskCode)) {
    return getRiskLabel(riskCode);
  }

  return BREAKDOWN_LABEL_COPY[breakdownItem.label] ?? asSentence(breakdownItem.label);
}

function getSlaReason(thread?: PriorityExplanationThread): string | undefined {
  if (!thread) {
    return undefined;
  }

  const state = getPrimarySlaDisplayState(thread.sla.current.state);

  if (state === "on_track") {
    return undefined;
  }

  const targetLabel =
    thread.sla.current.target === "first_response" ? "First reply" : "Resolution";

  return `${targetLabel} SLA ${getSlaStateLabel(state).toLowerCase()}.`;
}

function addFallbackAnalysisReasons(
  item: ProcessedEmail,
  reasons: string[],
  seen: Set<string>,
) {
  const analysis = item.result?.analysis;

  if (!analysis) {
    return;
  }

  if (analysis.isThreadContinuation && (analysis.hasClearRequest || analysis.replyNeeded === "yes")) {
    addReason(reasons, seen, "Thread follow-up with a clear current request.");
  }

  if (analysis.urgency === "high") {
    addReason(reasons, seen, "High urgency.");
  } else if (analysis.urgency === "medium") {
    addReason(reasons, seen, "Medium urgency.");
  }

  if (analysis.replyNeeded === "yes") {
    addReason(reasons, seen, "Customer reply needed.");
  }

  if (analysis.hasDeadlineRequest) {
    addReason(reasons, seen, "Deadline-driven shipping request.");
  }

  if (analysis.deadlineState === "past_due") {
    addReason(reasons, seen, "Requested timing may already be past due.");
  }

  if (analysis.hasConfirmationRequest && analysis.hasLogisticsContext) {
    addReason(reasons, seen, "Current logistics confirmation ask.");
  }

  if (analysis.hasOperationalTimingSignal && analysis.hasConfirmationRequest) {
    addReason(reasons, seen, "Time-bound confirmation request.");
  }

  analysis.risks.forEach((risk) => {
    addReason(reasons, seen, getRiskLabel(risk));
  });
}

export function getPriorityExplanationReasons({
  item,
  thread,
  maxReasons = DEFAULT_MAX_REASONS,
}: PriorityExplanationOptions): string[] {
  const reasons: string[] = [];
  const seen = new Set<string>();

  addReason(reasons, seen, getSlaReason(thread));

  if (item.isCustomerPriority && item.customerMatch) {
    addReason(reasons, seen, `Priority customer: ${item.customerMatch.customerName}.`);
  }

  const positiveBreakdown = [...(item.result?.priorityBreakdown ?? [])]
    .filter((breakdownItem) => breakdownItem.points > 0)
    .sort((left, right) => right.points - left.points);

  positiveBreakdown.forEach((breakdownItem) => {
    addReason(reasons, seen, formatBreakdownReason(breakdownItem));
  });

  addFallbackAnalysisReasons(item, reasons, seen);

  return reasons.slice(0, maxReasons);
}

export function getPriorityExplanationSummary(options: PriorityExplanationOptions): string {
  return getPriorityExplanationReasons(options).join(" ");
}
