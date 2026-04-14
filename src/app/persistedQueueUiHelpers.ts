import type { ProcessedEmail } from "../types/actionDesk";
import { sortProcessedEmails } from "./processEmails";
import type { QueueApplicationService } from "./queueApplicationService";

export type RefreshedQueueResult = {
  items: ProcessedEmail[];
  refreshedSelectedItem?: ProcessedEmail;
};

export async function refreshProcessedQueue(
  service: QueueApplicationService,
  selectedEmailId?: string,
): Promise<RefreshedQueueResult> {
  const refreshed = await service.listActiveQueueProcessedEmails();
  const sortedItems = sortProcessedEmails(refreshed);
  const refreshedSelectedItem = selectedEmailId
    ? sortedItems.find((item) => item.email.id === selectedEmailId)
    : undefined;

  return {
    items: sortedItems,
    refreshedSelectedItem,
  };
}

export function applyQueueRefreshToSelection(options: {
  refreshedSelectedItem?: ProcessedEmail;
  setSelectedEmailId: (value: string | undefined) => void;
  setShowDetailView: (value: boolean) => void;
}) {
  const {
    refreshedSelectedItem,
    setSelectedEmailId,
    setShowDetailView,
  } = options;

  if (refreshedSelectedItem) {
    setSelectedEmailId(refreshedSelectedItem.email.id);
    setShowDetailView(true);
    return;
  }

  setSelectedEmailId(undefined);
  setShowDetailView(false);
}