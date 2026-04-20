"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const processEmails_1 = require("./processEmails");
function buildProcessedEmail(overrides) {
    return {
        email: {
            id: "email-1",
            senderName: "Customer",
            senderEmail: "customer@example.com",
            subject: "Where is my order?",
            receivedAt: "2026-04-01T10:00:00Z",
            body: "Please help with ORD-1001.",
            previewText: "Please help with ORD-1001.",
            provider: "outlook_graph",
            source: "outlook_graph",
        },
        status: "processed",
        result: {
            analysis: {
                summary: "Customer is requesting a status update for order ORD-1001.",
                intent: "where_is_my_order",
                urgency: "medium",
                confidence: "medium",
                orderNumber: "ORD-1001",
                risks: [],
                nextAction: "Verify the latest shipment status.",
                messageType: "customer_request",
                actionability: "action_required",
                replyNeeded: "yes",
                workType: "customer_support",
                hasClearRequest: true,
                isThreadContinuation: false,
            },
            analysisSource: "fallback",
            replyDraft: "Hello",
            priorityScore: 60,
        },
        issueCount: 0,
        previewText: "Customer is requesting a status update for order ORD-1001.",
        ...overrides,
    };
}
(0, vitest_1.describe)("filterProcessedEmails", () => {
    (0, vitest_1.it)("shows only likely customer-service work in the default queue view", () => {
        const items = [
            buildProcessedEmail(),
            buildProcessedEmail({
                email: {
                    ...buildProcessedEmail().email,
                    id: "email-2",
                    subject: "Vendor portal maintenance",
                    senderEmail: "accounts@vendorco.com",
                },
                result: {
                    ...buildProcessedEmail().result,
                    analysis: {
                        ...buildProcessedEmail().result.analysis,
                        workType: "vendor",
                        replyNeeded: "no",
                        actionability: "no_action_needed",
                        intent: "general_support",
                    },
                    replyDraft: "",
                    priorityScore: 0,
                },
            }),
        ];
        const filtered = (0, processEmails_1.filterProcessedEmails)(items, {
            searchQuery: "",
            urgency: "all",
            intent: "all",
            queueView: "customer_service",
        });
        (0, vitest_1.expect)(filtered).toHaveLength(1);
        (0, vitest_1.expect)(filtered[0].email.id).toBe("email-1");
    });
    (0, vitest_1.it)("keeps all items accessible in the all inbox view", () => {
        const items = [
            buildProcessedEmail(),
            buildProcessedEmail({
                email: {
                    ...buildProcessedEmail().email,
                    id: "email-2",
                },
                result: {
                    ...buildProcessedEmail().result,
                    analysis: {
                        ...buildProcessedEmail().result.analysis,
                        workType: "internal",
                        replyNeeded: "no",
                        actionability: "no_action_needed",
                        intent: "general_support",
                    },
                    replyDraft: "",
                    priorityScore: 0,
                },
            }),
        ];
        const filtered = (0, processEmails_1.filterProcessedEmails)(items, {
            searchQuery: "",
            urgency: "all",
            intent: "all",
            queueView: "all_inbox",
        });
        (0, vitest_1.expect)(filtered).toHaveLength(2);
    });
});
