import type { ProcessedEmail } from "../types/actionDesk";

const processedEmailCache = new Map<string, ProcessedEmail>();

function cloneProcessedEmail(item: ProcessedEmail): ProcessedEmail {
  return {
    ...item,
    email: { ...item.email },
    customerMatch: item.customerMatch ? { ...item.customerMatch } : undefined,
    result: item.result
      ? {
          ...item.result,
          aiClassification: item.result.aiClassification
            ? { ...item.result.aiClassification }
            : undefined,
          analysis: {
            ...item.result.analysis,
            risks: [...item.result.analysis.risks],
          },
          priorityBreakdown: item.result.priorityBreakdown
            ? item.result.priorityBreakdown.map((entry) => ({ ...entry }))
            : undefined,
        }
      : undefined,
  };
}

export function getCachedProcessedEmail(id: string): ProcessedEmail | undefined {
  const cachedItem = processedEmailCache.get(id);

  if (!cachedItem) {
    return undefined;
  }

  return cloneProcessedEmail(cachedItem);
}

export function setCachedProcessedEmail(item: ProcessedEmail) {
  if (item.status !== "processed" || !item.result) {
    return;
  }

  processedEmailCache.set(item.email.id, cloneProcessedEmail(item));
}

export function updateProcessedEmailCache(
  updater: (item: ProcessedEmail) => ProcessedEmail,
) {
  for (const [id, item] of processedEmailCache.entries()) {
    const nextItem = updater(cloneProcessedEmail(item));

    if (nextItem.status !== "processed" || !nextItem.result) {
      processedEmailCache.delete(id);
      continue;
    }

    processedEmailCache.set(id, cloneProcessedEmail(nextItem));
  }
}

export function clearProcessedEmailCache() {
  processedEmailCache.clear();
}
