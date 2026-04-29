import type {
  SlaSettings,
  SlaState,
  WorkflowThread,
  WorkflowThreadSlaStatus,
} from "../types/actionDesk";
import type { CSSProperties } from "react";
import { normalizeLocationId } from "./locations";

export const DEFAULT_SLA_SETTINGS: SlaSettings = {
  firstResponseSlaMinutes: 60,
  resolutionSlaMinutes: 24 * 60,
  warningThresholdPercent: 75,
  warningMinutesBeforeBreach: 15,
};

export function getDefaultSlaSettings(): SlaSettings {
  return { ...DEFAULT_SLA_SETTINGS };
}

export function normalizeSlaSettings(value: unknown): SlaSettings {
  if (!value || typeof value !== "object") {
    return getDefaultSlaSettings();
  }

  const input = value as Partial<SlaSettings>;
  const firstResponseSlaMinutes = normalizePositiveInteger(
    input.firstResponseSlaMinutes,
    DEFAULT_SLA_SETTINGS.firstResponseSlaMinutes,
  );
  const resolutionSlaMinutes = normalizePositiveInteger(
    input.resolutionSlaMinutes,
    DEFAULT_SLA_SETTINGS.resolutionSlaMinutes,
  );
  const warningThresholdPercent = normalizeClampedInteger(
    input.warningThresholdPercent,
    DEFAULT_SLA_SETTINGS.warningThresholdPercent,
    1,
    99,
  );
  const warningMinutesBeforeBreach = normalizeClampedInteger(
    input.warningMinutesBeforeBreach,
    DEFAULT_SLA_SETTINGS.warningMinutesBeforeBreach,
    1,
    Math.max(firstResponseSlaMinutes, resolutionSlaMinutes),
  );

  return {
    firstResponseSlaMinutes,
    resolutionSlaMinutes,
    warningThresholdPercent,
    warningMinutesBeforeBreach,
    locationId: normalizeLocationId(input.locationId),
    updatedAt: normalizeOptionalText(input.updatedAt),
    updatedByRepId: normalizeOptionalText(input.updatedByRepId),
    updatedByRepName: normalizeOptionalText(input.updatedByRepName),
  };
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function normalizeClampedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, parsed));
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function getElapsedMinutes(isoValue: string, now = new Date()): number {
  const timestamp = Date.parse(isoValue);

  if (Number.isNaN(timestamp)) {
    return 0;
  }

  return Math.max(0, Math.floor((now.getTime() - timestamp) / 60_000));
}

export function formatElapsedTime(isoValue: string, now = new Date()): string {
  const totalMinutes = getElapsedMinutes(isoValue, now);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h ago`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m ago`;
  }

  return `${minutes}m ago`;
}

export function formatMinutesAsDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) {
    return "0m";
  }

  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return `${minutes}m`;
}

export function getSlaStateLabel(state: SlaState): string {
  switch (state) {
    case "breached":
      return "Breached";
    case "at_risk":
      return "At Risk";
    case "met":
      return "Met";
    case "on_track":
    default:
      return "On Track";
  }
}

export function getSlaStateStyle(state: SlaState): CSSProperties {
  switch (state) {
    case "breached":
      return {
        color: "#991b1b",
        backgroundColor: "#fee2e2",
      };
    case "at_risk":
      return {
        color: "#92400e",
        backgroundColor: "#fef3c7",
      };
    case "met":
      return {
        color: "#1d4ed8",
        backgroundColor: "#dbeafe",
      };
    case "on_track":
    default:
      return {
        color: "#166534",
        backgroundColor: "#dcfce7",
      };
  }
}

export function getPrimarySlaDisplayState(state: SlaState): "on_track" | "at_risk" | "breached" {
  return state === "breached" || state === "at_risk" ? state : "on_track";
}

export function buildThreadSla(options: {
  receivedAt: string;
  firstReplyAt?: string;
  resolvedAt?: string;
  now?: Date;
  settings: SlaSettings;
}): WorkflowThread["sla"] {
  const {
    receivedAt,
    firstReplyAt,
    resolvedAt,
    now = new Date(),
    settings,
  } = options;

  const firstResponse = buildSlaStatus({
    target: "first_response",
    receivedAt,
    completedAt: firstReplyAt,
    targetMinutes: settings.firstResponseSlaMinutes,
    warningThresholdPercent: settings.warningThresholdPercent,
    warningMinutesBeforeBreach: settings.warningMinutesBeforeBreach,
    now,
  });
  const resolution = buildSlaStatus({
    target: "resolution",
    receivedAt,
    completedAt: resolvedAt,
    targetMinutes: settings.resolutionSlaMinutes,
    warningThresholdPercent: settings.warningThresholdPercent,
    warningMinutesBeforeBreach: settings.warningMinutesBeforeBreach,
    now,
  });

  return {
    firstResponse,
    resolution,
    current:
      !firstReplyAt
        ? firstResponse
        : !resolvedAt
          ? resolution
          : resolution,
  };
}

function buildSlaStatus(options: {
  target: WorkflowThreadSlaStatus["target"];
  receivedAt: string;
  completedAt?: string;
  targetMinutes: number;
  warningThresholdPercent: number;
  warningMinutesBeforeBreach: number;
  now: Date;
}): WorkflowThreadSlaStatus {
  const startTimestamp = Date.parse(options.receivedAt);
  const completedTimestamp = options.completedAt ? Date.parse(options.completedAt) : NaN;
  const effectiveEndTimestamp = Number.isNaN(completedTimestamp)
    ? options.now.getTime()
    : completedTimestamp;
  const elapsedMinutes = Number.isNaN(startTimestamp)
    ? 0
    : Math.max(0, Math.floor((effectiveEndTimestamp - startTimestamp) / 60_000));
  const dueAt = Number.isNaN(startTimestamp)
    ? options.receivedAt
    : new Date(startTimestamp + options.targetMinutes * 60_000).toISOString();
  const percentThresholdMinutes = Math.floor(
    options.targetMinutes * (options.warningThresholdPercent / 100),
  );
  const minutesBeforeBreachThreshold = Math.max(
    0,
    options.targetMinutes - options.warningMinutesBeforeBreach,
  );
  const warningStartsAtMinutes = Math.min(
    percentThresholdMinutes,
    minutesBeforeBreachThreshold,
  );

  return {
    target: options.target,
    state: resolveSlaState(
      elapsedMinutes,
      options.targetMinutes,
      warningStartsAtMinutes,
      options.completedAt,
    ),
    elapsedMinutes,
    targetMinutes: options.targetMinutes,
    warningStartsAtMinutes,
    dueAt,
    completedAt: options.completedAt,
  };
}

function resolveSlaState(
  elapsedMinutes: number,
  targetMinutes: number,
  warningStartsAtMinutes: number,
  completedAt?: string,
): SlaState {
  if (elapsedMinutes >= targetMinutes) {
    return "breached";
  }

  if (completedAt) {
    return "met";
  }

  if (elapsedMinutes >= warningStartsAtMinutes) {
    return "at_risk";
  }

  return "on_track";
}

export function getThreadPrimarySlaStatus(thread: Pick<WorkflowThread, "sla">): WorkflowThreadSlaStatus {
  return thread.sla.current;
}

export function isThreadSlaBreached(thread: Pick<WorkflowThread, "sla">): boolean {
  return getPrimarySlaDisplayState(thread.sla.current.state) === "breached";
}

export function isThreadSlaAtRisk(thread: Pick<WorkflowThread, "sla">): boolean {
  return getPrimarySlaDisplayState(thread.sla.current.state) === "at_risk";
}
