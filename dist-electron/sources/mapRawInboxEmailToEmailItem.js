"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapRawInboxEmailToEmailItem = mapRawInboxEmailToEmailItem;
function normalizeText(value) {
    return value?.replace(/\s+/g, " ").trim() ?? "";
}
function buildPreviewText(rawEmail) {
    return normalizeText(rawEmail.previewText) || normalizeText(rawEmail.bodyText);
}
function mapInboxProviderToEmailSource(provider) {
    if (provider === "outlook_addin_import") {
        return "outlook_import";
    }
    if (provider === "outlook_graph") {
        return "outlook_graph";
    }
    if (provider === "test_data") {
        return "test_data";
    }
    return "seeded";
}
function mapRawInboxEmailToEmailItem(rawEmail) {
    const previewText = buildPreviewText(rawEmail);
    const bodyText = rawEmail.bodyText.trim() || previewText;
    return {
        id: rawEmail.id,
        conversationId: rawEmail.threadId?.trim() || undefined,
        locationId: rawEmail.locationId?.trim() || undefined,
        senderName: rawEmail.fromName.trim() || rawEmail.fromEmail.trim() || "Unknown sender",
        senderEmail: rawEmail.fromEmail.trim(),
        subject: rawEmail.subject.trim() || "(no subject)",
        receivedAt: rawEmail.receivedAt.trim(),
        sentAt: rawEmail.sentAt?.trim() || undefined,
        body: bodyText,
        previewText,
        hasAttachments: rawEmail.hasAttachments === true,
        toRecipients: rawEmail.toRecipients?.map((recipient) => recipient.trim()).filter(Boolean),
        ccRecipients: rawEmail.ccRecipients?.map((recipient) => recipient.trim()).filter(Boolean),
        provider: rawEmail.provider,
        source: mapInboxProviderToEmailSource(rawEmail.provider),
        outlookWebLink: rawEmail.outlookWebLink?.trim() || undefined,
    };
}
