"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapPriorityScoreToBand = mapPriorityScoreToBand;
exports.mapActionDeskResultToPriorityReasons = mapActionDeskResultToPriorityReasons;
exports.mapSnapshotToPriorityReasons = mapSnapshotToPriorityReasons;
function hasBreakdownLabel(breakdown, pattern) {
    return breakdown?.some((item) => item.label.toLowerCase().includes(pattern)) ?? false;
}
function hasRisk(result, risk) {
    return result.analysis.risks.includes(risk);
}
function mapPriorityScoreToBand(priorityScore) {
    if (priorityScore >= 85) {
        return "critical";
    }
    if (priorityScore >= 70) {
        return "high";
    }
    if (priorityScore >= 40) {
        return "normal";
    }
    return "low";
}
function mapActionDeskResultToPriorityReasons(result) {
    const reasons = new Set();
    if (result.analysis.replyNeeded === "yes" ||
        result.analysis.replyNeeded === "recommended") {
        reasons.add("customer_follow_up");
    }
    if (result.analysis.messageType === "customer_request" && result.analysis.actionability === "action_required") {
        reasons.add("new_unread");
    }
    if (result.analysis.hasDeadlineRequest ||
        hasBreakdownLabel(result.priorityBreakdown, "Deadline-driven shipping request") ||
        hasBreakdownLabel(result.priorityBreakdown, "Requested timing may already be past due")) {
        reasons.add("sla_risk");
    }
    if (hasRisk(result, "delay_or_no_tracking_update") ||
        hasBreakdownLabel(result.priorityBreakdown, "Missing or delayed order updates")) {
        reasons.add("missing_tracking");
        reasons.add("aging_unanswered");
    }
    if (hasRisk(result, "delivered_not_received") ||
        result.orderContext?.shipmentStatus === "Exception" ||
        result.orderContext?.status === "Delayed") {
        reasons.add("delivery_exception");
    }
    if (hasRisk(result, "damage_reported")) {
        reasons.add("damaged_order");
    }
    if (result.analysis.intent === "billing_question" ||
        hasRisk(result, "billing_discrepancy") ||
        result.analysis.intent === "cancellation_request") {
        reasons.add("refund_request");
    }
    if (hasRisk(result, "customer_frustration")) {
        reasons.add("angry_tone");
    }
    return Array.from(reasons);
}
function mapSnapshotToPriorityReasons(snapshot) {
    if (snapshot.priorityReasons.length > 0) {
        return [...snapshot.priorityReasons];
    }
    if (snapshot.priorityScore >= 85) {
        return ["sla_risk"];
    }
    if (snapshot.priorityScore >= 70) {
        return ["customer_follow_up"];
    }
    return [];
}
