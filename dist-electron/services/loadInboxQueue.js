"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadRawInboxQueue = loadRawInboxQueue;
exports.loadInboxQueue = loadInboxQueue;
const env_1 = require("../utils/env");
const apiEmailSource_1 = require("../sources/apiEmailSource");
const devJsonEmailSource_1 = require("../sources/devJsonEmailSource");
const mapRawInboxEmailToEmailItem_1 = require("../sources/mapRawInboxEmailToEmailItem");
const pilotMode_1 = require("./pilotMode");
function resolveInboxSourceMode() {
    return (0, env_1.getEnv)("VITE_INBOX_SOURCE") === "api" ? "api" : "dev";
}
function getActiveEmailSource() {
    if (resolveInboxSourceMode() === "api") {
        return apiEmailSource_1.apiEmailSource;
    }
    return devJsonEmailSource_1.devJsonEmailSource;
}
async function loadRawInboxQueue(options) {
    const pilotMode = (0, pilotMode_1.isPilotModeEnabled)();
    if (pilotMode && resolveInboxSourceMode() !== "api") {
        return {
            items: [],
            nextCursor: undefined,
        };
    }
    if ((0, env_1.getEnv)("DEV") === "true") {
        console.info("[Action Desk] Inbox source mode:", resolveInboxSourceMode());
    }
    const sourceResult = await getActiveEmailSource().listEmails({
        cursor: options?.cursor,
        interactiveAuth: options?.interactiveAuth,
    });
    const visibleEmails = (0, pilotMode_1.filterInboxEmailsForPilotMode)(sourceResult.emails, pilotMode);
    // TODO: Rebuild inbox filtering safely.
    // Do NOT reintroduce strict filtering that can hide all emails.
    // Future approach should classify emails, not hard-filter them.
    const filteredRelevantEmails = visibleEmails;
    return {
        items: filteredRelevantEmails,
        nextCursor: sourceResult.nextCursor,
    };
}
async function loadInboxQueue(options) {
    const sourceResult = await loadRawInboxQueue(options);
    return {
        items: sourceResult.items.map(mapRawInboxEmailToEmailItem_1.mapRawInboxEmailToEmailItem),
        nextCursor: sourceResult.nextCursor,
    };
}
