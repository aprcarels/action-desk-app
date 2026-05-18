"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapRawInboxEmailToMailboxMessage = mapRawInboxEmailToMailboxMessage;
function mapInboxProviderToMailboxSource(provider) {
    switch (provider) {
        case "outlook_graph":
            return "outlook_graph";
        case "outlook_addin_import":
            return "imported";
        case "test_data":
            return "mock";
        case "dev_json":
        default:
            return "mock";
    }
}
function normalizeTimestamp(value, fallback) {
    const candidate = value?.trim() || fallback;
    const timestamp = Date.parse(candidate);
    return Number.isNaN(timestamp) ? candidate : new Date(timestamp).toISOString();
}
function buildMailboxId(rawEmail) {
    return rawEmail.provider === "outlook_graph" ? "outlook_graph_default" : rawEmail.provider;
}
function extractIdentifier(rawEmail, pattern) {
    const match = [rawEmail.subject, rawEmail.previewText, rawEmail.bodyText]
        .filter((value) => typeof value === "string" && value.trim().length > 0)
        .join("\n")
        .match(pattern);
    return match?.[0]?.trim() ?? null;
}
function mapRawInboxEmailToMailboxMessage(rawEmail) {
    const now = new Date().toISOString();
    const receivedAt = normalizeTimestamp(rawEmail.receivedAt, now);
    const sentAt = rawEmail.sentAt
        ? normalizeTimestamp(rawEmail.sentAt, receivedAt)
        : null;
    return {
        id: rawEmail.id,
        providerMessageId: rawEmail.externalId.trim() || rawEmail.id,
        internetMessageId: null,
        conversationId: rawEmail.threadId?.trim() || rawEmail.id,
        threadKey: rawEmail.threadId?.trim() || null,
        source: mapInboxProviderToMailboxSource(rawEmail.provider),
        mailboxId: buildMailboxId(rawEmail),
        folderId: null,
        folderName: null,
        fromName: rawEmail.fromName.trim() || null,
        fromEmail: rawEmail.fromEmail.trim(),
        toEmails: rawEmail.toRecipients?.map((recipient) => recipient.trim()).filter(Boolean) ?? [],
        ccEmails: rawEmail.ccRecipients?.map((recipient) => recipient.trim()).filter(Boolean) ?? [],
        subject: rawEmail.subject.trim() || "(no subject)",
        bodyPreview: rawEmail.previewText?.trim() || null,
        bodyText: rawEmail.bodyText.trim() || null,
        receivedAt,
        sentAt,
        isRead: false,
        hasAttachments: rawEmail.hasAttachments === true,
        webLink: rawEmail.outlookWebLink?.trim() || null,
        extractedIdentifiers: {
            orderNumber: extractIdentifier(rawEmail, /\bORD-\d+\b/i),
            caseNumber: extractIdentifier(rawEmail, /\b(?:CASE|TICKET|REF)[-:\s#]*[A-Z0-9-]{4,}\b/i),
            customerNumber: null,
            trackingNumber: extractIdentifier(rawEmail, /\b1Z[0-9A-Z]{16}\b/i),
        },
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
        lastEvaluatedAt: null,
    };
}
