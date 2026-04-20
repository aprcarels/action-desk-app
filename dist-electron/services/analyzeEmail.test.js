"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const analyzeEmail_1 = require("./analyzeEmail");
const analysisInput_1 = require("./analysisInput");
(0, vitest_1.describe)("analyzeEmail", () => {
    (0, vitest_1.it)("does not classify alert-style notifications as where_is_my_order", () => {
        const analysis = (0, analyzeEmail_1.analyzeEmail)("Automated alert: shipment exception notification for ORD-1001. FYI only, no action needed.");
        (0, vitest_1.expect)(analysis.intent).toBe("general_support");
        (0, vitest_1.expect)(analysis.messageType).toBe("internal_alert");
        (0, vitest_1.expect)(analysis.actionability).toBe("no_action_needed");
        (0, vitest_1.expect)(analysis.replyNeeded).toBe("no");
    });
    (0, vitest_1.it)("downgrades FYI messages to low urgency", () => {
        const analysis = (0, analyzeEmail_1.analyzeEmail)("FYI - just letting you know the carrier posted a delay. No action needed right now.");
        (0, vitest_1.expect)(analysis.urgency).toBe("low");
        (0, vitest_1.expect)(analysis.actionability).toBe("no_action_needed");
    });
    (0, vitest_1.it)("keeps actionable customer requests actionable", () => {
        const analysis = (0, analyzeEmail_1.analyzeEmail)("Hi support, where is my order ORD-1002? Please help and send me an update today.");
        (0, vitest_1.expect)(analysis.intent).toBe("where_is_my_order");
        (0, vitest_1.expect)(analysis.actionability).toBe("action_required");
        (0, vitest_1.expect)(analysis.replyNeeded).toBe("yes");
    });
    (0, vitest_1.it)("treats a direct cancel request as actionable customer work", () => {
        const analysis = (0, analyzeEmail_1.analyzeEmail)("Please cancel all of those PTs. Pls confirm once canceled.");
        (0, vitest_1.expect)(analysis.intent).toBe("cancellation_request");
        (0, vitest_1.expect)(analysis.actionability).toBe("action_required");
        (0, vitest_1.expect)(analysis.replyNeeded).toBe("yes");
        (0, vitest_1.expect)(analysis.hasClearRequest).toBe(true);
    });
    (0, vitest_1.it)("treats a polite explicit cancellation request as actionable even when it starts with thanks", () => {
        const analysis = (0, analyzeEmail_1.analyzeEmail)("Thanks for sending that over, Please cancel all of those PTs since the only style on them is TGWD15+MUL and we will put it on a new PO. Pls confirm once canceled");
        (0, vitest_1.expect)(analysis.intent).toBe("cancellation_request");
        (0, vitest_1.expect)(analysis.summary.toLowerCase()).not.toContain("informational");
        (0, vitest_1.expect)(analysis.actionability).toBe("action_required");
        (0, vitest_1.expect)(analysis.replyNeeded).toBe("yes");
        (0, vitest_1.expect)(analysis.urgency).toBe("medium");
    });
    (0, vitest_1.it)("keeps a short polite request actionable when it contains a clear ask", () => {
        const analysis = (0, analyzeEmail_1.analyzeEmail)("Could you please update the shipping address and confirm?");
        (0, vitest_1.expect)(analysis.actionability).toBe("action_required");
        (0, vitest_1.expect)(analysis.replyNeeded).toBe("yes");
        (0, vitest_1.expect)(analysis.hasClearRequest).toBe(true);
    });
    (0, vitest_1.it)("does not classify internal operations language as where_is_my_order", () => {
        const analysis = (0, analyzeEmail_1.analyzeEmail)("Please review the stock transfer and cycle count variance before we allocate inventory for this rework product.");
        (0, vitest_1.expect)(analysis.intent).toBe("general_support");
        (0, vitest_1.expect)(analysis.workType).toBe("internal");
        (0, vitest_1.expect)(analysis.replyNeeded).toBe("no");
    });
    (0, vitest_1.it)("follows the latest ask over older quoted informational content", () => {
        const analysis = (0, analyzeEmail_1.analyzeEmail)([
            "Please cancel these and confirm once canceled.",
            "",
            "From: Operations",
            "Sent: earlier",
            "Subject: Prior note",
            "FYI only, no action needed right now.",
        ].join("\n"));
        (0, vitest_1.expect)(analysis.intent).toBe("cancellation_request");
        (0, vitest_1.expect)(analysis.actionability).toBe("action_required");
        (0, vitest_1.expect)(analysis.replyNeeded).toBe("yes");
    });
    (0, vitest_1.it)("treats suspicious messages as non-customer-service work", () => {
        const analysis = (0, analyzeEmail_1.analyzeEmail)("Phishing attempt reported for awareness. This looks suspicious and no customer reply is needed.");
        (0, vitest_1.expect)(analysis.intent).toBe("general_support");
        (0, vitest_1.expect)(analysis.workType).toBe("suspicious");
        (0, vitest_1.expect)(analysis.replyNeeded).toBe("no");
    });
    (0, vitest_1.it)("uses order references from the subject before claiming no order number was provided", () => {
        const analysis = (0, analyzeEmail_1.analyzeEmail)((0, analysisInput_1.buildAnalysisInput)({
            subject: "Tracking request for orders 162702 / 162740",
            body: "Please send an update on these shipments.",
        }));
        (0, vitest_1.expect)(analysis.orderNumber).toBe("162702");
        (0, vitest_1.expect)(analysis.caseIdentifiers?.map((identifier) => identifier.value)).toEqual(["162702", "162740"]);
        (0, vitest_1.expect)(analysis.summary.toLowerCase()).not.toContain("did not provide");
        (0, vitest_1.expect)(analysis.nextAction.toLowerCase()).not.toContain("ask the customer for the order number");
    });
    (0, vitest_1.it)("treats stock transfer identifiers as usable case references", () => {
        const analysis = (0, analyzeEmail_1.analyzeEmail)((0, analysisInput_1.buildAnalysisInput)({
            subject: "Status on stock transfer 1001-009313",
            body: "Can you confirm where this stands?",
        }));
        (0, vitest_1.expect)(analysis.orderNumber).toBeUndefined();
        (0, vitest_1.expect)(analysis.caseIdentifiers?.[0]).toMatchObject({
            value: "1001-009313",
            kind: "transfer",
            source: "subject",
        });
        (0, vitest_1.expect)(analysis.nextAction.toLowerCase()).not.toContain("ask");
        (0, vitest_1.expect)(analysis.nextAction.toLowerCase()).not.toContain("order number");
    });
    (0, vitest_1.it)("uses rework identifiers from the body to avoid false missing-order language", () => {
        const analysis = (0, analyzeEmail_1.analyzeEmail)([
            "Please review rework R0130-26LA and send the latest status.",
            "",
            "From: Prior Sender",
            "Sent: earlier",
            "Original thread below",
        ].join("\n"));
        (0, vitest_1.expect)(analysis.caseIdentifiers?.some((identifier) => identifier.value === "R0130-26LA")).toBe(true);
        (0, vitest_1.expect)(analysis.summary.toLowerCase()).not.toContain("did not provide");
        (0, vitest_1.expect)(analysis.nextAction.toLowerCase()).not.toContain("order number");
    });
    (0, vitest_1.it)("raises urgency for urgent ship-today confirmation requests", () => {
        const analysis = (0, analyzeEmail_1.analyzeEmail)([
            "HOT! Please confirm this will be shipping today.",
            "We need these shipped today via standard overnight.",
        ].join(" "));
        (0, vitest_1.expect)(analysis.intent).toBe("where_is_my_order");
        (0, vitest_1.expect)(analysis.actionability).toBe("action_required");
        (0, vitest_1.expect)(analysis.urgency).toBe("high");
        (0, vitest_1.expect)(analysis.summary.toLowerCase()).toContain("shipping or delivery timing confirmation");
        (0, vitest_1.expect)(analysis.nextAction.toLowerCase()).toContain("ship-timing request");
    });
    (0, vitest_1.it)("keeps normal shipping confirmation asks actionable without forcing high urgency", () => {
        const analysis = (0, analyzeEmail_1.analyzeEmail)("Please confirm the current shipping status for order ORD-1002 when you have a chance.");
        (0, vitest_1.expect)(analysis.intent).toBe("where_is_my_order");
        (0, vitest_1.expect)(analysis.actionability).toBe("action_required");
        (0, vitest_1.expect)(analysis.urgency).toBe("medium");
    });
    (0, vitest_1.it)("keeps awareness-only messages low urgency even when older quoted text was urgent", () => {
        const analysis = (0, analyzeEmail_1.analyzeEmail)([
            "FYI only. No action needed right now.",
            "",
            "From: Customer",
            "Sent: earlier",
            "Subject: Earlier urgent thread",
            "HOT! We need these shipped today via standard overnight.",
        ].join("\n"));
        (0, vitest_1.expect)(analysis.urgency).toBe("low");
        (0, vitest_1.expect)(analysis.actionability).toBe("no_action_needed");
    });
    (0, vitest_1.it)("does not inherit urgency from quoted history in short continuation replies", () => {
        const analysis = (0, analyzeEmail_1.analyzeEmail)([
            "Thanks.",
            "",
            "From: Customer",
            "Sent: earlier",
            "Subject: Earlier urgent thread",
            "HOT! Please confirm this will be shipping today.",
        ].join("\n"));
        (0, vitest_1.expect)(analysis.isThreadContinuation).toBe(true);
        (0, vitest_1.expect)(analysis.urgency).toBe("low");
        (0, vitest_1.expect)(analysis.actionability).toBe("review_needed");
    });
    (0, vitest_1.it)("keeps vendor coordination de-emphasized even when overnight language appears", () => {
        const analysis = (0, analyzeEmail_1.analyzeEmail)("FYI vendor portal setup note for standard overnight settings. No action needed right now.");
        (0, vitest_1.expect)(analysis.workType).toBe("vendor");
        (0, vitest_1.expect)(analysis.urgency).toBe("low");
        (0, vitest_1.expect)(analysis.replyNeeded).toBe("no");
    });
    (0, vitest_1.it)("detects inbound logistics confirmation requests as actionable reply-needed work", () => {
        const analysis = (0, analyzeEmail_1.analyzeEmail)([
            "Inbound container ETA 4/3. Shipment reference INBSHIP-2048.",
            "Please confirm receipt of this email and confirm once the container has dropped.",
        ].join(" "));
        (0, vitest_1.expect)(analysis.intent).toBe("operational_confirmation");
        (0, vitest_1.expect)(analysis.actionability).toBe("action_required");
        (0, vitest_1.expect)(analysis.replyNeeded).toBe("yes");
        (0, vitest_1.expect)(analysis.hasConfirmationRequest).toBe(true);
        (0, vitest_1.expect)(analysis.hasLogisticsContext).toBe(true);
    });
    (0, vitest_1.it)("uses logistics confirmation wording instead of bland general support summaries", () => {
        const analysis = (0, analyzeEmail_1.analyzeEmail)([
            "Inbound container details below.",
            "Appointment is scheduled for tomorrow at 8am and trailer is assigned.",
            "Please confirm receipt and advise once complete.",
        ].join(" "));
        (0, vitest_1.expect)(analysis.summary.toLowerCase()).toContain("requested confirmation");
        (0, vitest_1.expect)(analysis.nextAction.toLowerCase()).toContain("acknowledge receipt");
        (0, vitest_1.expect)(analysis.nextAction.toLowerCase()).toContain("confirm back once");
    });
    (0, vitest_1.it)("raises urgency for time-bound logistics confirmation requests", () => {
        const analysis = (0, analyzeEmail_1.analyzeEmail)([
            "Container 1234567 has a drop ETA for tomorrow morning.",
            "Please confirm receipt and confirm once dropped.",
        ].join(" "));
        (0, vitest_1.expect)(analysis.intent).toBe("operational_confirmation");
        (0, vitest_1.expect)(analysis.urgency).toBe("high");
    });
    (0, vitest_1.it)("does not over-promote logistics notices that have no actual ask", () => {
        const analysis = (0, analyzeEmail_1.analyzeEmail)("Inbound container ETA tomorrow morning. Appointment is scheduled and driver has been dispatched for the drop.");
        (0, vitest_1.expect)(analysis.intent).toBe("general_support");
        (0, vitest_1.expect)(analysis.hasConfirmationRequest).toBe(false);
        (0, vitest_1.expect)(analysis.actionability).not.toBe("action_required");
        (0, vitest_1.expect)(analysis.urgency).toBe("medium");
    });
});
