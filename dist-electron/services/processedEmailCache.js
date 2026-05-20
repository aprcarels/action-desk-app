"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCachedProcessedEmail = getCachedProcessedEmail;
exports.setCachedProcessedEmail = setCachedProcessedEmail;
exports.updateProcessedEmailCache = updateProcessedEmailCache;
exports.clearProcessedEmailCache = clearProcessedEmailCache;
const processedEmailCache = new Map();
function cloneProcessedEmail(item) {
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
function getCachedProcessedEmail(id) {
    const cachedItem = processedEmailCache.get(id);
    if (!cachedItem) {
        return undefined;
    }
    return cloneProcessedEmail(cachedItem);
}
function setCachedProcessedEmail(item) {
    if (item.status !== "processed" || !item.result) {
        return;
    }
    processedEmailCache.set(item.email.id, cloneProcessedEmail(item));
}
function updateProcessedEmailCache(updater) {
    for (const [id, item] of processedEmailCache.entries()) {
        const nextItem = updater(cloneProcessedEmail(item));
        if (nextItem.status !== "processed" || !nextItem.result) {
            processedEmailCache.delete(id);
            continue;
        }
        processedEmailCache.set(id, cloneProcessedEmail(nextItem));
    }
}
function clearProcessedEmailCache() {
    processedEmailCache.clear();
}
