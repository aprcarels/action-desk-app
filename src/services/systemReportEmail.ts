import { isLowValueSystemReportEmail } from "./customerServiceMail";
import type { EmailItem, ProcessedEmail } from "../types/actionDesk";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasTrueFlag(value: unknown, key: string): boolean {
  return isRecord(value) && value[key] === true;
}

function getStringField(value: unknown, key: string): string {
  if (!isRecord(value)) {
    return "";
  }

  const candidate = value[key];
  return typeof candidate === "string" ? candidate.trim().toLowerCase() : "";
}

export function isSystemReportEmail(email: EmailItem): boolean {
  return (
    hasTrueFlag(email, "systemReportEmail") ||
    isLowValueSystemReportEmail(email)
  );
}

export function isSystemReportEmailItem(item: ProcessedEmail): boolean {
  const analysis = item.result?.analysis;
  const classification = getStringField(analysis, "classification");

  return (
    hasTrueFlag(item, "systemReportEmail") ||
    hasTrueFlag(item.email, "systemReportEmail") ||
    hasTrueFlag(analysis, "systemReportEmail") ||
    analysis?.workType === "system" ||
    classification === "system" ||
    isSystemReportEmail(item.email)
  );
}

export function isMissingBodyFailure(item: ProcessedEmail): boolean {
  if (item.status !== "failed") {
    return false;
  }

  const processingError = item.processingError?.trim().toLowerCase() ?? "";

  return (
    processingError.includes("missing_body") ||
    processingError.includes("missing body") ||
    processingError.includes("body is missing")
  );
}

export function isSuppressibleSystemReportMissingBodyFailure(
  item: ProcessedEmail,
): boolean {
  return isMissingBodyFailure(item) && isSystemReportEmailItem(item);
}
