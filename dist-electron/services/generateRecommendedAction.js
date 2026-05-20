"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRecommendedAction = generateRecommendedAction;
const caseIdentifiers_1 = require("./caseIdentifiers");
function hasRisk(risks, risk) {
    return risks.includes(risk);
}
function getOrderLabel(orderNumber) {
    return orderNumber ? `for ${orderNumber}` : "for the order";
}
function requestMissingIdentifierAction(context) {
    return `Request the order number or usable reference for ${context}, then mark waiting on customer until it is provided.`;
}
function isOperationalLogisticsIntent(intent) {
    return (intent === "operational_logistics_scheduling" ||
        intent === "routing_coordination" ||
        intent === "carrier_pickup_scheduling");
}
function generateRecommendedAction({ intent, urgency, risks, orderNumber, caseIdentifiers, hasDeadlineRequest, deadlineState, messageType, actionability, replyNeeded, workType, hasConfirmationRequest, hasLogisticsContext, hasOperationalTimingSignal, orderContext, }) {
    const orderLabel = getOrderLabel(orderNumber);
    const hasIdentifiers = (0, caseIdentifiers_1.hasCaseIdentifiers)({
        orderNumber,
        caseIdentifiers,
    });
    const referenceLabel = (0, caseIdentifiers_1.getIdentifierReferenceLabel)({
        orderNumber,
        caseIdentifiers,
    });
    const reviewLabel = (0, caseIdentifiers_1.getIdentifierReviewLabel)({
        orderNumber,
        caseIdentifiers,
    });
    const statusLabel = orderContext
        ? `${orderContext.status.toLowerCase()} / ${orderContext.shipmentStatus.toLowerCase()}`
        : null;
    const hasDelayRisk = hasRisk(risks, "delay_or_no_tracking_update");
    const hasMissingDeliveryRisk = hasRisk(risks, "delivered_not_received");
    const hasFrustrationRisk = hasRisk(risks, "customer_frustration");
    const hasDuplicateShipmentRisk = hasRisk(risks, "duplicate_shipment_possible");
    if (workType === "suspicious") {
        return "Review internally as suspicious or phishing-related mail. Do not send a customer-service reply unless ownership is confirmed.";
    }
    if (workType === "system") {
        return "No customer-service reply recommended. Keep this for awareness or route it internally only if follow-up is needed.";
    }
    if (workType === "vendor") {
        return "No customer-service action needed. Mark not relevant unless an internal owner intentionally wants to review the vendor or sales outreach.";
    }
    if (workType === "internal") {
        return "Internal or awareness-only message. Keep it visible for review only and avoid sending a customer-service reply.";
    }
    if (workType === "unknown") {
        return "This message is not clearly a customer-service case. Review first and confirm ownership before replying.";
    }
    if (isOperationalLogisticsIntent(intent)) {
        return "Review scheduled pickup details and confirm whether the date/time works. Reply only if alternate scheduling or pickup details are needed.";
    }
    if (replyNeeded === "no" || actionability === "no_action_needed") {
        return "No direct reply is recommended right now. Keep this for awareness and verify in WMS only if follow-up becomes necessary.";
    }
    if (actionability === "awareness_only") {
        return "No immediate customer action is requested. Keep this visible for awareness and review only if a follow-up request comes in.";
    }
    if (messageType === "internal_alert" || actionability === "review_needed") {
        return "Review the alert, confirm whether manual follow-up is needed, and avoid replying unless ownership or customer follow-up is explicit.";
    }
    if (intent === "pod_request") {
        return orderNumber
            ? orderContext?.shipmentStatus === "Delivered"
                ? `Pull the POD ${orderLabel}, verify the signed-by details, and send the delivery record to the customer.`
                : `Verify delivery status ${orderLabel}, check whether POD is available, and send a status update.`
            : hasIdentifiers
                ? `Verify delivery details for ${referenceLabel ?? reviewLabel}, check whether POD is available, and send a status update.`
                : requestMissingIdentifierAction("the POD request");
    }
    if (intent === "cancellation_request") {
        return orderNumber
            ? orderContext?.status === "Processing" || orderContext?.shipmentStatus === "Label Created"
                ? `Check fulfillment status ${orderLabel}, escalate to warehouse to stop shipment if possible, and reply with the cancellation outcome.`
                : `Verify shipped status ${orderLabel}, then send cancellation, return, or refund options.`
            : hasIdentifiers
                ? `Check fulfillment status for ${reviewLabel}, confirm whether cancellation can still be honored, and reply with the next step.`
                : requestMissingIdentifierAction("the cancellation request");
    }
    if (intent === "short_shipment") {
        return orderNumber
            ? `Check warehouse pick/pack and shipped quantity ${orderLabel}, confirm short items, and send the replacement or credit plan.`
            : hasIdentifiers
                ? `Check warehouse pick/pack and shipped quantity for ${reviewLabel}, confirm short items, and send the replacement or credit plan.`
                : requestMissingIdentifierAction("the short-shipment claim");
    }
    if (intent === "damaged_shipment") {
        return orderNumber
            ? `Document the damage ${orderLabel}, verify shipment details, and send the replacement or claim path.`
            : hasIdentifiers
                ? `Document the damage tied to ${reviewLabel}, verify shipment details, and send the replacement or claim path.`
                : requestMissingIdentifierAction("the damage report");
    }
    if (intent === "address_change") {
        return orderNumber
            ? orderContext?.status === "Processing" || orderContext?.shipmentStatus === "Label Created"
                ? `Confirm the corrected address, check whether ship-to can still be updated ${orderLabel}, and reply with the outcome.`
                : `Verify transit status ${orderLabel}, confirm whether an address change is still possible, and send available options.`
            : hasIdentifiers
                ? `Confirm the corrected address, review the requested change for ${reviewLabel}, and reply with the available next step.`
                : requestMissingIdentifierAction("the address change");
    }
    if (intent === "billing_question") {
        return orderNumber
            ? `Verify invoice, refund, or charge details ${orderLabel}, confirm the discrepancy, and reply with the correction or explanation.`
            : hasIdentifiers
                ? `Verify invoice, refund, or charge details tied to ${reviewLabel} and reply with the correction or explanation.`
                : requestMissingIdentifierAction("the billing or refund issue");
    }
    if (intent === "operational_confirmation") {
        if (hasOperationalTimingSignal) {
            return hasIdentifiers
                ? `Acknowledge receipt of the inbound or logistics details for ${reviewLabel}, monitor the scheduled delivery or drop timing, and confirm back once the container or delivery event occurs.`
                : "Acknowledge receipt of the inbound or logistics details, monitor the scheduled delivery or drop timing, and confirm back once the container or delivery event occurs.";
        }
        return hasIdentifiers
            ? `Acknowledge receipt of the inbound or logistics details for ${reviewLabel} and confirm back once the container, drop, or delivery event is completed.`
            : "Acknowledge receipt of the inbound or logistics details and confirm back once the container, drop, or delivery event is completed.";
    }
    if (intent === "where_is_my_order") {
        if (hasDeadlineRequest) {
            if (deadlineState === "past_due") {
                return orderNumber
                    ? `Review whether the requested ship or delivery window ${orderLabel} has already been missed, confirm the current status immediately, and update the customer with the next step.`
                    : hasIdentifiers
                        ? `Review whether the requested ship or delivery window for ${reviewLabel} has already been missed, confirm the current status immediately, and update the customer.`
                        : "Review the ship-timing request immediately, confirm whether the requested window may already have been missed, and ask for the missing identifier right away if needed.";
            }
            return orderNumber
                ? `Verify the current ship status or commit timing ${orderLabel}, confirm whether the requested expedite window is still possible, and update the customer.`
                : hasIdentifiers
                    ? `Review ${reviewLabel}, confirm the current ship timing or expedite options, and send the customer a neutral update.`
                    : "Review the current ship-timing request, confirm whether the order details are sufficient to verify the commit timing, and if not ask for the missing identifier right away.";
        }
        if (!orderNumber) {
            return hasIdentifiers
                ? `Verify status for ${reviewLabel}, then send the customer a clear status update.`
                : requestMissingIdentifierAction("the shipment status request");
        }
        if (hasDuplicateShipmentRisk) {
            return `Check shipment history and tracking ${orderLabel}, confirm whether a duplicate shipment was released, and reply with the resolution.`;
        }
        if (hasMissingDeliveryRisk) {
            return `Review delivery scan and carrier proof ${orderLabel}, check for misdelivery, and send an investigation update.`;
        }
        if (orderContext?.shipmentStatus === "Exception" || orderContext?.status === "Delayed") {
            return `Check carrier and warehouse scans ${orderLabel}, escalate to warehouse if movement is unclear, and send a delay update.`;
        }
        if (statusLabel) {
            return `Verify the latest shipment status (${statusLabel}) ${orderLabel}, then send the customer the current tracking update.`;
        }
        if (hasDelayRisk) {
            return `Follow up on delayed shipment scans ${orderLabel}, check warehouse status, and reply with the next expected movement.`;
        }
        return `Verify the latest shipment status ${orderLabel} and send the customer the current update.`;
    }
    if (intent === "general_support" && hasDeadlineRequest) {
        if (deadlineState === "past_due") {
            return hasIdentifiers
                ? `Review whether the requested timing for ${reviewLabel} has already been missed, confirm the current status immediately, and reply with the next support step.`
                : "Review whether the requested timing may already have been missed, confirm the current status immediately, and reply with the next support step.";
        }
        return hasIdentifiers
            ? `Review the current ship timing for ${reviewLabel}, confirm the latest status or expedite options, and reply with the next support step.`
            : "Review the current ship-timing request, confirm the latest status or expedite options, and reply with the next support step.";
    }
    if (hasConfirmationRequest && hasLogisticsContext) {
        return hasOperationalTimingSignal
            ? "Acknowledge receipt of the logistics details, review the scheduled timing, and confirm back once the container or delivery event occurs."
            : "Acknowledge receipt of the logistics details and confirm back once the requested operational event is completed.";
    }
    if (orderNumber && hasFrustrationRisk) {
        return `Review the latest order details ${orderLabel}, confirm the next clear step, and send the customer a direct update today.`;
    }
    if (hasIdentifiers) {
        if (hasDeadlineRequest && deadlineState === "past_due") {
            return `Review whether the requested timing for ${reviewLabel} has already passed, confirm the current status immediately, and reply with the next support step.`;
        }
        return `Review ${reviewLabel}, verify the current operational status, and reply with the next support step.`;
    }
    if (orderNumber) {
        return `Review latest order details ${orderLabel}, verify the current operational status, and reply with the next support step.`;
    }
    if (urgency === "high") {
        return "Identify the missing customer/order details, request them if needed, and send a clear next step today.";
    }
    return "Review request details, identify the next operational step, and reply with the clear next action.";
}
