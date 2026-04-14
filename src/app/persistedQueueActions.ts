import type { ProcessedEmail } from "../types/actionDesk";
import type { QueueApplicationService } from "./queueApplicationService";
import {
  applyQueueRefreshToSelection,
  refreshProcessedQueue,
} from "./persistedQueueUiHelpers";

type CommonActionOptions = {
  service: QueueApplicationService;
  selectedItem: ProcessedEmail;
  setQueueItems: (items: ProcessedEmail[]) => void;
  setSelectedEmailId: (value: string | undefined) => void;
  setShowDetailView: (value: boolean) => void;
  setReplyActionError: (value: string | null) => void;
  setCopyFeedback: (value: "idle" | "success" | "error") => void;
  setCaseCopyFeedback: (value: "idle" | "success" | "error") => void;
  setRawCaseCopyFeedback: (value: "idle" | "success" | "error") => void;
  showTemporaryProcessingStatus: (message: string) => void;
};

type RecomputePriorityOptions = CommonActionOptions;

type UpdateWorkStatusOptions = CommonActionOptions & {
  status: "active" | "waiting_on_customer";
  successMessage: string;
  onAfterSuccess?: (emailId: string) => void;
};

type MarkDoneOptions = Omit<CommonActionOptions, "showTemporaryProcessingStatus"> & {
  showTemporaryProcessingStatus: (message: string) => void;
};

export async function runPersistedRecomputePriority(
  options: RecomputePriorityOptions,
): Promise<void> {
  const {
    service,
    selectedItem,
    setQueueItems,
    setSelectedEmailId,
    setShowDetailView,
    setReplyActionError,
    setCopyFeedback,
    setCaseCopyFeedback,
    setRawCaseCopyFeedback,
    showTemporaryProcessingStatus,
  } = options;

  const previousEmailId = selectedItem.email.id;
  const previousScore = selectedItem.result?.priorityScore ?? 0;

  await service.recomputePriority(selectedItem.queueItemId!);

  const refreshedResult = await refreshProcessedQueue(service, previousEmailId);
  const nextScore =
    refreshedResult.refreshedSelectedItem?.result?.priorityScore ?? previousScore;

  setQueueItems(refreshedResult.items);

  applyQueueRefreshToSelection({
    refreshedSelectedItem: refreshedResult.refreshedSelectedItem,
    setSelectedEmailId,
    setShowDetailView,
  });

  setReplyActionError(null);
  setCopyFeedback("idle");
  setCaseCopyFeedback("idle");
  setRawCaseCopyFeedback("idle");

  if (nextScore !== previousScore) {
    showTemporaryProcessingStatus(
      `Priority recalculated. Score changed from ${previousScore} to ${nextScore}.`,
    );
  } else {
    showTemporaryProcessingStatus(
      "Priority recalculated. Score did not change.",
    );
  }
}

export async function runPersistedUpdateWorkStatus(
  options: UpdateWorkStatusOptions,
): Promise<void> {
  const {
    service,
    selectedItem,
    status,
    successMessage,
    onAfterSuccess,
    setQueueItems,
    setSelectedEmailId,
    setShowDetailView,
    setReplyActionError,
    setCopyFeedback,
    setCaseCopyFeedback,
    setRawCaseCopyFeedback,
    showTemporaryProcessingStatus,
  } = options;

  const previousEmailId = selectedItem.email.id;

  await service.updateWorkStatus(selectedItem.queueItemId!, status);

  const refreshedResult = await refreshProcessedQueue(service, previousEmailId);

  setQueueItems(refreshedResult.items);

  applyQueueRefreshToSelection({
    refreshedSelectedItem: refreshedResult.refreshedSelectedItem,
    setSelectedEmailId,
    setShowDetailView,
  });

  setReplyActionError(null);
  setCopyFeedback("idle");
  setCaseCopyFeedback("idle");
  setRawCaseCopyFeedback("idle");

  if (onAfterSuccess) {
    onAfterSuccess(previousEmailId);
  }

  showTemporaryProcessingStatus(successMessage);
}

export async function runPersistedMarkDone(
  options: MarkDoneOptions,
): Promise<void> {
  const {
    service,
    selectedItem,
    setQueueItems,
    setSelectedEmailId,
    setShowDetailView,
    setReplyActionError,
    setCopyFeedback,
    setCaseCopyFeedback,
    setRawCaseCopyFeedback,
    showTemporaryProcessingStatus,
  } = options;

  await service.markResolved(selectedItem.queueItemId!);

  const refreshedResult = await refreshProcessedQueue(service);

  setQueueItems(refreshedResult.items);
  setSelectedEmailId(undefined);
  setShowDetailView(false);
  setReplyActionError(null);
  setCopyFeedback("idle");
  setCaseCopyFeedback("idle");
  setRawCaseCopyFeedback("idle");

  showTemporaryProcessingStatus("Queue item marked done.");
}