"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.devJsonEmailSource = void 0;
const mockInboxApi_1 = require("../mocks/mockInboxApi");
const env_1 = require("../utils/env");
function isDemoDataEnabled() {
    return (0, env_1.getEnv)("ACTION_DESK_ENABLE_DEMO_DATA") === "true";
}
exports.devJsonEmailSource = {
    async listEmails(options) {
        if (!isDemoDataEnabled()) {
            return {
                emails: [],
                nextCursor: undefined,
            };
        }
        return (0, mockInboxApi_1.getMockInboxPage)(options);
    },
};
