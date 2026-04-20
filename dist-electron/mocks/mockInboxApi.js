"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMockRawInboxEmails = getMockRawInboxEmails;
exports.getMockInboxPage = getMockInboxPage;
const mockEmails_1 = require("../data/mockEmails");
const DEFAULT_PAGE_SIZE = 6;
function buildPreviewText(bodyText) {
    return bodyText.replace(/\s+/g, " ").trim();
}
function mapSeededEmailToRawInboxEmail(seedEmail) {
    return {
        id: seedEmail.id,
        externalId: seedEmail.id,
        subject: seedEmail.subject,
        fromName: seedEmail.senderName,
        fromEmail: seedEmail.senderEmail,
        receivedAt: seedEmail.receivedAt,
        bodyText: seedEmail.body,
        previewText: buildPreviewText(seedEmail.body),
        provider: "dev_json",
    };
}
function getMockRawInboxEmails() {
    return mockEmails_1.mockEmails.map(mapSeededEmailToRawInboxEmail);
}
function getMockInboxPage(options) {
    const rawEmails = getMockRawInboxEmails();
    const parsedCursor = options?.cursor ? Number.parseInt(options.cursor, 10) : 0;
    const startIndex = Number.isNaN(parsedCursor) ? 0 : Math.max(parsedCursor, 0);
    const pageSize = typeof options?.limit === "number" && options.limit > 0
        ? Math.floor(options.limit)
        : DEFAULT_PAGE_SIZE;
    const emails = rawEmails.slice(startIndex, startIndex + pageSize);
    const nextCursor = startIndex + pageSize < rawEmails.length ? String(startIndex + pageSize) : undefined;
    return {
        emails,
        nextCursor,
    };
}
