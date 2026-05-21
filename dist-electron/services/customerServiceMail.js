"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLowValueSystemReportEmail = isLowValueSystemReportEmail;
exports.getWorkTypeLabel = getWorkTypeLabel;
exports.classifyWorkType = classifyWorkType;
exports.normalizeProcessedEmailResult = normalizeProcessedEmailResult;
exports.shouldShowInCustomerServiceQueue = shouldShowInCustomerServiceQueue;
const priorityScore_1 = require("../domain/priorityScore");
const emailWorkHeuristics_1 = require("./emailWorkHeuristics");
const generateRecommendedAction_1 = require("./generateRecommendedAction");
const generateReply_1 = require("./generateReply");
const aiReplyDraft_1 = require("./aiReplyDraft");
const CUSTOMER_SUPPORT_PATTERNS = [
    "where is my order",
    "order",
    "order status",
    "status update",
    "status request",
    "update request",
    "shipment",
    "tracking",
    "tracking number",
    "delivery",
    "delivered",
    "late",
    "delay",
    "delayed",
    "damaged",
    "damage",
    "missing item",
    "missing items",
    "wrong item",
    "incorrect item",
    "not received",
    "never received",
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
    "return",
    "exchange",
    "help",
    "help me",
    "please help",
    "issue",
    "problem",
    "complaint",
    "disappointed",
    "unacceptable",
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
const SYSTEM_REPORT_PATTERNS = [
    "tracking_summary",
    "tracking summary",
    "daily report",
    "daily summary",
    "summary report",
    "scheduled report",
    "automated report",
    "generated report",
    "system report",
];
const DEFINITE_SYSTEM_REPORT_PATTERNS = [
    "outboundyesterdaytracking_summary",
    "outbound yesterday tracking summary",
    "automated report",
    "generated report",
    "system report",
    "scheduled report",
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
const ACTIONABLE_CUSTOMER_PATTERNS = [
    "where is",
    "can you help",
    "please help",
    "need help",
    "please advise",
    "please update",
    "please send",
    "please confirm",
    "let me know",
    "refund",
    "replace",
    "return",
    "cancel",
    "damaged",
    "missing",
    "wrong item",
    "not received",
    "status",
    "tracking",
];
const ORDER_IDENTIFIER_PATTERN = /\b(?:ord-\d+|order\s*#?\s*[a-z0-9-]{4,}|\bpo[-\s]?\d+|\b\d{4,}-\d{4,}\b)\b/i;
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
const SYSTEM_REPORT_SENDER_PATTERNS = [
    "systems@",
    "reports@",
    "reporting@",
    "scheduledreports@",
];
function isInternalSender(senderEmail) {
    return senderEmail.endsWith("@apexpress.com");
}
function normalizeEmailText(email) {
    return [email.subject, email.previewText, email.body]
        .filter((value) => typeof value === "string" && value.trim().length > 0)
        .join("\n")
        .toLowerCase();
}
function isOperationalLogisticsIntent(intent) {
    return (intent === "operational_logistics_scheduling" ||
        intent === "routing_coordination" ||
        intent === "carrier_pickup_scheduling");
}
function isLowValueSystemReportEmail(email) {
    const sender = (email.senderEmail || "").toLowerCase();
    const normalizedText = normalizeEmailText(email);
    const senderLooksLikeReport = SYSTEM_REPORT_SENDER_PATTERNS.some((pattern) => sender.includes(pattern));
    const textLooksLikeReport = (0, emailWorkHeuristics_1.includesAny)(normalizedText, SYSTEM_REPORT_PATTERNS);
    const textIsDefiniteSystemReport = (0, emailWorkHeuristics_1.includesAny)(normalizedText, DEFINITE_SYSTEM_REPORT_PATTERNS);
    return (sender === "systems@apexpress.com" ||
        textIsDefiniteSystemReport ||
        (senderLooksLikeReport && textLooksLikeReport));
}
function getLatestNormalizedMessage(email) {
    const latestMessageText = (0, emailWorkHeuristics_1.extractLatestMessageText)(email.body || "");
    return (latestMessageText ||
        [email.subject, email.previewText, email.body]
            .filter((value) => typeof value === "string" && value.trim().length > 0)
            .join("\n")).toLowerCase();
}
function hasTextOrderIdentifier(text) {
    return ORDER_IDENTIFIER_PATTERN.test(text);
}
function hasOrderIdentifier(text, analysis, options) {
    return (hasTextOrderIdentifier(text) ||
        (options?.allowAnalysisIdentifiers === true &&
            (Boolean(analysis?.orderNumber) || Boolean(analysis?.caseIdentifiers?.length))));
}
function hasDirectCustomerSignals(text, analysis) {
    return ((0, emailWorkHeuristics_1.includesAny)(text, CUSTOMER_SUPPORT_PATTERNS) ||
        (0, emailWorkHeuristics_1.includesAny)(text, ACTIONABLE_CUSTOMER_PATTERNS) ||
        hasOrderIdentifier(text, analysis, { allowAnalysisIdentifiers: false }) ||
        Boolean(analysis?.hasDeadlineRequest) ||
        Boolean(analysis?.hasConfirmationRequest && analysis?.hasLogisticsContext));
}
function hasActionableRequestSignals(text, analysis) {
    return ((0, emailWorkHeuristics_1.hasClearRequest)(text) ||
        Boolean(analysis?.replyNeeded === "yes" ||
            analysis?.replyNeeded === "recommended") ||
        Boolean(analysis?.actionability === "action_required"));
}
function hasCustomerTopicSignals(text, analysis) {
    return ((0, emailWorkHeuristics_1.includesAny)(text, CUSTOMER_SUPPORT_PATTERNS) ||
        (0, emailWorkHeuristics_1.includesAny)(text, ACTIONABLE_CUSTOMER_PATTERNS) ||
        hasOrderIdentifier(text, analysis, { allowAnalysisIdentifiers: true }) ||
        Boolean(analysis?.hasDeadlineRequest) ||
        Boolean(analysis?.hasConfirmationRequest && analysis?.hasLogisticsContext) ||
        Boolean(analysis && analysis.intent !== "general_support") ||
        Boolean(analysis && analysis.risks.length > 0));
}
function hasCustomerSignals(text, analysis) {
    return (hasCustomerTopicSignals(text, analysis) || hasActionableRequestSignals(text, analysis));
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
    const normalizedLatestMessage = (latestMessageText || normalizedText || "").toLowerCase();
    const sender = (email.senderEmail || "").toLowerCase();
    const explicitCustomerCase = hasDirectCustomerSignals(normalizedLatestMessage, analysis) ||
        hasTextOrderIdentifier(normalizedLatestMessage);
    const customerSignals = hasCustomerSignals(normalizedLatestMessage, analysis);
    const suspicious = (0, emailWorkHeuristics_1.includesAny)(normalizedLatestMessage, SUSPICIOUS_PATTERNS);
    const threadContinuation = (0, emailWorkHeuristics_1.isLikelyThreadContinuation)(latestMessageText, email.body || "");
    const internalOperationalReport = (0, emailWorkHeuristics_1.isInternalOperationalReport)(normalizedLatestMessage) ||
        (0, emailWorkHeuristics_1.isInternalOperationalReport)(normalizedText);
    const internalOperations = (0, emailWorkHeuristics_1.isInternalOperationsThread)(normalizedLatestMessage) ||
        (0, emailWorkHeuristics_1.isInternalOperationsThread)(normalizedText);
    const system = isLowValueSystemReportEmail(email) ||
        (0, emailWorkHeuristics_1.includesAny)(normalizedLatestMessage, SYSTEM_PATTERNS) ||
        SYSTEM_SENDER_PATTERNS.some((pattern) => sender.includes(pattern));
    const vendorSalesOutreach = (0, emailWorkHeuristics_1.isVendorSalesOutreach)(normalizedLatestMessage) ||
        (0, emailWorkHeuristics_1.isVendorSalesOutreach)(normalizedText);
    const vendor = (vendorSalesOutreach || (0, emailWorkHeuristics_1.includesAny)(normalizedLatestMessage, VENDOR_PATTERNS)) &&
        !hasDirectCustomerSignals(normalizedLatestMessage, analysis) &&
        !hasTextOrderIdentifier(normalizedLatestMessage);
    const internal = (0, emailWorkHeuristics_1.includesAny)(normalizedLatestMessage, INTERNAL_PATTERNS) ||
        internalOperations ||
        internalOperationalReport ||
        (isInternalSender(sender) && internalOperationalReport) ||
        (threadContinuation && !(0, emailWorkHeuristics_1.hasClearRequest)(normalizedLatestMessage));
    if (suspicious) {
        return "suspicious";
    }
    if (vendorSalesOutreach) {
        return "vendor";
    }
    if (internalOperationalReport && !(0, emailWorkHeuristics_1.hasClearRequest)(normalizedLatestMessage)) {
        return "internal";
    }
    if (system) {
        return "system";
    }
    if (vendor) {
        return "vendor";
    }
    if (threadContinuation && !(0, emailWorkHeuristics_1.hasClearRequest)(normalizedLatestMessage) && !explicitCustomerCase) {
        return "internal";
    }
    if (internal && !hasDirectCustomerSignals(normalizedLatestMessage, analysis)) {
        return "internal";
    }
    if (explicitCustomerCase || customerSignals) {
        return "customer_support";
    }
    if (internal) {
        return "internal";
    }
    return "unknown";
}
function createSuppressedAnalysis(analysis, workType) {
    const summary = workType === "suspicious"
        ? "Suspicious or phishing-related message. Review internally before taking any action."
        : workType === "system"
            ? "System, calendar, or automated administrative message. Not a customer-service case."
            : workType === "vendor"
                ? "Vendor sales outreach or account-maintenance thread. Not a customer-service case."
                : workType === "internal"
                    ? "Internal operational report or awareness-only message. Keep for review, not for customer-service follow-up."
                    : "This message is not clearly a customer-service case and should be reviewed before any reply.";
    const nextAction = workType === "suspicious"
        ? "Review internally as suspicious or phishing-related mail. Do not send a customer-service reply unless ownership is confirmed."
        : workType === "system"
            ? "No customer-service reply recommended. Keep for awareness or route to the appropriate internal owner if follow-up is needed."
            : workType === "vendor"
                ? "No customer-service action needed. Mark not relevant unless an internal owner intentionally wants to review the vendor outreach."
                : workType === "internal"
                    ? "No customer-service reply recommended. Keep this for internal awareness or review only unless a clear customer action is requested."
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
    const operationalLogisticsText = [normalizedLatestMessage, normalizeEmailText(email)]
        .filter(Boolean)
        .join("\n");
    const operationalLogisticsScheduling = (0, emailWorkHeuristics_1.hasOperationalLogisticsSchedulingSignals)(operationalLogisticsText) ||
        isOperationalLogisticsIntent(derivedAnalysis.intent);
    const operationalLogisticsConflict = (0, emailWorkHeuristics_1.hasOperationalLogisticsScheduleConflict)(operationalLogisticsText);
    const operationalLogisticsFailureOrEscalation = (0, emailWorkHeuristics_1.hasOperationalLogisticsFailureOrEscalationSignals)(operationalLogisticsText);
    const operationalLogisticsRequiresReply = operationalLogisticsConflict || operationalLogisticsFailureOrEscalation;
    const analysisForWorkType = operationalLogisticsScheduling
        ? {
            ...derivedAnalysis,
            intent: isOperationalLogisticsIntent(derivedAnalysis.intent)
                ? derivedAnalysis.intent
                : "operational_logistics_scheduling",
            summary: operationalLogisticsRequiresReply
                ? "Operational logistics scheduling or routing email needs pickup timing review before a reply."
                : "Operational logistics scheduling or routing email. Review pickup details and reply only if alternate scheduling is needed.",
            urgency: operationalLogisticsFailureOrEscalation ? "high" : "medium",
            risks: (0, emailWorkHeuristics_1.hasActualBillingQuestion)(operationalLogisticsText)
                ? derivedAnalysis.risks
                : derivedAnalysis.risks.filter((risk) => (risk !== "billing_discrepancy" &&
                    risk !== "customer_frustration")),
            actionability: operationalLogisticsRequiresReply
                ? "action_required"
                : "review_needed",
            replyNeeded: operationalLogisticsRequiresReply ? "yes" : "no",
            messageType: "customer_request",
            hasClearRequest: derivedAnalysis.hasClearRequest || operationalLogisticsRequiresReply,
            hasLogisticsContext: true,
            hasOperationalTimingSignal: true,
        }
        : derivedAnalysis;
    const workType = classifyWorkType(email, analysisForWorkType);
    const analysis = workType === "customer_support"
        ? {
            ...analysisForWorkType,
            workType,
        }
        : createSuppressedAnalysis(analysisForWorkType, workType);
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
    const rulesReplyDraft = (0, generateReply_1.generateReply)(nextAnalysis, orderContext);
    const keepAiReplyDraft = result.replyDraftSource === "ai" &&
        result.replyDraft.trim().length > 0 &&
        (0, aiReplyDraft_1.canRequestAiReplyDraft)(nextAnalysis, rulesReplyDraft || result.replyDraft);
    const replyDraft = keepAiReplyDraft ? result.replyDraft : rulesReplyDraft;
    const priorityResult = (0, priorityScore_1.computePriorityScore)(nextAnalysis, orderContext);
    return {
        ...result,
        analysis: nextAnalysis,
        orderContext,
        replyDraft,
        replyDraftSource: keepAiReplyDraft ? "ai" : "rules",
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
        return true;
    }
    const analysis = item.result.analysis;
    const latestMessageText = getLatestNormalizedMessage(item.email);
    const fullText = normalizeEmailText(item.email);
    const hasBroadCustomerSignals = hasCustomerTopicSignals(latestMessageText, analysis) ||
        hasCustomerTopicSignals(fullText, analysis);
    const hasDirectCustomerContext = hasDirectCustomerSignals(latestMessageText, analysis) ||
        hasDirectCustomerSignals(fullText, analysis);
    const hasActionableCustomerAsk = hasActionableRequestSignals(latestMessageText, analysis);
    const internalOperationalReport = (0, emailWorkHeuristics_1.isInternalOperationalReport)(latestMessageText) ||
        (0, emailWorkHeuristics_1.isInternalOperationalReport)(fullText);
    const isContinuationWithoutAsk = analysis.isThreadContinuation === true &&
        !analysis.hasClearRequest &&
        !hasBroadCustomerSignals;
    if (analysis.workType === "customer_support") {
        return true;
    }
    if (analysis.workType === "suspicious" ||
        analysis.workType === "system" ||
        analysis.workType === "vendor") {
        return false;
    }
    if (analysis.workType === "internal") {
        if (internalOperationalReport && !hasActionableCustomerAsk) {
            return false;
        }
        return hasDirectCustomerContext || hasActionableCustomerAsk;
    }
    if (isContinuationWithoutAsk) {
        return false;
    }
    return hasBroadCustomerSignals || hasActionableCustomerAsk;
}
