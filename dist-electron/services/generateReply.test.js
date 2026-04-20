"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const generateReply_1 = require("./generateReply");
function buildAnalysis(overrides) {
    return {
        summary: "Customer is requesting a status update for order ORD-1002.",
        intent: "where_is_my_order",
        urgency: "medium",
        confidence: "medium",
        orderNumber: "ORD-1002",
        risks: [],
        nextAction: "Verify the latest shipment status.",
        messageType: "customer_request",
        actionability: "action_required",
        replyNeeded: "yes",
        ...overrides,
    };
}
(0, vitest_1.describe)("generateReply", () => {
    (0, vitest_1.it)("suppresses reply drafts for awareness-only emails", () => {
        const draft = (0, generateReply_1.generateReply)(buildAnalysis({
            intent: "general_support",
            messageType: "awareness_only",
            actionability: "awareness_only",
            replyNeeded: "no",
        }));
        (0, vitest_1.expect)(draft).toBe("");
    });
    (0, vitest_1.it)("suppresses reply drafts for non-customer-service work types", () => {
        const draft = (0, generateReply_1.generateReply)(buildAnalysis({
            intent: "general_support",
            workType: "vendor",
            actionability: "no_action_needed",
            replyNeeded: "no",
        }));
        (0, vitest_1.expect)(draft).toBe("");
    });
    (0, vitest_1.it)("suppresses reply drafts for short continuation replies without a clear ask", () => {
        const draft = (0, generateReply_1.generateReply)(buildAnalysis({
            summary: "Short thread continuation with limited standalone context.",
            actionability: "review_needed",
            replyNeeded: "maybe",
            workType: "customer_support",
            hasClearRequest: false,
            isThreadContinuation: true,
        }));
        (0, vitest_1.expect)(draft).toBe("");
    });
    (0, vitest_1.it)("produces a usable draft for a clear cancellation request without order identifiers", () => {
        const draft = (0, generateReply_1.generateReply)(buildAnalysis({
            summary: "Customer wants to cancel an order and is asking for confirmation.",
            intent: "cancellation_request",
            orderNumber: undefined,
            workType: "customer_support",
            actionability: "action_required",
            replyNeeded: "yes",
            hasClearRequest: true,
            isThreadContinuation: false,
        }));
        (0, vitest_1.expect)(draft).toContain("reviewing the cancellation request");
        (0, vitest_1.expect)(draft).not.toContain("undefined");
    });
    (0, vitest_1.it)("still produces a reply draft for actionable customer emails", () => {
        const order = {
            orderNumber: "ORD-1002",
            status: "Processing",
            shipmentStatus: "In Transit",
            lastUpdated: "2026-04-01T08:00:00.000Z",
        };
        const draft = (0, generateReply_1.generateReply)(buildAnalysis({
            hasClearRequest: true,
            workType: "customer_support",
        }), order);
        (0, vitest_1.expect)(draft).toContain("I checked on order ORD-1002.");
    });
    (0, vitest_1.it)("does not ask for an order number again when subject identifiers are already present", () => {
        const draft = (0, generateReply_1.generateReply)(buildAnalysis({
            summary: "Customer is requesting a status update for orders 162702 and 162740.",
            orderNumber: "162702",
            caseIdentifiers: [
                { value: "162702", kind: "order", source: "subject" },
                { value: "162740", kind: "order", source: "subject" },
            ],
            nextAction: "Verify the latest shipment status for orders 162702 and 162740.",
            hasClearRequest: true,
            workType: "customer_support",
        }));
        (0, vitest_1.expect)(draft).toContain("checking the latest status tied to orders 162702 and 162740");
        (0, vitest_1.expect)(draft).not.toContain("Please send over your order number");
    });
    (0, vitest_1.it)("uses neutral wording for non-order identifiers and blocks order undefined", () => {
        const draft = (0, generateReply_1.generateReply)(buildAnalysis({
            summary: "Customer is requesting a status update for transfer 1001-009313.",
            orderNumber: undefined,
            caseIdentifiers: [
                { value: "1001-009313", kind: "transfer", source: "subject" },
            ],
            nextAction: "Review the referenced transfer/rework details.",
            hasClearRequest: true,
            workType: "customer_support",
        }));
        (0, vitest_1.expect)(draft).toContain("reviewing the referenced transfer/rework details");
        (0, vitest_1.expect)(draft).not.toContain("undefined");
        (0, vitest_1.expect)(draft).not.toContain("Please send over your order number");
    });
    (0, vitest_1.it)("still asks for identifiers when none are present", () => {
        const draft = (0, generateReply_1.generateReply)(buildAnalysis({
            summary: "Customer is asking for an order update but did not provide a usable identifier.",
            orderNumber: undefined,
            caseIdentifiers: [],
            hasClearRequest: true,
            workType: "customer_support",
        }));
        (0, vitest_1.expect)(draft).toContain("Please send over your order number");
    });
    (0, vitest_1.it)("acknowledges operational confirmation requests without inventing shipment status", () => {
        const draft = (0, generateReply_1.generateReply)(buildAnalysis({
            summary: "Customer provided inbound or logistics details and requested confirmation of receipt or follow-up once the event occurs.",
            intent: "operational_confirmation",
            orderNumber: undefined,
            hasClearRequest: true,
            workType: "customer_support",
            hasConfirmationRequest: true,
            hasLogisticsContext: true,
            hasOperationalTimingSignal: true,
            nextAction: "Acknowledge receipt and confirm back once the container or delivery event occurs.",
        }));
        (0, vitest_1.expect)(draft).toContain("received the inbound logistics details");
        (0, vitest_1.expect)(draft).toContain("confirm back once the container or delivery event is completed");
        (0, vitest_1.expect)(draft).not.toContain("delivered");
        (0, vitest_1.expect)(draft).not.toContain("in transit");
    });
});
