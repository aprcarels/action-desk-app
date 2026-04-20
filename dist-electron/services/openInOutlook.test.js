"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const openInOutlook_1 = require("./openInOutlook");
function buildEmail(overrides) {
    return {
        id: "email-1",
        senderName: "Rita Pardee",
        senderEmail: "ritap@allstarmg.com",
        subject: "Stock Transfer #1001-009351",
        receivedAt: "2026-04-02T12:19:00Z",
        body: "Please confirm this will get shipped out today to deliver tomorrow.",
        ...overrides,
    };
}
(0, vitest_1.describe)("openInOutlook", () => {
    (0, vitest_1.it)("builds an Outlook search url from subject and sender", () => {
        const url = (0, openInOutlook_1.buildOutlookSearchUrl)(buildEmail());
        (0, vitest_1.expect)(url).toBe("https://outlook.office.com/mail/?search=subject%3A%22Stock%20Transfer%20%231001-009351%22%20from%3A%22ritap%40allstarmg.com%22");
    });
    (0, vitest_1.it)("falls back to sender name when sender email is missing", () => {
        const processedEmail = {
            email: buildEmail({
                senderEmail: "",
                senderName: "Rita Pardee",
            }),
            status: "failed",
            processingError: "Failed",
            issueCount: 0,
            previewText: "Preview",
        };
        const url = (0, openInOutlook_1.buildOutlookSearchUrl)(processedEmail);
        (0, vitest_1.expect)(url).toContain(encodeURIComponent('from:"Rita Pardee"'));
    });
    (0, vitest_1.it)("can disable opening when both subject and sender are missing", () => {
        (0, vitest_1.expect)((0, openInOutlook_1.canOpenInOutlook)(buildEmail({
            subject: "",
            senderEmail: "",
            senderName: "",
        }))).toBe(false);
    });
});
