"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatCaseForReview = formatCaseForReview;
exports.formatRawCaseJson = formatRawCaseJson;
const analysisTaxonomy_1 = require("./analysisTaxonomy");
const pilotQueueState_1 = require("./pilotQueueState");
function formatReceivedTime(receivedAt) {
    return new Date(receivedAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}
function getPriorityLabel(priorityScore) {
    if (priorityScore >= 70) {
        return "High";
    }
    if (priorityScore >= 40) {
        return "Medium";
    }
    return "Low";
}
function getSourceLabel(item) {
    if (item.email.source === "outlook_graph" || item.email.source === "outlook_import") {
        return "Outlook";
    }
    if (item.email.source === "seeded") {
        return "Seeded";
    }
    if (item.email.provider) {
        return item.email.provider;
    }
    return "";
}
function getActionabilityLabel(actionability) {
    switch (actionability) {
        case "action_required":
            return "Action required";
        case "awareness_only":
            return "Awareness only";
        case "no_action_needed":
            return "No action needed";
        case "review_needed":
            return "Review needed";
        default:
            return "Not available";
    }
}
function getReplyNeededLabel(replyNeeded) {
    switch (replyNeeded) {
        case "yes":
            return "Reply recommended";
        case "no":
            return "Reply not recommended";
        case "maybe":
            return "Reply optional";
        default:
            return "Not available";
    }
}
function getPilotStateLabel(pilotItemState) {
    if (!pilotItemState) {
        return "Not available";
    }
    const view = (0, pilotQueueState_1.getPilotQueueViewForItem)(pilotItemState);
    switch (view) {
        case "waiting_on_customer":
            return "Waiting on Customer";
        case "snoozed":
            return "Snoozed";
        case "done":
            return "Done";
        case "not_relevant":
            return "Not Relevant";
        case "active":
        default:
            return "Active";
    }
}
function formatCaseForReview(options) {
    const { item, pilotItemState, orderDataMessage } = options;
    const bodyText = item.email.body.trim() || item.email.previewText?.trim() || "";
    const sourceLabel = getSourceLabel(item);
    if (item.status !== "processed" || !item.result) {
        const lines = [
            `Subject: ${item.email.subject}`,
            `From: ${item.email.senderName} <${item.email.senderEmail}>`,
            `Received: ${formatReceivedTime(item.email.receivedAt)}`,
            "",
            "Email Body:",
            bodyText || "...",
        ];
        if (sourceLabel) {
            lines.splice(3, 0, `Source: ${sourceLabel}`);
        }
        if (item.processingError) {
            lines.push("", "Notes:", item.processingError);
        }
        return lines.join("\n");
    }
    const lines = [
        `Subject: ${item.email.subject}`,
        `From: ${item.email.senderName} <${item.email.senderEmail}>`,
        `Received: ${formatReceivedTime(item.email.receivedAt)}`,
        "",
        "Email Body:",
        bodyText || "...",
        "",
        "Summary:",
        item.result.analysis.summary || "...",
        "",
        `Intent: ${(0, analysisTaxonomy_1.getIntentLabel)(item.result.analysis.intent)}`,
        `Urgency: ${item.result.analysis.urgency}`,
        `Priority: ${getPriorityLabel(item.result.priorityScore)} (${item.result.priorityScore})`,
        `Risks: ${item.result.analysis.risks.length > 0
            ? item.result.analysis.risks.map((risk) => (0, analysisTaxonomy_1.getRiskLabel)(risk)).join("; ")
            : "None"}`,
        `Next Action: ${item.result.analysis.nextAction || "Not available"}`,
        `Reply Draft: ${item.result.replyDraft || "Reply not recommended / no draft available."}`,
    ];
    if (sourceLabel) {
        lines.splice(3, 0, `Source: ${sourceLabel}`);
    }
    if (item.result.analysis.actionability) {
        lines.push(`Actionability: ${getActionabilityLabel(item.result.analysis.actionability)}`);
    }
    if (item.result.analysis.replyNeeded) {
        lines.push(`Reply Needed: ${getReplyNeededLabel(item.result.analysis.replyNeeded)}`);
    }
    if (pilotItemState) {
        lines.push("", `Pilot Queue State: ${getPilotStateLabel(pilotItemState)}`);
        if (pilotItemState.usefulness === "helpful") {
            lines.push("Helpful State: Helpful");
        }
        else if (pilotItemState.usefulness === "not_helpful") {
            lines.push("Helpful State: Not Helpful");
        }
    }
    if (item.result.orderContext) {
        lines.push("", "Order Context:", `Order Number: ${item.result.orderContext.orderNumber}`, `Status: ${item.result.orderContext.status}`, `Shipment Status: ${item.result.orderContext.shipmentStatus}`, `Last Updated: ${item.result.orderContext.lastUpdated}`);
    }
    else if (item.result.analysis.orderNumber && orderDataMessage) {
        lines.push("", `Order Context: ${orderDataMessage}`);
    }
    if (item.result.warning) {
        lines.push("", `Warning: ${item.result.warning}`);
    }
    return lines.join("\n");
}
function formatRawCaseJson(options) {
    return JSON.stringify({
        item: options.item,
        pilotItemState: options.pilotItemState,
        orderDataMessage: options.orderDataMessage,
    }, null, 2);
}
