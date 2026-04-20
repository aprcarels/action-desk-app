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
        return "This appears to be a vendor or account-maintenance thread. Review internally and reply only if your team intentionally owns the request.";
    }
    if (workType === "internal") {
        return "Internal or awareness-only message. Keep it visible for review only and avoid sending a customer-service reply.";
    }
    if (workType === "unknown") {
        return "This message is not clearly a customer-service case. Review first and confirm ownership before replying.";
    }
    if (replyNeeded === "no" || actionability === "no_action_needed") {
        return "No direct reply is recommended right now. Keep this for awareness and verify in WMS only if follow-up becomes necessary.";
    }
    if (actionability === "awareness_only") {
        return "No immediate customer action is requested. Keep this visible for awareness and review only if a follow-up request comes in.";
    }
    if (messageType === "internal_alert" || actionability === "review_needed") {
        return "Review the alert or informational message, confirm whether any manual follow-up is needed, and avoid replying unless ownership or customer follow-up is explicitly requested.";
    }
    if (intent === "pod_request") {
        return orderNumber
            ? orderContext?.shipmentStatus === "Delivered"
                ? `Pull the POD ${orderLabel}, confirm who signed, and send the delivery record back to the customer.`
                : `Review the latest delivery status ${orderLabel}, confirm whether POD is available yet, and update the customer.`
            : hasIdentifiers
                ? `Review the delivery details for ${referenceLabel ?? reviewLabel}, confirm whether POD is available, and update the customer.`
                : "Ask for the order number so the delivery record and POD can be retrieved.";
    }
    if (intent === "cancellation_request") {
        return orderNumber
            ? orderContext?.status === "Processing" || orderContext?.shipmentStatus === "Label Created"
                ? `Try to stop fulfillment ${orderLabel}, confirm whether cancellation is still possible, and reply with the outcome.`
                : `Confirm whether ${orderLabel} has already shipped, then advise the customer on cancellation or return options.`
            : hasIdentifiers
                ? `Review ${reviewLabel}, confirm whether cancellation can still be honored, and reply with the next step.`
                : "Ask for the order number so cancellation eligibility can be checked.";
    }
    if (intent === "short_shipment") {
        return orderNumber
            ? `Review the shipped quantity ${orderLabel}, confirm which items are short, and reply with the replacement or credit plan.`
            : hasIdentifiers
                ? `Review ${reviewLabel}, confirm which items are short, and reply with the replacement or credit plan.`
                : "Ask for the order number so the shipment contents can be checked against the order.";
    }
    if (intent === "damaged_shipment") {
        return orderNumber
            ? `Document the reported damage ${orderLabel}, confirm replacement or claim steps, and send the resolution plan.`
            : hasIdentifiers
                ? `Document the reported damage tied to ${reviewLabel}, confirm replacement or claim steps, and send the resolution plan.`
                : "Ask for the order number so the damaged shipment can be reviewed and next steps confirmed.";
    }
    if (intent === "address_change") {
        return orderNumber
            ? orderContext?.status === "Processing" || orderContext?.shipmentStatus === "Label Created"
                ? `Check whether the ship-to address can still be corrected ${orderLabel}, update it if allowed, and confirm back to the customer.`
                : `Confirm whether ${orderLabel} is already too far in transit for an address change, then reply with the available options.`
            : hasIdentifiers
                ? `Review the requested change for ${reviewLabel} and confirm the available next step.`
                : "Ask for the order number so the address change request can be reviewed.";
    }
    if (intent === "billing_question") {
        return orderNumber
            ? `Review the invoice and charges ${orderLabel}, confirm the source of the discrepancy, and reply with the correction or explanation.`
            : hasIdentifiers
                ? `Review the billing details tied to ${reviewLabel} and reply with the correction or explanation.`
                : "Ask for the order number or invoice reference so the billing issue can be reviewed.";
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
                ? `Review ${reviewLabel}, confirm the latest status tied to the referenced identifier, and send the customer a neutral update.`
                : "Ask the customer for the order number so the shipment can be located before sending a status update.";
        }
        if (hasDuplicateShipmentRisk) {
            return `Check shipment history and tracking ${orderLabel}, confirm whether a duplicate shipment was released, and reply with the resolution.`;
        }
        if (hasMissingDeliveryRisk) {
            return `Review the delivery scan and carrier notes ${orderLabel}, check for misdelivery, and update the customer on the investigation.`;
        }
        if (orderContext?.shipmentStatus === "Exception" || orderContext?.status === "Delayed") {
            return `Review the carrier exception ${orderLabel}, confirm the latest movement and delay reason, and send the customer a concrete update.`;
        }
        if (statusLabel) {
            return `Verify the latest shipment status (${statusLabel}) ${orderLabel}, then send the customer the current tracking update.`;
        }
        if (hasDelayRisk) {
            return `Check the latest shipment scan ${orderLabel}, confirm why updates have stalled, and reply with the next expected movement.`;
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
        return `Review ${reviewLabel} and reply with the next support step.`;
    }
    if (orderNumber) {
        return `Review the latest order details ${orderLabel} and reply with the next support step.`;
    }
    if (urgency === "high") {
        return "Review the request promptly, identify the missing details needed to act, and send the customer a clear next step.";
    }
    return "Review the request details and reply with the next support step.";
}
