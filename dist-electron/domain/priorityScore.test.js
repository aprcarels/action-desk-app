"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const priorityScore_1 = require("./priorityScore");
function buildAnalysis(overrides) {
    return {
        summary: "General support message needs review before taking action.",
        intent: "general_support",
        urgency: "medium",
        confidence: "medium",
        risks: [],
        nextAction: "Review the message.",
        messageType: "general_support",
        actionability: "review_needed",
        replyNeeded: "maybe",
        ...overrides,
    };
}
(0, vitest_1.describe)("computePriorityScore", () => {
    (0, vitest_1.it)("reduces priority for awareness-only informational messages", () => {
        const score = (0, priorityScore_1.computePriorityScore)(buildAnalysis({
            urgency: "low",
            messageType: "informational",
            actionability: "awareness_only",
            replyNeeded: "no",
        }));
        (0, vitest_1.expect)(score.score).toBe(0);
    });
    (0, vitest_1.it)("keeps customer-impacting issues higher priority", () => {
        const score = (0, priorityScore_1.computePriorityScore)(buildAnalysis({
            intent: "damaged_shipment",
            urgency: "high",
            actionability: "action_required",
            replyNeeded: "yes",
            risks: ["damage_reported", "customer_frustration"],
            messageType: "customer_request",
        }));
        (0, vitest_1.expect)(score.score).toBeGreaterThanOrEqual(70);
    });
    (0, vitest_1.it)("drops suspicious or phishing-related work to low priority", () => {
        const score = (0, priorityScore_1.computePriorityScore)(buildAnalysis({
            urgency: "low",
            messageType: "internal_alert",
            actionability: "review_needed",
            replyNeeded: "no",
            workType: "suspicious",
        }));
        (0, vitest_1.expect)(score.score).toBe(0);
    });
    (0, vitest_1.it)("downgrades short continuation replies without a clear ask", () => {
        const score = (0, priorityScore_1.computePriorityScore)(buildAnalysis({
            urgency: "medium",
            actionability: "review_needed",
            replyNeeded: "no",
            hasClearRequest: false,
            isThreadContinuation: true,
        }));
        (0, vitest_1.expect)(score.score).toBe(0);
    });
    (0, vitest_1.it)("pushes deadline-driven shipping requests into higher priority", () => {
        const score = (0, priorityScore_1.computePriorityScore)(buildAnalysis({
            intent: "where_is_my_order",
            urgency: "high",
            actionability: "action_required",
            replyNeeded: "yes",
            hasClearRequest: true,
            hasDeadlineRequest: true,
            workType: "customer_support",
            messageType: "customer_request",
        }));
        (0, vitest_1.expect)(score.score).toBeGreaterThanOrEqual(80);
    });
    (0, vitest_1.it)("keeps vendor coordination threads de-emphasized even with urgency wording", () => {
        const score = (0, priorityScore_1.computePriorityScore)(buildAnalysis({
            urgency: "low",
            actionability: "no_action_needed",
            replyNeeded: "no",
            hasClearRequest: false,
            hasDeadlineRequest: true,
            workType: "vendor",
            messageType: "informational",
        }));
        (0, vitest_1.expect)(score.score).toBeLessThan(25);
    });
    (0, vitest_1.it)("elevates time-bound operational confirmation requests above generic support", () => {
        const score = (0, priorityScore_1.computePriorityScore)(buildAnalysis({
            intent: "operational_confirmation",
            urgency: "high",
            actionability: "action_required",
            replyNeeded: "yes",
            hasClearRequest: true,
            hasConfirmationRequest: true,
            hasLogisticsContext: true,
            hasOperationalTimingSignal: true,
            workType: "customer_support",
            messageType: "customer_request",
        }));
        (0, vitest_1.expect)(score.score).toBeGreaterThanOrEqual(80);
    });
});
