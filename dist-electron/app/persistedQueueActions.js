"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPersistedRecomputePriority = runPersistedRecomputePriority;
exports.runPersistedUpdateWorkStatus = runPersistedUpdateWorkStatus;
exports.runPersistedMarkDone = runPersistedMarkDone;
const persistedQueueUiHelpers_1 = require("./persistedQueueUiHelpers");
async function runPersistedRecomputePriority(options) {
    const { service, selectedItem, setQueueItems, setSelectedEmailId, setShowDetailView, setReplyActionError, setCopyFeedback, setCaseCopyFeedback, setRawCaseCopyFeedback, showTemporaryProcessingStatus, } = options;
    const previousEmailId = selectedItem.email.id;
    const previousScore = selectedItem.result?.priorityScore ?? 0;
    await service.recomputePriority(selectedItem.queueItemId);
    const refreshedResult = await (0, persistedQueueUiHelpers_1.refreshProcessedQueue)(service, previousEmailId);
    const nextScore = refreshedResult.refreshedSelectedItem?.result?.priorityScore ?? previousScore;
    setQueueItems(refreshedResult.items);
    (0, persistedQueueUiHelpers_1.applyQueueRefreshToSelection)({
        refreshedSelectedItem: refreshedResult.refreshedSelectedItem,
        setSelectedEmailId,
        setShowDetailView,
    });
    setReplyActionError(null);
    setCopyFeedback("idle");
    setCaseCopyFeedback("idle");
    setRawCaseCopyFeedback("idle");
    if (nextScore !== previousScore) {
        showTemporaryProcessingStatus(`Priority recalculated. Score changed from ${previousScore} to ${nextScore}.`);
    }
    else {
        showTemporaryProcessingStatus("Priority recalculated. Score did not change.");
    }
}
async function runPersistedUpdateWorkStatus(options) {
    const { service, selectedItem, status, successMessage, onAfterSuccess, setQueueItems, setSelectedEmailId, setShowDetailView, setReplyActionError, setCopyFeedback, setCaseCopyFeedback, setRawCaseCopyFeedback, showTemporaryProcessingStatus, } = options;
    const previousEmailId = selectedItem.email.id;
    await service.updateWorkStatus(selectedItem.queueItemId, status);
    const refreshedResult = await (0, persistedQueueUiHelpers_1.refreshProcessedQueue)(service, previousEmailId);
    setQueueItems(refreshedResult.items);
    (0, persistedQueueUiHelpers_1.applyQueueRefreshToSelection)({
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
async function runPersistedMarkDone(options) {
    const { service, selectedItem, setQueueItems, setSelectedEmailId, setShowDetailView, setReplyActionError, setCopyFeedback, setCaseCopyFeedback, setRawCaseCopyFeedback, showTemporaryProcessingStatus, } = options;
    await service.markResolved(selectedItem.queueItemId);
    const refreshedResult = await (0, persistedQueueUiHelpers_1.refreshProcessedQueue)(service);
    setQueueItems(refreshedResult.items);
    setSelectedEmailId(undefined);
    setShowDetailView(false);
    setReplyActionError(null);
    setCopyFeedback("idle");
    setCaseCopyFeedback("idle");
    setRawCaseCopyFeedback("idle");
    showTemporaryProcessingStatus("Queue item marked done.");
}
