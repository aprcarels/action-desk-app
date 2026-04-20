"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryMailboxMessageRepository = void 0;
function cloneMailboxMessage(message) {
    return {
        ...message,
        toEmails: [...message.toEmails],
        ccEmails: [...message.ccEmails],
        extractedIdentifiers: message.extractedIdentifiers
            ? { ...message.extractedIdentifiers }
            : undefined,
    };
}
class InMemoryMailboxMessageRepository {
    constructor() {
        this.messages = new Map();
    }
    async getById(id) {
        const message = this.messages.get(id);
        return message ? cloneMailboxMessage(message) : null;
    }
    async listByConversationId(conversationId) {
        return Array.from(this.messages.values())
            .filter((message) => message.conversationId === conversationId)
            .map(cloneMailboxMessage);
    }
    async listRecent(limit = 50) {
        return Array.from(this.messages.values())
            .sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt))
            .slice(0, limit)
            .map(cloneMailboxMessage);
    }
    async upsert(message) {
        this.messages.set(message.id, cloneMailboxMessage(message));
    }
    async upsertMany(messages) {
        for (const message of messages) {
            await this.upsert(message);
        }
    }
}
exports.InMemoryMailboxMessageRepository = InMemoryMailboxMessageRepository;
