"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCachedProcessedEmail = getCachedProcessedEmail;
exports.setCachedProcessedEmail = setCachedProcessedEmail;
exports.clearProcessedEmailCache = clearProcessedEmailCache;
const processedEmailCache = new Map();
function cloneProcessedEmail(item) {
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
function clearProcessedEmailCache() {
    processedEmailCache.clear();
}
