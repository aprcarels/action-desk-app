"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWorkTypeLabel = getWorkTypeLabel;
exports.classifyWorkType = classifyWorkType;
exports.normalizeProcessedEmailResult = normalizeProcessedEmailResult;
exports.shouldShowInCustomerServiceQueue = shouldShowInCustomerServiceQueue;
const priorityScore_1 = require("../domain/priorityScore");
const emailWorkHeuristics_1 = require("./emailWorkHeuristics");
const generateRecommendedAction_1 = require("./generateRecommendedAction");
const generateReply_1 = require("./generateReply");
const CUSTOMER_SUPPORT_PATTERNS = [
    "where is my order",
    "order",
    "shipment",
    "tracking",
    "damaged",
    "damage",
    "missing item",
    "missing items",
    "short shipment",
    "cancel",
    "cancellation",
    "address change",
    "shipping address",
    "proof of delivery",
    "delivery receipt",
    "invoice",
    "billing",
    "charged",
    "charge",
    "refund",
    "replacement",
    "customer",
];
const SUSPICIOUS_PATTERNS = [
    "phishing",
    "scam",
    "suspicious",
    "is this real",
    "is this legit",
    "not sure if this is real",
    "fraud alert",
    "spam",
    "malware",
    "credential",
    "quarantine",
    "unsafe link",
];
const SYSTEM_PATTERNS = [
    "calendar",
    "meeting",
    "invite",
    "invitation",
    "accepted:",
    "declined:",
    "tentative:",
    "automatic reply",
    "out of office",
    "system alert",
    "automated",
    "notification",
    "no-reply",
    "noreply",
    "do not reply",
    "password reset",
    "sign-in",
    "signin",
    "mfa",
    "2fa",
    "security code",
];
const INTERNAL_PATTERNS = [
    "fyi",
    "for awareness",
    "for visibility",
    "heads up",
    "just letting you know",
    "no action needed",
    "no action required",
    "reply not needed",
    "please see below",
    "looping you in",
    "cc'ing you",
    "ccing you",
    "internal",
];
const VENDOR_PATTERNS = [
    "vendor",
    "supplier",
    "account maintenance",
    "account update",
    "portal",
    "subscription",
    "renewal",
    "w-9",
    "tax form",
    "banking update",
    "payment method",
    "remittance",
    "certificate of insurance",
    "pricing update",
    "business account",
];
const SYSTEM_SENDER_PATTERNS = [
    "noreply@",
    "no-reply@",
    "donotreply@",
    "do-not-reply@",
    "mailer-daemon@",
    "postmaster@",
    "notifications@",
    "calendar-notification@",
];
function normalizeEmailText(email) {
    return [email.subject, email.previewText, email.body]
        .filter((value) => typeof value === "string" && value.trim().length > 0)
        .join("\n")
        .toLowerCase();
}
function hasCustomerSignals(text, analysis) {
    return ((0, emailWorkHeuristics_1.includesAny)(text, CUSTOMER_SUPPORT_PATTERNS) ||
        (0, emailWorkHeuristics_1.hasClearRequest)(text) ||
        Boolean(analysis?.orderNumber) ||
        Boolean(analysis?.hasDeadlineRequest) ||
        Boolean(analysis?.hasConfirmationRequest && analysis?.hasLogisticsContext) ||
        Boolean(analysis && analysis.intent !== "general_support") ||
        Boolean(analysis && analysis.risks.length > 0));
}
function getWorkTypeLabel(workType) {
    switch (workType) {
        case "customer_support":
            return "Customer Support";
        case "internal":
            return "Internal";
        case "vendor":
            return "Vendor";
        case "system":
            return "System";
        case "suspicious":
            return "Suspicious";
        case "unknown":
        default:
            return "Unknown";
    }
}
function classifyWorkType(email, analysis) {
    const normalizedText = normalizeEmailText(email);
    const latestMessageText = (0, emailWorkHeuristics_1.extractLatestMessageText)(email.body || normalizedText);
    const normalizedLatestMessage = (latestMessageText || normalizedText).toLowerCase();
    const sender = email.senderEmail.toLowerCase();
    const explicitCustomerCase = (0, emailWorkHeuristics_1.includesAny)(normalizedLatestMessage, CUSTOMER_SUPPORT_PATTERNS) ||
        /\bord-\d+\b/i.test(normalizedLatestMessage);
    const customerSignals = hasCustomerSignals(normalizedLatestMessage, analysis);
    const suspicious = (0, emailWorkHeuristics_1.includesAny)(normalizedLatestMessage, SUSPICIOUS_PATTERNS);
    const threadContinuation = (0, emailWorkHeuristics_1.isLikelyThreadContinuation)(latestMessageText, email.body);
    const internalOperations = (0, emailWorkHeuristics_1.isInternalOperationsThread)(normalizedLatestMessage);
    const system = (0, emailWorkHeuristics_1.includesAny)(normalizedLatestMessage, SYSTEM_PATTERNS) ||
        SYSTEM_SENDER_PATTERNS.some((pattern) => sender.includes(pattern));
    const vendor = (0, emailWorkHeuristics_1.includesAny)(normalizedLatestMessage, VENDOR_PATTERNS) && !explicitCustomerCase;
    const internal = (0, emailWorkHeuristics_1.includesAny)(normalizedLatestMessage, INTERNAL_PATTERNS) ||
        internalOperations ||
        (threadContinuation && !(0, emailWorkHeuristics_1.hasClearRequest)(normalizedLatestMessage));
    if (suspicious) {
        return "suspicious";
    }
    if (system || analysis?.messageType === "internal_alert") {
        return "system";
    }
    if (vendor) {
        return "vendor";
    }
    if (internal || analysis?.actionability === "awareness_only") {
        return "internal";
    }
    if (customerSignals) {
        return "customer_support";
    }
    return "unknown";
}
function createSuppressedAnalysis(analysis, workType) {
    const summary = workType === "suspicious"
        ? "Suspicious or phishing-related message. Review internally before taking any action."
        : workType === "system"
            ? "System, calendar, or automated administrative message. Not a customer-service case."
            : workType === "vendor"
                ? "Vendor or account-maintenance thread. Review internally only if your team owns it."
                : workType === "internal"
                    ? "Internal or awareness-only message. Keep for review, not for customer-service follow-up."
                    : "This message is not clearly a customer-service case and should be reviewed before any reply.";
    const nextAction = workType === "suspicious"
        ? "Review internally as suspicious or phishing-related mail. Do not send a customer-service reply unless ownership is confirmed."
        : workType === "system"
            ? "No customer-service reply recommended. Keep for awareness or route to the appropriate internal owner if follow-up is needed."
            : workType === "vendor"
                ? "Review internally as a vendor or account-maintenance thread. Reply only if your team intentionally owns the request."
                : workType === "internal"
                    ? "Keep this for internal awareness or review only. Do not send a customer-service reply unless a clear customer action is requested."
                    : "Review first and confirm whether this belongs in customer service before replying or taking action.";
    return {
        ...analysis,
        summary,
        intent: "general_support",
        urgency: "low",
        confidence: analysis.confidence === "high" ? "medium" : "low",
        orderNumber: undefined,
        risks: [],
        nextAction,
        actionability: workType === "suspicious" || analysis.hasClearRequest ? "review_needed" : "no_action_needed",
        replyNeeded: "no",
        messageType: workType === "internal" && !analysis.hasClearRequest ? "awareness_only" : "internal_alert",
        workType,
    };
}
function normalizeProcessedEmailResult(email, result) {
    const latestMessageText = (0, emailWorkHeuristics_1.extractLatestMessageText)(email.body);
    const normalizedLatestMessage = (latestMessageText || email.body).toLowerCase();
    const deadlineState = result.analysis.hasDeadlineRequest
        ? (0, emailWorkHeuristics_1.getDeadlineState)(latestMessageText || email.body, email.receivedAt)
        : "none";
    const derivedAnalysis = {
        ...result.analysis,
        deadlineState,
        urgency: result.analysis.hasDeadlineRequest && deadlineState === "past_due"
            ? "high"
            : result.analysis.urgency,
        hasClearRequest: (0, emailWorkHeuristics_1.hasClearRequest)(normalizedLatestMessage),
        isThreadContinuation: (0, emailWorkHeuristics_1.isLikelyThreadContinuation)(latestMessageText, email.body),
    };
    const workType = classifyWorkType(email, derivedAnalysis);
    const analysis = workType === "customer_support"
        ? {
            ...derivedAnalysis,
            workType,
        }
        : createSuppressedAnalysis(derivedAnalysis, workType);
    const orderContext = workType === "customer_support" ? result.orderContext : undefined;
    const nextAction = (0, generateRecommendedAction_1.generateRecommendedAction)({
        intent: analysis.intent,
        urgency: analysis.urgency,
        risks: analysis.risks,
        orderNumber: analysis.orderNumber,
        caseIdentifiers: analysis.caseIdentifiers,
        hasDeadlineRequest: analysis.hasDeadlineRequest,
        deadlineState: analysis.deadlineState,
        messageType: analysis.messageType,
        actionability: analysis.actionability,
        replyNeeded: analysis.replyNeeded,
        workType: analysis.workType,
        hasConfirmationRequest: analysis.hasConfirmationRequest,
        hasLogisticsContext: analysis.hasLogisticsContext,
        hasOperationalTimingSignal: analysis.hasOperationalTimingSignal,
        orderContext,
    });
    const nextAnalysis = {
        ...analysis,
        nextAction,
    };
    const replyDraft = (0, generateReply_1.generateReply)(nextAnalysis, orderContext);
    const priorityResult = (0, priorityScore_1.computePriorityScore)(nextAnalysis, orderContext);
    return {
        ...result,
        analysis: nextAnalysis,
        orderContext,
        replyDraft,
        priorityScore: priorityResult.score,
        priorityBreakdown: priorityResult.breakdown,
        warning: nextAnalysis.orderNumber &&
            !orderContext &&
            nextAnalysis.actionability === "action_required"
            ? "Order status not confirmed yet"
            : undefined,
    };
}
function shouldShowInCustomerServiceQueue(item) {
    if (item.status !== "processed" || !item.result) {
        return classifyWorkType(item.email) === "customer_support";
    }
    return item.result.analysis.workType === "customer_support";
}
