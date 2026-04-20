import { runActionDesk } from "./runActionDesk";
import {
  normalizeProcessedEmailResult,
  shouldShowInCustomerServiceQueue,
} from "../services/customerServiceMail";
import { buildAnalysisInput } from "../services/analysisInput";
import type {
  ActionDeskResult,
  EmailItem,
  IntentCode,
  ProcessedEmail,
} from "../types/actionDesk";

export type QueueFilters = {
  searchQuery: string;
  urgency: "all" | "high" | "medium" | "low";
  intent: IntentCode | "all";
  queueView?: "customer_service" | "all_inbox";
};

type ProcessEmailsProgressivelyOptions = {
  onItemProcessed?: (item: ProcessedEmail) => void;
};

export type ProcessEmailsProgressivelyResult = {
  processedItems: ProcessedEmail[];
  processedCount: number;
  failedCount: number;
};

function safeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeLower(value: unknown): string {
  return safeText(value).toLowerCase();
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
  return buildAnalysisInput(email);
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

function getProcessingErrorMessage(): string {
  return "This email could not be analyzed. Try retrying it.";
}

function getReceivedAtTimestamp(receivedAt: string): number {
  const timestamp = Date.parse(receivedAt);

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function sortProcessedEmails(items: ProcessedEmail[]): ProcessedEmail[] {
  return [...items].sort((left, right) => {
    const statusRank: Record<ProcessedEmail["status"], number> = {
      processed: 0,
      pending: 1,
      failed: 2,
    };
    const statusDifference = statusRank[left.status] - statusRank[right.status];

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
      shouldShowInCustomerServiceQueue(item);

    const matchesUrgency =
      filters.urgency === "all" ||
      (item.status === "processed" &&
        item.result?.analysis.urgency === filters.urgency);

    const matchesIntent =
      filters.intent === "all" ||
      (item.status === "processed" &&
        item.result?.analysis.intent === filters.intent);

    const matchesSearch =
      query.length === 0 ||
      safeLower(item.email.senderName).includes(query) ||
      safeLower(item.email.subject).includes(query);

    return (
      matchesQueueView &&
      matchesUrgency &&
      matchesIntent &&
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
): Promise<ProcessedEmail[]> {
  const settledItems = await Promise.allSettled(
    emails.map(async (email) => {
      const result = await runActionDesk(getAnalysisInput(email));
      return createProcessedEmail(email, result);
    }),
  );

  const processedItems = settledItems.map((item, index) =>
    item.status === "fulfilled"
      ? item.value
      : createFailedProcessedEmail(emails[index], getProcessingErrorMessage()),
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
  const processedItems: ProcessedEmail[] = [];
  let processedCount = 0;
  let failedCount = 0;

  await Promise.all(
    emails.map(async (email) => {
      try {
        const result = await runActionDesk(getAnalysisInput(email));
        const processedItem = createProcessedEmail(email, result);

        processedCount += 1;
        processedItems.push(processedItem);
        options?.onItemProcessed?.(processedItem);
      } catch (error) {
        console.error("EMAIL PROCESSING FAILED", {
          emailId: email.id,
          subject: email.subject,
          senderName: email.senderName,
          senderEmail: (email as any).senderEmail,
          receivedAt: email.receivedAt,
          error,
        });

        const failedItem = createFailedProcessedEmail(
          email,
          getProcessingErrorMessage(),
        );
        failedCount += 1;
        processedItems.push(failedItem);
        options?.onItemProcessed?.(failedItem);
      }
    }),
  );

  const sortedItems = sortProcessedEmails(processedItems);

  if (emails.length > 0 && sortedItems.length === 0) {
    throw new Error("No inbox emails could be processed.");
  }

  return {
    processedItems: sortedItems,
    processedCount,
    failedCount,
  };
}