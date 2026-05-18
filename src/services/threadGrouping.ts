import type { ProcessedEmail, WorkflowThread } from "../types/actionDesk";

function getReceivedAtTimestamp(receivedAt: string): number {
  const timestamp = Date.parse(receivedAt);

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function getSenderThreadGroupKey(senderEmail: string): string {
  return `sender:${senderEmail.trim().toLowerCase()}`;
}

export function getThreadGroupKey(item: ProcessedEmail): string {
  if (item.email.workflowThreadId) {
    return item.email.workflowThreadId;
  }

  if (item.customerMatch?.customerId) {
    return `customer:${item.customerMatch.customerId}`;
  }

  if (item.email.conversationId) {
    return item.email.conversationId;
  }

  return getSenderThreadGroupKey(item.email.senderEmail);
}

export function getThreadTitle(item: ProcessedEmail): string {
  return item.customerMatch?.customerName || item.email.senderName || item.email.senderEmail;
}

export function getThreadSubtitle(item: ProcessedEmail): string {
  return item.customerMatch?.customerName
    ? `${item.email.senderName} | ${item.email.senderEmail}`
    : item.email.senderEmail;
}

export function selectRepresentativeItem(items: ProcessedEmail[]): ProcessedEmail {
  return [...items].sort((left, right) => {
    const leftPriority = left.result?.priorityScore ?? 0;
    const rightPriority = right.result?.priorityScore ?? 0;

    if (rightPriority !== leftPriority) {
      return rightPriority - leftPriority;
    }

    return (
      getReceivedAtTimestamp(right.email.receivedAt) -
      getReceivedAtTimestamp(left.email.receivedAt)
    );
  })[0];
}

export function createBaseWorkflowThreads(
  items: ProcessedEmail[],
): Array<
  Pick<
    WorkflowThread,
    | "id"
    | "groupKey"
    | "title"
    | "subtitle"
    | "items"
    | "representativeItem"
    | "latestReceivedAt"
    | "oldestReceivedAt"
    | "latestActivityAt"
    | "itemCount"
    | "customerName"
  >
> {
  const groups = new Map<string, ProcessedEmail[]>();

  for (const item of items) {
    const groupKey = getThreadGroupKey(item);
    const existingItems = groups.get(groupKey);

    if (existingItems) {
      existingItems.push(item);
      continue;
    }

    groups.set(groupKey, [item]);
  }

  return Array.from(groups.entries()).map(([groupKey, groupItems]) => {
    const itemsByNewest = [...groupItems].sort(
      (left, right) =>
        getReceivedAtTimestamp(right.email.receivedAt) -
        getReceivedAtTimestamp(left.email.receivedAt),
    );
    const representativeItem = selectRepresentativeItem(groupItems);

    return {
      id: groupKey,
      groupKey,
      title: getThreadTitle(representativeItem),
      subtitle: getThreadSubtitle(representativeItem),
      items: itemsByNewest,
      representativeItem,
      latestReceivedAt: itemsByNewest[0]?.email.receivedAt ?? representativeItem.email.receivedAt,
      oldestReceivedAt:
        itemsByNewest[itemsByNewest.length - 1]?.email.receivedAt ??
        representativeItem.email.receivedAt,
      latestActivityAt: itemsByNewest[0]?.email.receivedAt ?? representativeItem.email.receivedAt,
      itemCount: groupItems.length,
      customerName: representativeItem.customerMatch?.customerName,
    };
  });
}
