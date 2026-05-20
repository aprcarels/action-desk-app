"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refineEmailAnalysis = refineEmailAnalysis;
const analysisInput_1 = require("./analysisInput");
const caseIdentifiers_1 = require("./caseIdentifiers");
const emailWorkHeuristics_1 = require("./emailWorkHeuristics");
const ALERT_PATTERNS = [
    "alert",
    "warning",
    "notification",
    "automated",
    "system generated",
    "system alert",
    "monitor",
    "exception",
    "failure",
    "failed",
    "do not reply",
    "noreply",
    "no-reply",
];
const AWARENESS_PATTERNS = [
    "fyi",
    "for awareness",
    "for visibility",
    "copied for visibility",
    "just letting you know",
    "heads up",
    "no action needed",
    "no action required",
    "reply not needed",
    "cc'ing you",
    "ccing you",
    "for review only",
];
const SUSPICIOUS_PATTERNS = [
    "phishing",
    "scam",
    "suspicious",
    "not sure if this is real",
    "is this real",
    "is this legit",
    "do not click",
    "malware",
];
const CALENDAR_ADMIN_PATTERNS = [
    "meeting",
    "calendar",
    "invite",
    "invitation",
    "accepted:",
    "declined:",
    "tentative:",
    "out of office",
    "automatic reply",
];
const VENDOR_PATTERNS = [
    "vendor",
    "supplier",
    "account maintenance",
    "subscription",
    "renewal",
    "portal",
    "w-9",
    "tax form",
    "remittance",
    "banking update",
];
const FRUSTRATION_PATTERNS = [
    "frustrated",
    "upset",
    "disappointed",
    "unacceptable",
    "still waiting",
    "this is ridiculous",
];
function hasRisk(risks, risk) {
    return risks.includes(risk);
}
function isOperationalLogisticsIntent(intent) {
    return (intent === "operational_logistics_scheduling" ||
        intent === "routing_coordination" ||
        intent === "carrier_pickup_scheduling");
}
function getWorkType(options) {
    if ((0, emailWorkHeuristics_1.includesAny)(options.normalizedEmail, SUSPICIOUS_PATTERNS)) {
        return "suspicious";
    }
    if (options.isVendorSalesOutreach) {
        return "vendor";
    }
    if (options.likelyAutomatedAlert ||
        (0, emailWorkHeuristics_1.includesAny)(options.normalizedEmail, CALENDAR_ADMIN_PATTERNS)) {
        return "system";
    }
    if ((0, emailWorkHeuristics_1.includesAny)(options.normalizedEmail, VENDOR_PATTERNS) &&
        !options.hasExplicitRequest) {
        return "vendor";
    }
    if (options.isInternalOperations) {
        return "internal";
    }
    if (options.awarenessOnly) {
        return "internal";
    }
    if (options.hasExplicitRequest ||
        options.analysis.intent !== "general_support" ||
        options.analysis.risks.length > 0) {
        return "customer_support";
    }
    return "unknown";
}
function getMessageType(options) {
    if (options.likelyAutomatedAlert) {
        return "internal_alert";
    }
    if (options.isInternalOperations) {
        return "internal_alert";
    }
    if (options.awarenessOnly) {
        return "awareness_only";
    }
    if (options.isThreadContinuation && !options.hasExplicitRequest) {
        return "informational";
    }
    if (options.informational && !options.hasExplicitRequest) {
        return "informational";
    }
    if (options.refinedIntent !== "general_support") {
        return "customer_request";
    }
    return "general_support";
}
function getActionability(options) {
    if (options.noActionNeeded) {
        return "no_action_needed";
    }
    if (options.isOperationalLogisticsScheduling) {
        return options.hasOperationalLogisticsConflict ||
            options.hasOperationalLogisticsFailureOrEscalation ||
            options.hasExplicitRequest
            ? "action_required"
            : "review_needed";
    }
    if (options.isThreadContinuation && !options.hasExplicitRequest) {
        return "review_needed";
    }
    if (options.awarenessOnly) {
        return "awareness_only";
    }
    if (options.hasExplicitRequest ||
        options.analysis.intent !== "general_support" ||
        hasRisk(options.analysis.risks, "customer_frustration") ||
        hasRisk(options.analysis.risks, "damage_reported") ||
        hasRisk(options.analysis.risks, "missing_items_reported") ||
        hasRisk(options.analysis.risks, "cancellation_review_needed") ||
        hasRisk(options.analysis.risks, "billing_discrepancy")) {
        return "action_required";
    }
    if (options.likelyAutomatedAlert) {
        return "review_needed";
    }
    return "review_needed";
}
function getReplyNeeded(actionability) {
    if (actionability === "action_required") {
        return "yes";
    }
    if (actionability === "review_needed") {
        return "maybe";
    }
    return "no";
}
function getRefinedUrgency(options) {
    const latestUrgencySignal = (0, emailWorkHeuristics_1.getLatestUrgencySignal)(options.latestMessageText);
    const hasDeadlineRequest = options.analysis.hasDeadlineRequest || (0, emailWorkHeuristics_1.hasShippingDeadlineRequest)(options.latestMessageText);
    const hasExplicitHighUrgency = options.analysis.urgency === "high" || latestUrgencySignal === "high";
    const hasMaterialCustomerRisk = hasRisk(options.analysis.risks, "customer_frustration") ||
        hasRisk(options.analysis.risks, "damage_reported") ||
        hasRisk(options.analysis.risks, "missing_items_reported") ||
        hasRisk(options.analysis.risks, "delivered_not_received") ||
        hasRisk(options.analysis.risks, "cancellation_review_needed") ||
        hasRisk(options.analysis.risks, "billing_discrepancy");
    const isActionableCustomerRequest = options.analysis.workType === "customer_support" &&
        options.actionability === "action_required";
    if (options.actionability === "no_action_needed" ||
        options.actionability === "awareness_only") {
        return "low";
    }
    if (options.isThreadContinuation && options.actionability !== "action_required") {
        return "low";
    }
    if (options.analysis.workType && options.analysis.workType !== "customer_support") {
        return "low";
    }
    if (options.messageType === "internal_alert" && !hasMaterialCustomerRisk) {
        return "low";
    }
    if (options.isOperationalLogisticsScheduling) {
        return options.hasOperationalLogisticsFailureOrEscalation &&
            options.actionability === "action_required"
            ? "high"
            : "medium";
    }
    if (!options.analysis.hasClearRequest &&
        options.hasLogisticsContext &&
        !options.hasConfirmationRequest) {
        return options.hasOperationalTimingSignal ? "medium" : "low";
    }
    if (isActionableCustomerRequest && (hasExplicitHighUrgency || hasDeadlineRequest)) {
        return "high";
    }
    if (isActionableCustomerRequest &&
        options.hasConfirmationRequest &&
        options.hasLogisticsContext) {
        return options.hasOperationalTimingSignal || latestUrgencySignal === "high"
            ? "high"
            : "medium";
    }
    if (hasExplicitHighUrgency && hasMaterialCustomerRisk) {
        return "high";
    }
    if (isActionableCustomerRequest && (latestUrgencySignal === "medium" || options.analysis.intent !== "general_support")) {
        return options.analysis.urgency === "low" ? "medium" : options.analysis.urgency;
    }
    if (hasMaterialCustomerRisk) {
        return options.analysis.urgency === "low" ? "medium" : options.analysis.urgency;
    }
    if (latestUrgencySignal === "medium") {
        return "medium";
    }
    return options.analysis.urgency;
}
function getRefinedConfidence(options) {
    if (options.messageType === "internal_alert" ||
        options.actionability === "awareness_only" ||
        options.actionability === "no_action_needed") {
        return options.analysis.confidence === "high" ? "medium" : options.analysis.confidence;
    }
    return options.analysis.confidence;
}
function getRefinedSummary(options) {
    if (options.analysis.workType === "vendor") {
        return "Vendor sales outreach or account-maintenance message. Not a customer-service case.";
    }
    if (options.analysis.workType === "internal" && options.isInternalOperationalReport) {
        return "Internal operational report. No customer-service reply is needed.";
    }
    if (options.actionability === "no_action_needed") {
        return "Informational message indicates no immediate action is needed.";
    }
    if (options.isThreadContinuation && !options.analysis.hasClearRequest) {
        return "Short thread continuation with limited standalone context. Review only if follow-up is still needed.";
    }
    if (options.actionability === "awareness_only") {
        return "Informational message appears to be for awareness only, with no clear action requested.";
    }
    if (options.messageType === "internal_alert") {
        return "Internal alert or automated notification. Review for awareness and only act if follow-up is needed.";
    }
    if (options.isOperationalLogisticsScheduling) {
        return options.actionability === "action_required"
            ? "Operational logistics scheduling or routing email needs pickup timing review before a reply."
            : "Operational logistics scheduling or routing email. Review pickup details and reply only if alternate scheduling is needed.";
    }
    if (options.analysis.intent === "general_support" &&
        options.analysis.summary.toLowerCase().includes("customer is asking for an order update")) {
        return "General support message needs review before taking action.";
    }
    return options.analysis.summary;
}
function applyIdentifierContext(email, analysis) {
    const parsedInput = (0, analysisInput_1.parseAnalysisInput)(email);
    const emailText = parsedInput.body || email;
    const latestMessageText = (0, emailWorkHeuristics_1.extractLatestMessageText)(emailText);
    const caseIdentifiers = (0, caseIdentifiers_1.extractCaseIdentifiers)({
        subject: parsedInput.subject,
        latestMessageText,
        bodyText: emailText,
    });
    const orderNumber = analysis.orderNumber ?? (0, caseIdentifiers_1.getPrimaryOrderNumber)(caseIdentifiers);
    const referenceLabel = (0, caseIdentifiers_1.getIdentifierReferenceLabel)({
        orderNumber,
        caseIdentifiers,
    });
    const hasDeadlineRequest = analysis.hasDeadlineRequest || (0, emailWorkHeuristics_1.hasShippingDeadlineRequest)(latestMessageText);
    const summaryMentionsMissingOrder = analysis.summary.toLowerCase().includes("did not provide an order number") ||
        analysis.summary.toLowerCase().includes("did not provide a usable identifier");
    if (!referenceLabel) {
        return {
            ...analysis,
            caseIdentifiers,
            hasDeadlineRequest,
            orderNumber,
        };
    }
    const summary = summaryMentionsMissingOrder && analysis.intent === "where_is_my_order"
        ? `Customer is requesting a status update for ${referenceLabel}.`
        : summaryMentionsMissingOrder && analysis.intent === "pod_request"
            ? `Customer is requesting proof of delivery for ${referenceLabel}.`
            : analysis.summary;
    return {
        ...analysis,
        summary,
        orderNumber,
        caseIdentifiers,
        hasDeadlineRequest,
        confidence: orderNumber && analysis.intent !== "general_support"
            ? "high"
            : analysis.confidence,
    };
}
function refineEmailAnalysis(email, analysis) {
    const analysisWithIdentifiers = applyIdentifierContext(email, analysis);
    const parsedInput = (0, analysisInput_1.parseAnalysisInput)(email);
    const emailText = parsedInput.body || email;
    const fullText = parsedInput.fullText || emailText;
    const normalizedEmail = fullText.toLowerCase();
    const latestMessageText = (0, emailWorkHeuristics_1.extractLatestMessageText)(emailText);
    const normalizedLatestMessage = (latestMessageText || fullText).toLowerCase();
    const vendorSalesOutreach = (0, emailWorkHeuristics_1.isVendorSalesOutreach)(normalizedLatestMessage) ||
        (0, emailWorkHeuristics_1.isVendorSalesOutreach)(normalizedEmail);
    const likelyAutomatedAlert = (0, emailWorkHeuristics_1.includesAny)(normalizedEmail, ALERT_PATTERNS);
    const noActionNeeded = normalizedLatestMessage.includes("no action needed") ||
        normalizedLatestMessage.includes("no action required") ||
        normalizedLatestMessage.includes("do not reply");
    const hasExplicitRequest = !vendorSalesOutreach && (0, emailWorkHeuristics_1.hasClearRequest)(normalizedLatestMessage);
    const awarenessOnly = (0, emailWorkHeuristics_1.includesAny)(normalizedLatestMessage, AWARENESS_PATTERNS) && !hasExplicitRequest;
    const informational = awarenessOnly || normalizedLatestMessage.includes("for your information");
    const isThreadContinuation = (0, emailWorkHeuristics_1.isLikelyThreadContinuation)(latestMessageText, emailText);
    const internalOperationalReport = (0, emailWorkHeuristics_1.isInternalOperationalReport)(normalizedLatestMessage) ||
        (0, emailWorkHeuristics_1.isInternalOperationalReport)(normalizedEmail);
    const isInternalOperations = (0, emailWorkHeuristics_1.isInternalOperationsThread)(normalizedLatestMessage) ||
        (0, emailWorkHeuristics_1.isInternalOperationsThread)(normalizedEmail);
    const confirmationRequest = (0, emailWorkHeuristics_1.hasConfirmationRequest)(normalizedLatestMessage);
    const operationalLogisticsScheduling = (0, emailWorkHeuristics_1.hasOperationalLogisticsSchedulingSignals)(normalizedLatestMessage);
    const operationalLogisticsConflict = (0, emailWorkHeuristics_1.hasOperationalLogisticsScheduleConflict)(normalizedLatestMessage);
    const operationalLogisticsFailureOrEscalation = (0, emailWorkHeuristics_1.hasOperationalLogisticsFailureOrEscalationSignals)(normalizedLatestMessage);
    const logisticsContext = (0, emailWorkHeuristics_1.hasLogisticsCoordinationSignals)(normalizedLatestMessage) ||
        operationalLogisticsScheduling;
    const operationalTimingSignal = (0, emailWorkHeuristics_1.hasShippingDeadlineRequest)(normalizedLatestMessage) ||
        (0, emailWorkHeuristics_1.hasOperationalTimingSignal)(normalizedLatestMessage) ||
        operationalLogisticsScheduling;
    const alertLikeStatusRequest = (likelyAutomatedAlert || isInternalOperations || isThreadContinuation) &&
        (analysisWithIdentifiers.intent === "where_is_my_order" || analysisWithIdentifiers.intent === "general_support");
    const refinedIntent = vendorSalesOutreach || alertLikeStatusRequest
        ? "general_support"
        : operationalLogisticsScheduling &&
            !isOperationalLogisticsIntent(analysisWithIdentifiers.intent)
            ? "operational_logistics_scheduling"
            : analysisWithIdentifiers.intent;
    const workType = getWorkType({
        normalizedEmail,
        likelyAutomatedAlert,
        awarenessOnly,
        hasExplicitRequest,
        isInternalOperations,
        isVendorSalesOutreach: vendorSalesOutreach,
        analysis: {
            ...analysisWithIdentifiers,
            intent: refinedIntent,
        },
    });
    const messageType = getMessageType({
        normalizedEmail,
        hasExplicitRequest,
        awarenessOnly,
        informational,
        likelyAutomatedAlert,
        refinedIntent,
        isThreadContinuation,
        isInternalOperations,
    });
    const actionability = getActionability({
        likelyAutomatedAlert,
        awarenessOnly,
        noActionNeeded: noActionNeeded ||
            (workType !== "customer_support" && workType !== "unknown"),
        hasExplicitRequest,
        isThreadContinuation,
        isOperationalLogisticsScheduling: operationalLogisticsScheduling || isOperationalLogisticsIntent(refinedIntent),
        hasOperationalLogisticsConflict: operationalLogisticsConflict,
        hasOperationalLogisticsFailureOrEscalation: operationalLogisticsFailureOrEscalation,
        analysis: {
            ...analysisWithIdentifiers,
            intent: refinedIntent,
        },
    });
    const replyNeeded = (operationalLogisticsScheduling || isOperationalLogisticsIntent(refinedIntent)) &&
        !operationalLogisticsConflict &&
        !operationalLogisticsFailureOrEscalation
        ? "no"
        : getReplyNeeded(actionability);
    const urgency = getRefinedUrgency({
        normalizedEmail,
        analysis: {
            ...analysisWithIdentifiers,
            intent: refinedIntent,
            hasClearRequest: hasExplicitRequest,
            isThreadContinuation,
        },
        actionability,
        messageType,
        latestMessageText: normalizedLatestMessage,
        isThreadContinuation,
        hasConfirmationRequest: confirmationRequest,
        hasLogisticsContext: logisticsContext,
        hasOperationalTimingSignal: operationalTimingSignal,
        isOperationalLogisticsScheduling: operationalLogisticsScheduling || isOperationalLogisticsIntent(refinedIntent),
        hasOperationalLogisticsFailureOrEscalation: operationalLogisticsFailureOrEscalation,
    });
    const isOperationalLogisticsScheduling = operationalLogisticsScheduling || isOperationalLogisticsIntent(refinedIntent);
    const refinedRisks = vendorSalesOutreach
        ? []
        : Array.from(new Set([
            ...analysisWithIdentifiers.risks.filter((risk) => (isOperationalLogisticsScheduling && !(0, emailWorkHeuristics_1.hasActualBillingQuestion)(normalizedLatestMessage)
                ? risk !== "billing_discrepancy" &&
                    risk !== "customer_frustration"
                : true)),
            ...(isOperationalLogisticsScheduling
                ? []
                : (0, emailWorkHeuristics_1.includesAny)(normalizedEmail, FRUSTRATION_PATTERNS)
                    ? ["customer_frustration"]
                    : []),
        ]));
    return {
        ...analysisWithIdentifiers,
        intent: refinedIntent,
        urgency,
        confidence: getRefinedConfidence({
            analysis: {
                ...analysisWithIdentifiers,
                urgency,
                hasClearRequest: hasExplicitRequest,
                isThreadContinuation,
            },
            messageType,
            actionability,
        }),
        risks: refinedRisks,
        summary: getRefinedSummary({
            analysis: {
                ...analysisWithIdentifiers,
                intent: refinedIntent,
                urgency,
                workType,
                hasClearRequest: hasExplicitRequest,
                isThreadContinuation,
            },
            messageType,
            actionability,
            isThreadContinuation,
            isInternalOperationalReport: internalOperationalReport,
            isOperationalLogisticsScheduling,
        }),
        messageType,
        actionability,
        replyNeeded,
        workType,
        hasClearRequest: hasExplicitRequest,
        isThreadContinuation,
        hasConfirmationRequest: confirmationRequest,
        hasLogisticsContext: logisticsContext,
        hasOperationalTimingSignal: operationalTimingSignal,
    };
}
