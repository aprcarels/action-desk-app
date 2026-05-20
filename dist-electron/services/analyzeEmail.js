"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeEmail = analyzeEmail;
const analysisInput_1 = require("./analysisInput");
const caseIdentifiers_1 = require("./caseIdentifiers");
const emailWorkHeuristics_1 = require("./emailWorkHeuristics");
const generateRecommendedAction_1 = require("./generateRecommendedAction");
const refineEmailAnalysis_1 = require("./refineEmailAnalysis");
const LOW_URGENCY_KEYWORDS = [
    "for your information",
    "fyi",
    "just letting you know",
    "no action needed",
    "informational",
];
function analyzeEmail(email) {
    const parsedInput = (0, analysisInput_1.parseAnalysisInput)(email);
    const emailText = parsedInput.body || email;
    const fullText = parsedInput.fullText || emailText;
    const normalizedEmail = fullText.toLowerCase();
    const latestMessageText = (0, emailWorkHeuristics_1.extractLatestMessageText)(emailText);
    const normalizedLatestMessage = (latestMessageText || fullText).toLowerCase();
    const caseIdentifiers = (0, caseIdentifiers_1.extractCaseIdentifiers)({
        subject: parsedInput.subject,
        latestMessageText,
        bodyText: emailText,
    });
    const orderNumber = (0, caseIdentifiers_1.getPrimaryOrderNumber)(caseIdentifiers);
    const hasDeadlineRequest = (0, emailWorkHeuristics_1.hasShippingDeadlineRequest)(normalizedLatestMessage);
    const confirmationRequest = (0, emailWorkHeuristics_1.hasConfirmationRequest)(normalizedLatestMessage);
    const logisticsContext = (0, emailWorkHeuristics_1.hasLogisticsCoordinationSignals)(normalizedLatestMessage);
    const operationalTimingSignal = hasDeadlineRequest || (0, emailWorkHeuristics_1.hasOperationalTimingSignal)(normalizedLatestMessage);
    const intent = getIntent(normalizedLatestMessage, normalizedEmail);
    const urgency = getUrgency(normalizedLatestMessage, normalizedEmail);
    const confidence = getConfidence(intent, orderNumber);
    const risks = getRisks(normalizedLatestMessage);
    const summary = getSummary(intent, urgency, normalizedLatestMessage, {
        orderNumber,
        caseIdentifiers,
    });
    const nextAction = (0, generateRecommendedAction_1.generateRecommendedAction)({
        intent,
        urgency,
        risks,
        orderNumber,
        caseIdentifiers,
        hasDeadlineRequest,
    });
    const analysis = {
        summary,
        intent,
        urgency,
        confidence,
        orderNumber,
        caseIdentifiers,
        hasDeadlineRequest,
        deadlineState: hasDeadlineRequest ? "current" : "none",
        risks,
        nextAction,
        hasConfirmationRequest: confirmationRequest,
        hasLogisticsContext: logisticsContext,
        hasOperationalTimingSignal: operationalTimingSignal,
    };
    const refinedAnalysis = (0, refineEmailAnalysis_1.refineEmailAnalysis)(email, analysis);
    return {
        ...refinedAnalysis,
        nextAction: (0, generateRecommendedAction_1.generateRecommendedAction)({
            intent: refinedAnalysis.intent,
            urgency: refinedAnalysis.urgency,
            risks: refinedAnalysis.risks,
            orderNumber: refinedAnalysis.orderNumber,
            caseIdentifiers: refinedAnalysis.caseIdentifiers,
            hasDeadlineRequest: refinedAnalysis.hasDeadlineRequest,
            deadlineState: refinedAnalysis.deadlineState,
            messageType: refinedAnalysis.messageType,
            actionability: refinedAnalysis.actionability,
            replyNeeded: refinedAnalysis.replyNeeded,
            workType: refinedAnalysis.workType,
            hasConfirmationRequest: refinedAnalysis.hasConfirmationRequest,
            hasLogisticsContext: refinedAnalysis.hasLogisticsContext,
            hasOperationalTimingSignal: refinedAnalysis.hasOperationalTimingSignal,
        }),
    };
}
function getIntent(normalizedLatestMessage, normalizedEmail) {
    if ((0, emailWorkHeuristics_1.isVendorSalesOutreach)(normalizedLatestMessage) ||
        (0, emailWorkHeuristics_1.isVendorSalesOutreach)(normalizedEmail)) {
        return "general_support";
    }
    const isInternalOperations = (0, emailWorkHeuristics_1.isInternalOperationsThread)(normalizedLatestMessage) ||
        (0, emailWorkHeuristics_1.isInternalOperationsThread)(normalizedEmail);
    const hasOperationalLogisticsScheduling = (0, emailWorkHeuristics_1.hasOperationalLogisticsSchedulingSignals)(normalizedLatestMessage);
    const asksForPod = normalizedLatestMessage.includes("proof of delivery") ||
        normalizedLatestMessage.includes("pod") ||
        normalizedLatestMessage.includes("delivery receipt");
    const asksToCancel = normalizedLatestMessage.includes("cancel order") ||
        normalizedLatestMessage.includes("cancel my order") ||
        normalizedLatestMessage.includes("cancellation") ||
        normalizedLatestMessage.includes("please cancel") ||
        normalizedLatestMessage.includes("cancel all") ||
        normalizedLatestMessage.includes("cancel those") ||
        normalizedLatestMessage.includes("once canceled") ||
        normalizedLatestMessage.includes("confirm once canceled");
    const reportsShortShipment = normalizedLatestMessage.includes("short shipment") ||
        normalizedLatestMessage.includes("missing item") ||
        normalizedLatestMessage.includes("missing items") ||
        normalizedLatestMessage.includes("only received");
    const reportsDamage = normalizedLatestMessage.includes("damaged") ||
        normalizedLatestMessage.includes("broken") ||
        normalizedLatestMessage.includes("arrived crushed");
    const asksForAddressChange = normalizedLatestMessage.includes("change the address") ||
        normalizedLatestMessage.includes("update the address") ||
        normalizedLatestMessage.includes("wrong address") ||
        normalizedLatestMessage.includes("shipping address") ||
        normalizedLatestMessage.includes("change details") ||
        normalizedLatestMessage.includes("modify order") ||
        normalizedLatestMessage.includes("correct shipping details");
    const reportsDuplicateShipment = normalizedLatestMessage.includes("duplicate shipment") ||
        normalizedLatestMessage.includes("duplicate order") ||
        normalizedLatestMessage.includes("received two") ||
        normalizedLatestMessage.includes("sent twice");
    const asksBillingQuestion = (0, emailWorkHeuristics_1.hasActualBillingQuestion)(normalizedLatestMessage);
    const asksForStatus = normalizedLatestMessage.includes("status") ||
        normalizedLatestMessage.includes("where is my order") ||
        normalizedLatestMessage.includes("track") ||
        normalizedLatestMessage.includes("shipment") ||
        normalizedLatestMessage.includes("shipping") ||
        normalizedLatestMessage.includes("ship today") ||
        (0, emailWorkHeuristics_1.hasShippingDeadlineRequest)(normalizedLatestMessage);
    const asksForGeneralUpdate = normalizedLatestMessage.includes("please update") ||
        normalizedLatestMessage.includes("send me") ||
        normalizedLatestMessage.includes("let me know once");
    const hasExplicitConfirmationRequest = (0, emailWorkHeuristics_1.hasConfirmationRequest)(normalizedLatestMessage);
    const hasLogisticsContext = (0, emailWorkHeuristics_1.hasLogisticsCoordinationSignals)(normalizedLatestMessage);
    if (isInternalOperations) {
        return "general_support";
    }
    if (hasOperationalLogisticsScheduling) {
        return "operational_logistics_scheduling";
    }
    if (hasExplicitConfirmationRequest && hasLogisticsContext) {
        return "operational_confirmation";
    }
    if (asksForPod) {
        return "pod_request";
    }
    if (asksToCancel) {
        return "cancellation_request";
    }
    if (reportsShortShipment) {
        return "short_shipment";
    }
    if (reportsDamage) {
        return "damaged_shipment";
    }
    if (asksForAddressChange) {
        return "address_change";
    }
    if (asksBillingQuestion) {
        return "billing_question";
    }
    if ((asksForStatus || reportsDuplicateShipment) && !asksForGeneralUpdate) {
        return "where_is_my_order";
    }
    if (asksForGeneralUpdate &&
        (normalizedEmail.includes("order") || normalizedEmail.includes("shipment") || normalizedEmail.includes("tracking"))) {
        return "where_is_my_order";
    }
    return "general_support";
}
function getUrgency(normalizedLatestMessage, normalizedEmail) {
    const latestUrgencySignal = (0, emailWorkHeuristics_1.getLatestUrgencySignal)(normalizedLatestMessage);
    const hasDeadlineRequest = (0, emailWorkHeuristics_1.hasShippingDeadlineRequest)(normalizedLatestMessage);
    const confirmationRequest = (0, emailWorkHeuristics_1.hasConfirmationRequest)(normalizedLatestMessage);
    const logisticsContext = (0, emailWorkHeuristics_1.hasLogisticsCoordinationSignals)(normalizedLatestMessage);
    const operationalTimingSignal = (0, emailWorkHeuristics_1.hasOperationalTimingSignal)(normalizedLatestMessage);
    const hasOperationalLogisticsScheduling = (0, emailWorkHeuristics_1.hasOperationalLogisticsSchedulingSignals)(normalizedLatestMessage);
    if ((0, emailWorkHeuristics_1.isInternalOperationsThread)(normalizedLatestMessage) ||
        (0, emailWorkHeuristics_1.isInternalOperationsThread)(normalizedEmail)) {
        return "low";
    }
    if (LOW_URGENCY_KEYWORDS.some((keyword) => normalizedLatestMessage.includes(keyword)) &&
        !(0, emailWorkHeuristics_1.hasClearRequest)(normalizedLatestMessage)) {
        return "low";
    }
    if (latestUrgencySignal === "high" && ((0, emailWorkHeuristics_1.hasClearRequest)(normalizedLatestMessage) || hasDeadlineRequest)) {
        return "high";
    }
    if (latestUrgencySignal === "medium" && ((0, emailWorkHeuristics_1.hasClearRequest)(normalizedLatestMessage) || hasDeadlineRequest)) {
        return "medium";
    }
    if (hasOperationalLogisticsScheduling) {
        return (0, emailWorkHeuristics_1.hasOperationalLogisticsFailureOrEscalationSignals)(normalizedLatestMessage) ||
            ((0, emailWorkHeuristics_1.hasOperationalLogisticsScheduleConflict)(normalizedLatestMessage) && latestUrgencySignal === "high")
            ? "high"
            : "medium";
    }
    if (hasDeadlineRequest) {
        return normalizedLatestMessage.includes("today") ||
            normalizedLatestMessage.includes("tomorrow") ||
            normalizedLatestMessage.includes("overnight") ||
            normalizedLatestMessage.includes("same day")
            ? "high"
            : "medium";
    }
    if (confirmationRequest && logisticsContext) {
        return latestUrgencySignal === "high" || operationalTimingSignal ? "high" : "medium";
    }
    if ((0, emailWorkHeuristics_1.hasClearRequest)(normalizedLatestMessage)) {
        return latestUrgencySignal === "high" || normalizedEmail.includes("urgent") || normalizedEmail.includes("asap")
            ? "high"
            : "medium";
    }
    return "medium";
}
function getConfidence(intent, orderNumber) {
    if (orderNumber && intent !== "general_support") {
        return "high";
    }
    if (intent !== "general_support") {
        return "medium";
    }
    return "low";
}
function getRisks(normalizedLatestMessage) {
    if ((0, emailWorkHeuristics_1.isInternalOperationsThread)(normalizedLatestMessage) ||
        (0, emailWorkHeuristics_1.isVendorSalesOutreach)(normalizedLatestMessage)) {
        return [];
    }
    const risks = [];
    if (normalizedLatestMessage.includes("waiting for several days") || normalizedLatestMessage.includes("no update")) {
        risks.push("delay_or_no_tracking_update");
    }
    if (normalizedLatestMessage.includes("delayed") ||
        normalizedLatestMessage.includes("delay") ||
        normalizedLatestMessage.includes("tracking has not moved") ||
        normalizedLatestMessage.includes("tracking hasn't moved") ||
        normalizedLatestMessage.includes("no movement")) {
        risks.push("delay_or_no_tracking_update");
    }
    if (normalizedLatestMessage.includes("frustrated")) {
        risks.push("customer_frustration");
    }
    if (normalizedLatestMessage.includes("still have not received") ||
        normalizedLatestMessage.includes("did not receive") ||
        normalizedLatestMessage.includes("not received")) {
        risks.push("delivered_not_received");
    }
    if (normalizedLatestMessage.includes("proof of delivery") ||
        normalizedLatestMessage.includes("pod") ||
        normalizedLatestMessage.includes("delivery receipt")) {
        risks.push("pod_needed");
    }
    if (normalizedLatestMessage.includes("cancel order") ||
        normalizedLatestMessage.includes("cancel my order") ||
        normalizedLatestMessage.includes("please cancel") ||
        normalizedLatestMessage.includes("cancel all") ||
        normalizedLatestMessage.includes("once canceled")) {
        risks.push("cancellation_review_needed");
    }
    if (normalizedLatestMessage.includes("short shipment") ||
        normalizedLatestMessage.includes("missing item") ||
        normalizedLatestMessage.includes("missing items") ||
        normalizedLatestMessage.includes("only received")) {
        risks.push("missing_items_reported");
    }
    if (normalizedLatestMessage.includes("damaged") ||
        normalizedLatestMessage.includes("broken") ||
        normalizedLatestMessage.includes("arrived crushed")) {
        risks.push("damage_reported");
    }
    if (normalizedLatestMessage.includes("change the address") ||
        normalizedLatestMessage.includes("update the address") ||
        normalizedLatestMessage.includes("wrong address")) {
        risks.push("address_correction_needed");
    }
    if (normalizedLatestMessage.includes("duplicate shipment") ||
        normalizedLatestMessage.includes("duplicate order") ||
        normalizedLatestMessage.includes("received two") ||
        normalizedLatestMessage.includes("sent twice")) {
        risks.push("duplicate_shipment_possible");
    }
    if ((0, emailWorkHeuristics_1.hasActualBillingQuestion)(normalizedLatestMessage)) {
        risks.push("billing_discrepancy");
    }
    return Array.from(new Set(risks));
}
function getSummary(intent, urgency, normalizedLatestMessage, analysis) {
    const referenceLabel = (0, caseIdentifiers_1.getIdentifierReferenceLabel)(analysis);
    const hasDeadlineRequest = (0, emailWorkHeuristics_1.hasShippingDeadlineRequest)(normalizedLatestMessage);
    if (intent === "pod_request") {
        return referenceLabel
            ? `Customer is requesting proof of delivery for ${referenceLabel}.`
            : "Customer is requesting proof of delivery but did not include a usable identifier.";
    }
    if (intent === "cancellation_request") {
        return referenceLabel
            ? `Customer wants to cancel ${referenceLabel}.`
            : "Customer wants to cancel an order and is asking for confirmation.";
    }
    if (intent === "short_shipment") {
        return referenceLabel
            ? `Customer reports missing items tied to ${referenceLabel}.`
            : "Customer reports a short shipment or missing items.";
    }
    if (intent === "damaged_shipment") {
        return referenceLabel
            ? `Customer reports damage tied to ${referenceLabel}.`
            : "Customer reports a damaged shipment.";
    }
    if (intent === "address_change") {
        return referenceLabel
            ? `Customer is requesting an address change for ${referenceLabel}.`
            : "Customer wants to update the shipping address.";
    }
    if (intent === "billing_question") {
        return referenceLabel
            ? `Customer has a billing or invoice question tied to ${referenceLabel}.`
            : "Customer has a billing or invoice question.";
    }
    if (intent === "operational_confirmation") {
        return referenceLabel
            ? `Customer provided inbound or logistics details for ${referenceLabel} and requested confirmation of receipt or follow-up once the event occurs.`
            : "Customer provided inbound or logistics details and requested confirmation of receipt or follow-up once the event occurs.";
    }
    if (intent === "operational_logistics_scheduling" ||
        intent === "routing_coordination" ||
        intent === "carrier_pickup_scheduling") {
        return (0, emailWorkHeuristics_1.hasOperationalLogisticsScheduleConflict)(normalizedLatestMessage)
            ? "Operational logistics scheduling email needs alternate pickup or routing coordination."
            : "Operational logistics scheduling email provides pickup/routing details and asks AP Express to reply only if the date/time does not work.";
    }
    if (intent === "where_is_my_order") {
        if (hasDeadlineRequest) {
            return referenceLabel
                ? `Customer needs shipping or delivery timing confirmation for ${referenceLabel}.`
                : "Customer needs shipping or delivery timing confirmation and expects a current update.";
        }
        return referenceLabel
            ? `Customer is requesting a status update for ${referenceLabel}.`
            : "Customer is asking for an order update but did not provide a usable identifier.";
    }
    if (hasDeadlineRequest) {
        return referenceLabel
            ? `Customer needs ship-timing confirmation for ${referenceLabel}.`
            : "Customer needs ship-timing confirmation and expects a current update.";
    }
    if (urgency === "low") {
        return "Customer shared a low-urgency informational support message.";
    }
    return "Customer sent a general support request.";
}
