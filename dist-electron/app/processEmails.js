"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPreviewText = buildPreviewText;
exports.createProcessedEmail = createProcessedEmail;
exports.createFailedProcessedEmail = createFailedProcessedEmail;
exports.createPendingProcessedEmail = createPendingProcessedEmail;
exports.sortProcessedEmails = sortProcessedEmails;
exports.filterProcessedEmails = filterProcessedEmails;
exports.getIntentOptions = getIntentOptions;
exports.refreshProcessedEmail = refreshProcessedEmail;
exports.refreshProcessedEmailReplyDraft = refreshProcessedEmailReplyDraft;
exports.replaceProcessedEmail = replaceProcessedEmail;
exports.processEmails = processEmails;
exports.processEmailsProgressively = processEmailsProgressively;
const runActionDesk_1 = require("./runActionDesk");
const customerServiceMail_1 = require("../services/customerServiceMail");
const analysisInput_1 = require("../services/analysisInput");
function buildPreviewText(result, email) {
    const summary = result.analysis.summary.trim();
    if (summary.length > 0) {
        return summary;
    }
    return email.previewText?.trim() || email.body.replace(/\s+/g, " ").trim();
}
function getAnalysisInput(email) {
    return (0, analysisInput_1.buildAnalysisInput)(email);
}
function createProcessedEmail(email, result) {
    const normalizedResult = (0, customerServiceMail_1.normalizeProcessedEmailResult)(email, result);
    return {
        email,
        status: "processed",
        result: normalizedResult,
        issueCount: normalizedResult.analysis.risks.length,
        previewText: buildPreviewText(normalizedResult, email),
    };
}
function createFailedProcessedEmail(email, processingError = "This email could not be processed.") {
    return {
        email,
        status: "failed",
        processingError,
        issueCount: 0,
        previewText: email.previewText?.trim() || email.body.replace(/\s+/g, " ").trim(),
    };
}
function createPendingProcessedEmail(email) {
    return {
        email,
        status: "pending",
        issueCount: 0,
        previewText: email.previewText?.trim() || email.body.replace(/\s+/g, " ").trim(),
    };
}
function getProcessingErrorMessage() {
    return "This email could not be analyzed. Try retrying it.";
}
function getReceivedAtTimestamp(receivedAt) {
    const timestamp = Date.parse(receivedAt);
    return Number.isNaN(timestamp) ? 0 : timestamp;
}
function sortProcessedEmails(items) {
    return [...items].sort((left, right) => {
        const statusRank = {
            processed: 0,
            pending: 1,
            failed: 2,
        };
        const statusDifference = statusRank[left.status] - statusRank[right.status];
        if (statusDifference !== 0) {
            return statusDifference;
        }
        if (left.status === "processed" && right.status === "processed") {
            const priorityDifference = (right.result?.priorityScore ?? 0) - (left.result?.priorityScore ?? 0);
            if (priorityDifference !== 0) {
                return priorityDifference;
            }
        }
        return (getReceivedAtTimestamp(right.email.receivedAt) -
            getReceivedAtTimestamp(left.email.receivedAt));
    });
}
function filterProcessedEmails(items, filters) {
    const query = filters.searchQuery.trim().toLowerCase();
    return items.filter((item) => {
        const matchesQueueView = filters.queueView !== "customer_service" || (0, customerServiceMail_1.shouldShowInCustomerServiceQueue)(item);
        const matchesUrgency = filters.urgency === "all" ||
            (item.status === "processed" && item.result?.analysis.urgency === filters.urgency);
        const matchesIntent = filters.intent === "all" ||
            (item.status === "processed" && item.result?.analysis.intent === filters.intent);
        const matchesSearch = query.length === 0 ||
            item.email.senderName.toLowerCase().includes(query) ||
            item.email.subject.toLowerCase().includes(query);
        return matchesQueueView && matchesUrgency && matchesIntent && matchesSearch;
    });
}
function getIntentOptions(items) {
    return Array.from(new Set(items.flatMap((item) => item.status === "processed" && item.result ? [item.result.analysis.intent] : []))).sort((left, right) => left.localeCompare(right));
}
function refreshProcessedEmail(items, emailId, nextResult) {
    return sortProcessedEmails(items.map((item) => item.email.id === emailId ? createProcessedEmail(item.email, nextResult) : item));
}
function refreshProcessedEmailReplyDraft(items, emailId, replyDraft) {
    return items.map((item) => item.email.id === emailId && item.result
        ? {
            ...item,
            result: {
                ...item.result,
                replyDraft,
            },
        }
        : item);
}
function replaceProcessedEmail(items, emailId, nextItem) {
    return sortProcessedEmails(items.map((item) => (item.email.id === emailId ? nextItem : item)));
}
async function processEmails(emails) {
    const settledItems = await Promise.allSettled(emails.map(async (email) => {
        const result = await (0, runActionDesk_1.runActionDesk)(getAnalysisInput(email));
        return createProcessedEmail(email, result);
    }));
    const processedItems = settledItems.map((item, index) => item.status === "fulfilled"
        ? item.value
        : createFailedProcessedEmail(emails[index], getProcessingErrorMessage()));
    if (emails.length > 0 && processedItems.length === 0) {
        throw new Error("No inbox emails could be processed.");
    }
    return sortProcessedEmails(processedItems);
}
async function processEmailsProgressively(emails, options) {
    const processedItems = [];
    let processedCount = 0;
    let failedCount = 0;
    await Promise.all(emails.map(async (email) => {
        try {
            const result = await (0, runActionDesk_1.runActionDesk)(getAnalysisInput(email));
            const processedItem = createProcessedEmail(email, result);
            processedCount += 1;
            processedItems.push(processedItem);
            options?.onItemProcessed?.(processedItem);
        }
        catch {
            const failedItem = createFailedProcessedEmail(email, getProcessingErrorMessage());
            failedCount += 1;
            processedItems.push(failedItem);
            options?.onItemProcessed?.(failedItem);
        }
    }));
    const sortedItems = sortProcessedEmails(processedItems);
    if (emails.length > 0 && sortedItems.length === 0) {
        throw new Error("No inbox emails could be processed.");
    }
    return {
        processedItems: sortedItems,
        processedCount,
        failedCount,
    };
}
