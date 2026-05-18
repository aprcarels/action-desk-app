import type { ProcessedEmail } from "../types/actionDesk";
import type { QueueApplicationService } from "./queueApplicationService";
import { sortProcessedEmails } from "./processEmails";

type ApplyProjectionOptions = {
  processedItems: ProcessedEmail[];
  nextCursor?: string;
  selectFirstItem?: boolean;
  processingMessage?: string | null;
  setQueueItems: (items: ProcessedEmail[]) => void;
  setNextCursor: (value: string | undefined) => void;
  setLastLoadedAt: (value: string | undefined) => void;
  setSelectedEmailId: (value: string | undefined) => void;
  setProcessingStatus: (value: string | null) => void;
};

type BackgroundChunkPayload = {
  processedItems: ProcessedEmail[];
  nextCursor?: string;
  processedCount: number;
  totalCount: number;
};

type BackgroundChunkHandlerOptions = {
  isMounted: boolean;
  payload: BackgroundChunkPayload;
  setQueueItems: (items: ProcessedEmail[]) => void;
  setNextCursor: (value: string | undefined) => void;
  setLastLoadedAt: (value: string | undefined) => void;
  setProcessingStatus: (value: string | null) => void;
};

type HeadStartLoadOptions = {
  service: QueueApplicationService;
  interactiveAuth?: boolean;
  useHeadStart?: boolean;
  selectFirstItem?: boolean;
  setQueueItems: (items: ProcessedEmail[]) => void;
  setNextCursor: (value: string | undefined) => void;
  setLastLoadedAt: (value: string | undefined) => void;
  setSelectedEmailId: (value: string | undefined) => void;
  setProcessingStatus: (value: string | null) => void;
  setIsLoadingInbox: (value: boolean) => void;
  setLoading: (value: boolean) => void;
  isMounted: boolean;
};

type HeadStartLoadResult = {
  nextCursor?: string;
};

type LoadMoreOptions = {
  service: QueueApplicationService;
  cursor: string;
  setQueueItems: (items: ProcessedEmail[]) => void;
  setNextCursor: (value: string | undefined) => void;
  setLastLoadedAt: (value: string | undefined) => void;
  setProcessingStatus: (value: string | null) => void;
};

function getCurrentTimeLabel(): string {
  return new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function applyPersistedQueueProjection(options: ApplyProjectionOptions) {
  const {
    processedItems,
    nextCursor,
    selectFirstItem,
    processingMessage,
    setQueueItems,
    setNextCursor,
    setLastLoadedAt,
    setSelectedEmailId,
    setProcessingStatus,
  } = options;

  setQueueItems(sortProcessedEmails(processedItems));
  setNextCursor(nextCursor);
  setLastLoadedAt(getCurrentTimeLabel());

  if (selectFirstItem && processedItems.length > 0) {
    setSelectedEmailId(processedItems[0]?.email.id);
  }

  if (processingMessage !== undefined) {
    setProcessingStatus(processingMessage);
  }
}

export function applyPersistedBackgroundChunk(
  options: BackgroundChunkHandlerOptions,
) {
  const {
    isMounted,
    payload,
    setQueueItems,
    setNextCursor,
    setLastLoadedAt,
    setProcessingStatus,
  } = options;

  if (!isMounted) {
    return;
  }

  applyPersistedQueueProjection({
    processedItems: payload.processedItems,
    nextCursor: payload.nextCursor,
    processingMessage:
      payload.processedCount < payload.totalCount
        ? `Processing inbox emails: ${payload.processedCount} of ${payload.totalCount} completed.`
        : null,
    setQueueItems,
    setNextCursor,
    setLastLoadedAt,
    setSelectedEmailId: () => {},
    setProcessingStatus,
  });
}

export async function runPersistedInitialLoad(
  options: HeadStartLoadOptions,
): Promise<HeadStartLoadResult | null> {
  const {
    service,
    interactiveAuth,
    setQueueItems,
    setNextCursor,
    setLastLoadedAt,
    setSelectedEmailId,
    setProcessingStatus,
    setIsLoadingInbox,
    setLoading,
    isMounted,
    useHeadStart = true,
    selectFirstItem = true,
  } = options;

  const queueResult = useHeadStart
    ? await service.loadAndProcessInboxWithHeadStart({
        interactiveAuth,
        initialCount: 10,
        batchSize: 5,
        onBackgroundChunkProcessed: async (payload) => {
          applyPersistedBackgroundChunk({
            isMounted,
            payload,
            setQueueItems,
            setNextCursor,
            setLastLoadedAt,
            setProcessingStatus,
          });
        },
      })
    : await service.loadAndProcessInbox({
        interactiveAuth,
      });

  if (!isMounted) {
    return null;
  }

  applyPersistedQueueProjection({
    processedItems: queueResult.processedItems,
    nextCursor: queueResult.nextCursor,
    selectFirstItem,
    processingMessage:
      useHeadStart && (queueResult.processedItems?.length ?? 0) >= 10
        ? "Loading more inbox emails in the background."
        : null,
    setQueueItems,
    setNextCursor,
    setLastLoadedAt,
    setSelectedEmailId,
    setProcessingStatus,
  });

  setIsLoadingInbox(false);
  setLoading(false);

  return {
    nextCursor: queueResult.nextCursor,
  };
}

export async function runPersistedLoadMore(options: LoadMoreOptions): Promise<void> {
  const {
    service,
    cursor,
    setQueueItems,
    setNextCursor,
    setLastLoadedAt,
    setProcessingStatus,
  } = options;

  const queueResult = await service.loadAndProcessInbox({
    cursor,
    interactiveAuth: true,
  });

  applyPersistedQueueProjection({
    processedItems: queueResult.processedItems,
    nextCursor: queueResult.nextCursor,
    processingMessage: null,
    setQueueItems,
    setNextCursor,
    setLastLoadedAt,
    setSelectedEmailId: () => {},
    setProcessingStatus,
  });
}
