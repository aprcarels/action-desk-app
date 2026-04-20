"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshProcessedQueue = refreshProcessedQueue;
exports.applyQueueRefreshToSelection = applyQueueRefreshToSelection;
const processEmails_1 = require("./processEmails");
async function refreshProcessedQueue(service, selectedEmailId) {
    const refreshed = await service.listActiveQueueProcessedEmails();
    const sortedItems = (0, processEmails_1.sortProcessedEmails)(refreshed);
    const refreshedSelectedItem = selectedEmailId
        ? sortedItems.find((item) => item.email.id === selectedEmailId)
        : undefined;
    return {
        items: sortedItems,
        refreshedSelectedItem,
    };
}
function applyQueueRefreshToSelection(options) {
    const { refreshedSelectedItem, setSelectedEmailId, setShowDetailView, } = options;
    if (refreshedSelectedItem) {
        setSelectedEmailId(refreshedSelectedItem.email.id);
        setShowDetailView(true);
        return;
    }
    setSelectedEmailId(undefined);
    setShowDetailView(false);
}
