"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const mapRawInboxEmailToEmailItem_1 = require("./mapRawInboxEmailToEmailItem");
(0, vitest_1.describe)("mapRawInboxEmailToEmailItem", () => {
    (0, vitest_1.it)("keeps previewText for queue display while falling back to preview for body only when bodyText is empty", () => {
        const item = (0, mapRawInboxEmailToEmailItem_1.mapRawInboxEmailToEmailItem)({
            id: "email-1",
            externalId: "email-1",
            provider: "outlook_graph",
            subject: "Delay concern",
            fromName: "",
            fromEmail: "customer@example.com",
            receivedAt: "2026-04-01T10:00:00Z",
            bodyText: "",
            previewText: "Carrier delay preview",
        });
        (0, vitest_1.expect)(item.previewText).toBe("Carrier delay preview");
        (0, vitest_1.expect)(item.body).toBe("Carrier delay preview");
        (0, vitest_1.expect)(item.senderName).toBe("customer@example.com");
        (0, vitest_1.expect)(item.source).toBe("outlook_graph");
    });
});
