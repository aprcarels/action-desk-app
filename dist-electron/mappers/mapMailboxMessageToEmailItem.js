"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapMailboxMessageToEmailItem = mapMailboxMessageToEmailItem;
function mapMailboxSourceToInboxProvider(source) {
    switch (source) {
        case "outlook_graph":
            return "outlook_graph";
        case "imported":
            return "outlook_addin_import";
        case "mock":
        default:
            return "dev_json";
    }
}
function mapMailboxSourceToEmailSource(source) {
    switch (source) {
        case "outlook_graph":
            return "outlook_graph";
        case "imported":
            return "outlook_import";
        case "mock":
        default:
            return "seeded";
    }
}
function mapMailboxMessageToEmailItem(message) {
    return {
        id: message.id,
        conversationId: message.conversationId,
        senderName: message.fromName?.trim() || message.fromEmail.trim() || "Unknown sender",
        senderEmail: message.fromEmail.trim(),
        subject: message.subject.trim() || "(no subject)",
        receivedAt: message.receivedAt,
        sentAt: message.sentAt?.trim() || undefined,
        body: message.bodyText?.trim() || message.bodyPreview?.trim() || "",
        previewText: message.bodyPreview?.trim() || message.bodyText?.trim() || "",
        hasAttachments: message.hasAttachments,
        toRecipients: [...message.toEmails],
        ccRecipients: [...message.ccEmails],
        provider: mapMailboxSourceToInboxProvider(message.source),
        source: mapMailboxSourceToEmailSource(message.source),
    };
}
