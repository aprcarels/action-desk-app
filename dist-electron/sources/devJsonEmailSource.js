"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.devJsonEmailSource = void 0;
const mockInboxApi_1 = require("../mocks/mockInboxApi");
exports.devJsonEmailSource = {
    async listEmails(options) {
        return (0, mockInboxApi_1.getMockInboxPage)(options);
    },
};
