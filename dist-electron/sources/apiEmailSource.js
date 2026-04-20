"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiEmailSource = void 0;
const inboxApi_1 = require("../services/inboxApi");
exports.apiEmailSource = {
    async listEmails(options) {
        return (0, inboxApi_1.fetchInboxPage)(options);
    },
};
