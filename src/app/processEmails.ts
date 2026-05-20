import { runActionDesk } from "./runActionDesk";
import {
  isLowValueSystemReportEmail,
  normalizeProcessedEmailResult,
  shouldShowInCustomerServiceQueue,
} from "../services/customerServiceMail";
import { applyCustomerPriorityToEmails } from "../services/customerMatching";
import { buildAnalysisInput } from "../services/analysisInput";
import { isSuppressibleSystemReportMissingBodyFailure } from "../services/systemReportEmail";
import type {
  ActionDeskResult,
  EmailItem,
  IntentCode,
  ProcessedEmail,
  SavedCustomer,
} from "../types/actionDesk";

export type CustomerPriorityFilter = "all" | "matched_only";

export const DEFAULT_EMAIL_PROCESSING_CONCURRENCY = 4;

export type QueueFilters = {
  searchQuery: string;
  urgency: "all" | "high" | "medium" | "low";
  intent: IntentCode | "all";
  customerPriority: CustomerPriorityFilter;
  queueView?: "customer_service" | "all_inbox";
};

type ProcessEmailsProgressivelyOptions = {
  customers?: SavedCustomer[];
  concurrency?: number;
  onItemProcessed?: (item: ProcessedEmail) => void;
};

type MissingBodyReason =
  | "graphBodyMissing"
  | "htmlBodyEmptyAfterStrip"
  | "attachmentOnlyMessage"
  | "systemReportEmail";

export type ProcessEmailsProgressivelyResult = {
  processedItems: ProcessedEmail[];
  processedCount: number;
  failedCount: number;
};

function safeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function trimmedText(value: unknown): string {
  return safeText(value).trim();
}

function safeLower(value: unknown): string {
  return safeText(value).toLowerCase();
}

function buildMissingBodyFallback(email: EmailItem): string {
  return [
    trimmedText(email.subject) ? `Subject: ${trimmedText(email.subject)}` : "",
    trimmedText(email.senderName) ? `Sender: ${trimmedText(email.senderName)}` : "",
    trimmedText(email.senderEmail)
      ? `Sender email: ${trimmedText(email.senderEmail)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function getMissingBodyReason(email: EmailItem): MissingBodyReason {
  if (isLowValueSystemReportEmail(email)) {
    return "systemReportEmail";
  }

  if (email.hasAttachments === true) {
    return "attachmentOnlyMessage";
  }

  return "graphBodyMissing";
}

function logMissingBodyFallback(input: {
  email: EmailItem;
  reason: MissingBodyReason;
  fallbackBody: string;
}) {
  console.info("[Action Desk diagnostics] missing body fallback", {
    reason: input.reason,
    emailId: input.email.id,
    subject: input.email.subject,
    senderEmail: input.email.senderEmail,
    source: input.email.source,
    provider: input.email.provider,
    hasAttachments: input.email.hasAttachments === true,
    fallbackTextLength: input.fallbackBody.length,
  });
}

function normalizeEmailForProcessing(email: EmailItem): EmailItem {
  const senderName =
    trimmedText(email.senderName) ||
    trimmedText(email.senderEmail) ||
    "Unknown sender";
  const senderEmail = trimmedText(email.senderEmail);
  const subject = trimmedText(email.subject) || "(no subject)";
  const body = trimmedText(email.body) || trimmedText(email.previewText);
  const fallbackBody = body || buildMissingBodyFallback({
    ...email,
    senderName,
    senderEmail,
    subject,
  });
  const previewText =
    trimmedText(email.previewText) ||
    body ||
    trimmedText(email.subject) ||
    fallbackBody;

  if (!body && fallbackBody) {
    logMissingBodyFallback({
      email: {
        ...email,
        senderName,
        senderEmail,
        subject,
      },
      reason: getMissingBodyReason({
        ...email,
        senderName,
        senderEmail,
        subject,
        body: fallbackBody,
        previewText,
      }),
      fallbackBody,
    });
  }

  return {
    ...email,
    id: trimmedText(email.id),
    senderName,
    senderEmail,
    subject,
    receivedAt: trimmedText(email.receivedAt) || new Date().toISOString(),
    body: fallbackBody,
    previewText,
  };
}

function assertEmailCanBeAnalyzed(email: EmailItem) {
  if (!safeText(email.senderEmail) && !safeText(email.senderName)) {
    throw new Error("Missing sender.");
  }

  if (!safeText(email.body) && !safeText(email.previewText)) {
    throw new Error("Missing body.");
  }
}

export function buildPreviewText(
  result: ActionDeskResult,
  email: EmailItem,
): string {
  const summary = result.analysis.summary.trim();

  if (summary.length > 0) {
    return summary;
  }

  return (
    email.previewText?.trim() ||
    safeText((email as any).body).replace(/\s+/g, " ").trim()
  );
}

function getAnalysisInput(email: EmailItem): string {
  return buildAnalysisInput({
    subject: safeText(email.subject) || "(no subject)",
    body: safeText(email.body) || safeText(email.previewText),
  });
}

function normalizeProcessingConcurrency(concurrency?: number): number {
  if (typeof concurrency !== "number" || !Number.isFinite(concurrency)) {
    return DEFAULT_EMAIL_PROCESSING_CONCURRENCY;
  }

  return Math.max(1, Math.floor(concurrency));
}

async function runWithConcurrency<T>(
  itemCount: number,
  concurrency: number | undefined,
  runJob: (index: number) => Promise<T>,
): Promise<T[]> {
  const results = new Array<T>(itemCount);
  const workerCount = Math.min(
    normalizeProcessingConcurrency(concurrency),
    itemCount,
  );
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < itemCount) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await runJob(index);
    }
  }

  await Promise.all(
    Array.from({ length: workerCount }, () => runWorker()),
  );

  return results;
}

export function createProcessedEmail(
  email: EmailItem,
  result: ActionDeskResult,
): ProcessedEmail {
  const normalizedResult = normalizeProcessedEmailResult(email, result);

  return {
    email,
    status: "processed",
    result: normalizedResult,
    issueCount: normalizedResult.analysis.risks.length,
    previewText: buildPreviewText(normalizedResult, email),
  };
}

export function createFailedProcessedEmail(
  email: EmailItem,
  processingError = "This email could not be processed.",
): ProcessedEmail {
  return {
    email,
    status: "failed",
    processingError,
    issueCount: 0,
    previewText:
      email.previewText?.trim() ||
      safeText((email as any).body).replace(/\s+/g, " ").trim(),
  };
}

export function createPendingProcessedEmail(email: EmailItem): ProcessedEmail {
  return {
    email,
    status: "pending",
    issueCount: 0,
    previewText:
      email.previewText?.trim() ||
      safeText((email as any).body).replace(/\s+/g, " ").trim(),
  };
}

function getProcessingErrorMessage(reason?: string): string {
  if (reason === "missing_sender") {
    return "This email could not be analyzed because the sender is missing.";
  }

  if (reason === "missing_body") {
    return "This email could not be analyzed because the body is missing.";
  }

  return "This email could not be analyzed. Try retrying it.";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getEmailProcessingFailureReason(
  email: EmailItem,
  error: unknown,
): "missing_sender" | "missing_body" | "analyzer_exception" {
  if (!safeText(email.senderEmail) && !safeText(email.senderName)) {
    return "missing_sender";
  }

  if (!safeText(email.body) && !safeText(email.previewText)) {
    return "missing_body";
  }

  const message = getErrorMessage(error).toLowerCase();

  if (message.includes("sender")) {
    return "missing_sender";
  }

  if (message.includes("body")) {
    return "missing_body";
  }

  return "analyzer_exception";
}

function logEmailProcessingFailure(input: {
  email: EmailItem;
  reason:
    | "missing_sender"
    | "missing_body"
    | "customer_match_failed"
    | "assignment_lookup_failed"
    | "analyzer_exception"
    | "ui_callback_failed";
  error: unknown;
}) {
  console.error("EMAIL PROCESSING FAILED", {
    emailId: input.email.id,
    subject: input.email.subject,
    senderName: input.email.senderName,
    senderEmail: input.email.senderEmail,
    receivedAt: input.email.receivedAt,
    failureReason: input.reason,
    errorName: input.error instanceof Error ? input.error.name : typeof input.error,
    errorMessage: getErrorMessage(input.error),
    errorStack: input.error instanceof Error ? input.error.stack : undefined,
  });
}

function applyBackendCustomerContext(
  item: ProcessedEmail,
  customers?: SavedCustomer[],
): ProcessedEmail {
  const backendCustomers = Array.isArray(customers) ? customers : [];

  if (backendCustomers.length === 0) {
    return item;
  }

  try {
    return applyCustomerPriority([item], backendCustomers)[0] ?? item;
  } catch (error) {
    logEmailProcessingFailure({
      email: item.email,
      reason: "customer_match_failed",
      error,
    });
    return item;
  }
}

function notifyItemProcessed(
  item: ProcessedEmail,
  options?: ProcessEmailsProgressivelyOptions,
) {
  try {
    options?.onItemProcessed?.(item);
  } catch (error) {
    logEmailProcessingFailure({
      email: item.email,
      reason: "ui_callback_failed",
      error,
    });
  }
}

function getReceivedAtTimestamp(receivedAt: string): number {
  const timestamp = Date.parse(receivedAt);

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function applyCustomerPriority(
  items: ProcessedEmail[],
  customers: SavedCustomer[],
): ProcessedEmail[] {
  return applyCustomerPriorityToEmails(items, customers);
}

export function rematchLoadedQueueItems(
  items: ProcessedEmail[],
  customers: SavedCustomer[],
): ProcessedEmail[] {
  return sortProcessedEmails(applyCustomerPriority(items, customers));
}

export function sortProcessedEmails(items: ProcessedEmail[]): ProcessedEmail[] {
  return [...items].sort((left, right) => {
    const getStatusRank = (item: ProcessedEmail): number => {
      if (item.status === "processed") {
        return item.isCustomerPriority ? 0 : 1;
      }

      if (item.status === "pending") {
        return 2;
      }

      return 3;
    };
    const statusDifference = getStatusRank(left) - getStatusRank(right);

    if (statusDifference !== 0) {
      return statusDifference;
    }

    if (left.status === "processed" && right.status === "processed") {
      const priorityDifference =
        (right.result?.priorityScore ?? 0) - (left.result?.priorityScore ?? 0);

      if (priorityDifference !== 0) {
        return priorityDifference;
      }
    }

    return (
      getReceivedAtTimestamp(right.email.receivedAt) -
      getReceivedAtTimestamp(left.email.receivedAt)
    );
  });
}

export function filterProcessedEmails(
  items: ProcessedEmail[],
  filters: QueueFilters,
): ProcessedEmail[] {
  const query = filters.searchQuery.trim().toLowerCase();

  return items.filter((item) => {
    const matchesQueueView =
      filters.queueView !== "customer_service" ||
      (!isSuppressibleSystemReportMissingBodyFailure(item) &&
        shouldShowInCustomerServiceQueue(item));

    const matchesUrgency =
      filters.urgency === "all" ||
      (item.status === "processed" &&
        item.result?.analysis.urgency === filters.urgency);

    const matchesIntent =
      filters.intent === "all" ||
      (item.status === "processed" &&
        item.result?.analysis.intent === filters.intent);
    const matchesCustomerPriority =
      filters.customerPriority !== "matched_only" || item.isCustomerPriority;

    const matchesSearch =
      query.length === 0 ||
      safeLower(item.email.senderName).includes(query) ||
      safeLower(item.email.subject).includes(query);

    return (
      matchesQueueView &&
      matchesUrgency &&
      matchesIntent &&
      matchesCustomerPriority &&
      matchesSearch
    );
  });
}

export function getIntentOptions(items: ProcessedEmail[]): IntentCode[] {
  return Array.from(
    new Set(
      items.flatMap((item) =>
        item.status === "processed" && item.result
          ? [item.result.analysis.intent]
          : [],
      ),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export function refreshProcessedEmail(
  items: ProcessedEmail[],
  emailId: string,
  nextResult: ActionDeskResult,
): ProcessedEmail[] {
  return sortProcessedEmails(
    items.map((item) =>
      item.email.id === emailId
        ? createProcessedEmail(item.email, nextResult)
        : item,
    ),
  );
}

export function refreshProcessedEmailReplyDraft(
  items: ProcessedEmail[],
  emailId: string,
  replyDraft: string,
): ProcessedEmail[] {
  return items.map((item) =>
    item.email.id === emailId && item.result
      ? {
          ...item,
          result: {
            ...item.result,
            replyDraft,
          },
        }
      : item,
  );
}

export function replaceProcessedEmail(
  items: ProcessedEmail[],
  emailId: string,
  nextItem: ProcessedEmail,
): ProcessedEmail[] {
  return sortProcessedEmails(
    items.map((item) => (item.email.id === emailId ? nextItem : item)),
  );
}

export async function processEmails(
  emails: EmailItem[],
  customers: SavedCustomer[] = [],
  concurrency = DEFAULT_EMAIL_PROCESSING_CONCURRENCY,
): Promise<ProcessedEmail[]> {
  const processedItems = await runWithConcurrency(
    emails.length,
    concurrency,
    async (index) => {
      const email = emails[index];

      try {
        const normalizedEmail = normalizeEmailForProcessing(email);
        assertEmailCanBeAnalyzed(normalizedEmail);
        const result = await runActionDesk(getAnalysisInput(normalizedEmail), {
          aiInput: {
            subject: normalizedEmail.subject,
            from: [normalizedEmail.senderName, normalizedEmail.senderEmail]
              .filter(Boolean)
              .join(" "),
            body: normalizedEmail.body,
          },
        });
        return applyBackendCustomerContext(
          createProcessedEmail(normalizedEmail, result),
          customers,
        );
      } catch (error) {
        return createFailedProcessedEmail(
          email,
          getProcessingErrorMessage(
            getEmailProcessingFailureReason(email, error),
          ),
        );
      }
    },
  );

  if (emails.length > 0 && processedItems.length === 0) {
    throw new Error("No inbox emails could be processed.");
  }

  return sortProcessedEmails(processedItems);
}

export async function processEmailsProgressively(
  emails: EmailItem[],
  options?: ProcessEmailsProgressivelyOptions,
): Promise<ProcessEmailsProgressivelyResult> {
  let processedCount = 0;
  let failedCount = 0;

  const processedItems = await runWithConcurrency(
    emails.length,
    options?.concurrency,
    async (index) => {
      const email = emails[index];

      try {
        const normalizedEmail = normalizeEmailForProcessing(email);
        assertEmailCanBeAnalyzed(normalizedEmail);
        const result = await runActionDesk(getAnalysisInput(normalizedEmail), {
          aiInput: {
            subject: normalizedEmail.subject,
            from: [normalizedEmail.senderName, normalizedEmail.senderEmail]
              .filter(Boolean)
              .join(" "),
            body: normalizedEmail.body,
          },
        });
        const processedItem = applyBackendCustomerContext(
          createProcessedEmail(normalizedEmail, result),
          options?.customers,
        );

        processedCount += 1;
        notifyItemProcessed(processedItem, options);
        return processedItem;
      } catch (error) {
        const failureReason = getEmailProcessingFailureReason(email, error);

        logEmailProcessingFailure({
          email,
          reason: failureReason,
          error,
        });

        const failedItem = createFailedProcessedEmail(
          email,
          getProcessingErrorMessage(failureReason),
        );
        failedCount += 1;
        notifyItemProcessed(failedItem, options);
        return failedItem;
      }
    },
  );

  const sortedItems = sortProcessedEmails(processedItems);

  if (emails.length > 0 && sortedItems.length === 0) {
    throw new Error("No inbox emails could be processed.");
  }

  console.info("[Action Desk diagnostics] email processing batch", {
    totalEmailsProcessed: emails.length,
    analyzedCount: processedCount,
    failedCount,
  });

  return {
    processedItems: sortedItems,
    processedCount,
    failedCount,
  };
}
