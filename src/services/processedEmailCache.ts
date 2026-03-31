import type { ProcessedEmail } from "../types/actionDesk";

const processedEmailCache = new Map<string, ProcessedEmail>();

function cloneProcessedEmail(item: ProcessedEmail): ProcessedEmail {
  return {
    ...item,
    email: { ...item.email },
    result: item.result
      ? {
          ...item.result,
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

export function clearProcessedEmailCache() {
  processedEmailCache.clear();
}
