"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyPersistedQueueProjection = applyPersistedQueueProjection;
exports.applyPersistedBackgroundChunk = applyPersistedBackgroundChunk;
exports.runPersistedInitialLoad = runPersistedInitialLoad;
exports.runPersistedLoadMore = runPersistedLoadMore;
const processEmails_1 = require("./processEmails");
function getCurrentTimeLabel() {
    return new Date().toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
    });
}
function applyPersistedQueueProjection(options) {
    const { processedItems, nextCursor, selectFirstItem, processingMessage, setQueueItems, setNextCursor, setLastLoadedAt, setSelectedEmailId, setProcessingStatus, } = options;
    setQueueItems((0, processEmails_1.sortProcessedEmails)(processedItems));
    setNextCursor(nextCursor);
    setLastLoadedAt(getCurrentTimeLabel());
    if (selectFirstItem && processedItems.length > 0) {
        setSelectedEmailId(processedItems[0]?.email.id);
    }
    if (processingMessage !== undefined) {
        setProcessingStatus(processingMessage);
    }
}
function applyPersistedBackgroundChunk(options) {
    const { isMounted, payload, setQueueItems, setNextCursor, setLastLoadedAt, setProcessingStatus, } = options;
    if (!isMounted) {
        return;
    }
    applyPersistedQueueProjection({
        processedItems: payload.processedItems,
        nextCursor: payload.nextCursor,
        processingMessage: payload.processedCount < payload.totalCount
            ? `Processing inbox emails: ${payload.processedCount} of ${payload.totalCount} completed.`
            : null,
        setQueueItems,
        setNextCursor,
        setLastLoadedAt,
        setSelectedEmailId: () => { },
        setProcessingStatus,
    });
}
async function runPersistedInitialLoad(options) {
    const { service, interactiveAuth, setQueueItems, setNextCursor, setLastLoadedAt, setSelectedEmailId, setProcessingStatus, setIsLoadingInbox, setLoading, isMounted, } = options;
    const queueResult = await service.loadAndProcessInboxWithHeadStart({
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
    });
    if (!isMounted) {
        return null;
    }
    applyPersistedQueueProjection({
        processedItems: queueResult.processedItems,
        nextCursor: queueResult.nextCursor,
        selectFirstItem: true,
        processingMessage: (queueResult.processedItems?.length ?? 0) < 10
            ? null
            : "Loading more inbox emails in the background.",
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
async function runPersistedLoadMore(options) {
    const { service, cursor, setQueueItems, setNextCursor, setLastLoadedAt, setProcessingStatus, } = options;
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
        setSelectedEmailId: () => { },
        setProcessingStatus,
    });
}
