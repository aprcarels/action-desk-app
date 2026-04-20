"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveIssueType = deriveIssueType;
exports.getIssueTypeLabel = getIssueTypeLabel;
exports.getIssueTypeDraftExplanation = getIssueTypeDraftExplanation;
const caseIdentifiers_1 = require("../services/caseIdentifiers");
function deriveIssueType(analysis, orderContext) {
    if (analysis.risks.includes("delivered_not_received")) {
        return "delivered_not_received";
    }
    if (analysis.risks.includes("delay_or_no_tracking_update") ||
        orderContext?.shipmentStatus === "Delayed" ||
        orderContext?.shipmentStatus === "Exception") {
        return "delayed_shipment";
    }
    if (analysis.intent === "where_is_my_order" &&
        !analysis.orderNumber &&
        !orderContext &&
        !(0, caseIdentifiers_1.hasCaseIdentifiers)(analysis)) {
        return "missing_order";
    }
    return "general_issue";
}
function getIssueTypeLabel(issueType) {
    switch (issueType) {
        case "delivered_not_received":
            return "Delivered but not received";
        case "delayed_shipment":
            return "Delayed shipment";
        case "missing_order":
            return "Missing order details";
        case "general_issue":
        default:
            return "General issue";
    }
}
function getIssueTypeDraftExplanation(issueType) {
    switch (issueType) {
        case "delivered_not_received":
            return "This draft uses a more empathetic tone and suggests confirming delivery details.";
        case "delayed_shipment":
            return "This draft acknowledges the delay and explains that shipment status is being reviewed.";
        case "missing_order":
            return "This draft asks for the order number or identifying information needed to investigate.";
        case "general_issue":
        default:
            return "This draft gives a general support acknowledgment and response.";
    }
}
