import { runActionDesk } from "./runActionDesk";
import type { ActionDeskResult, EmailItem, ProcessedEmail } from "../types/actionDesk";

const urgencyRank: Record<ProcessedEmail["result"]["analysis"]["urgency"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export type QueueFilters = {
  searchQuery: string;
  urgency: "all" | "high" | "medium" | "low";
  intent: string;
};

export function buildPreviewText(result: ActionDeskResult, email: EmailItem): string {
  const summary = result.analysis.summary.trim();

  if (summary.length > 0) {
    return summary;
  }

  return email.body.replace(/\s+/g, " ").trim();
}

export function createProcessedEmail(email: EmailItem, result: ActionDeskResult): ProcessedEmail {
  return {
    email,
    result,
    issueCount: result.analysis.risks.length,
    previewText: buildPreviewText(result, email),
  };
}

export function sortProcessedEmails(items: ProcessedEmail[]): ProcessedEmail[] {
  return [...items].sort((left, right) => {
    const urgencyDifference =
      urgencyRank[left.result.analysis.urgency] - urgencyRank[right.result.analysis.urgency];

    if (urgencyDifference !== 0) {
      return urgencyDifference;
    }

    return (
      new Date(right.email.receivedAt).getTime() - new Date(left.email.receivedAt).getTime()
    );
  });
}

export function filterProcessedEmails(
  items: ProcessedEmail[],
  filters: QueueFilters,
): ProcessedEmail[] {
  const query = filters.searchQuery.trim().toLowerCase();

  return items.filter((item) => {
    const matchesUrgency =
      filters.urgency === "all" || item.result.analysis.urgency === filters.urgency;
    const matchesIntent =
      filters.intent === "all" || item.result.analysis.intent === filters.intent;
    const matchesSearch =
      query.length === 0 ||
      item.email.senderName.toLowerCase().includes(query) ||
      item.email.subject.toLowerCase().includes(query);

    return matchesUrgency && matchesIntent && matchesSearch;
  });
}

export function getIntentOptions(items: ProcessedEmail[]): string[] {
  return Array.from(new Set(items.map((item) => item.result.analysis.intent))).sort((left, right) =>
    left.localeCompare(right),
  );
}

export function refreshProcessedEmail(
  items: ProcessedEmail[],
  emailId: string,
  nextResult: ActionDeskResult,
): ProcessedEmail[] {
  return sortProcessedEmails(
    items.map((item) =>
      item.email.id === emailId ? createProcessedEmail(item.email, nextResult) : item,
    ),
  );
}

export async function processEmails(emails: EmailItem[]): Promise<ProcessedEmail[]> {
  const settledItems = await Promise.allSettled(
    emails.map(async (email) => {
      const result = await runActionDesk(email.body);

      return createProcessedEmail(email, result);
    }),
  );

  const processedItems = settledItems.flatMap((item) =>
    item.status === "fulfilled" ? [item.value] : [],
  );

  if (processedItems.length === 0) {
    throw new Error("No inbox emails could be processed.");
  }

  return sortProcessedEmails(processedItems);
}
