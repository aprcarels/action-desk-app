"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchInboxPage = fetchInboxPage;
const getAccessToken_1 = require("../auth/getAccessToken");
const sharedWorkflowApi_1 = require("./sharedWorkflowApi");
const INVALID_INBOX_API_RESPONSE_ERROR = "Invalid inbox API response.";
const SHARED_SESSION_STORAGE_KEY = "action-desk.shared-session-id";
function clearStoredSession() {
    if (typeof window === "undefined" || !window.localStorage) {
        return;
    }
    window.localStorage.removeItem(SHARED_SESSION_STORAGE_KEY);
}
function dispatchSessionExpired() {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
        return;
    }
    window.dispatchEvent(new CustomEvent((0, sharedWorkflowApi_1.getSharedSessionExpiredEventName)(), {
        detail: {
            message: (0, sharedWorkflowApi_1.getExpiredMicrosoftSessionMessage)(),
        },
    }));
}
function isInboxProvider(value) {
    return (value === "dev_json" ||
        value === "outlook_graph" ||
        value === "outlook_addin_import" ||
        value === "test_data");
}
function isRawInboxEmailHeader(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const candidate = value;
    return typeof candidate.name === "string" && typeof candidate.value === "string";
}
function isRawInboxEmail(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const candidate = value;
    return (typeof candidate.id === "string" &&
        candidate.id.trim().length > 0 &&
        typeof candidate.externalId === "string" &&
        candidate.externalId.trim().length > 0 &&
        isInboxProvider(candidate.provider) &&
        typeof candidate.subject === "string" &&
        typeof candidate.fromName === "string" &&
        typeof candidate.fromEmail === "string" &&
        typeof candidate.receivedAt === "string" &&
        typeof candidate.bodyText === "string" &&
        (candidate.threadId === undefined || typeof candidate.threadId === "string") &&
        (candidate.locationId === undefined || typeof candidate.locationId === "string") &&
        (candidate.bodyHtml === undefined || typeof candidate.bodyHtml === "string") &&
        (candidate.previewText === undefined || typeof candidate.previewText === "string") &&
        (candidate.hasAttachments === undefined ||
            typeof candidate.hasAttachments === "boolean") &&
        (candidate.outlookWebLink === undefined ||
            typeof candidate.outlookWebLink === "string") &&
        (candidate.toRecipients === undefined ||
            (Array.isArray(candidate.toRecipients) &&
                candidate.toRecipients.every((recipient) => typeof recipient === "string"))) &&
        (candidate.ccRecipients === undefined ||
            (Array.isArray(candidate.ccRecipients) &&
                candidate.ccRecipients.every((recipient) => typeof recipient === "string"))) &&
        (candidate.internetMessageHeaders === undefined ||
            (Array.isArray(candidate.internetMessageHeaders) &&
                candidate.internetMessageHeaders.every(isRawInboxEmailHeader))));
}
function normalizeInboxApiResponse(payload) {
    if (!payload || typeof payload !== "object") {
        throw new Error(INVALID_INBOX_API_RESPONSE_ERROR);
    }
    const candidate = payload;
    const emails = candidate.emails;
    if (!Array.isArray(emails) || !emails.every(isRawInboxEmail)) {
        throw new Error(INVALID_INBOX_API_RESPONSE_ERROR);
    }
    if (candidate.nextCursor !== undefined && typeof candidate.nextCursor !== "string") {
        throw new Error(INVALID_INBOX_API_RESPONSE_ERROR);
    }
    return {
        emails,
        nextCursor: typeof candidate.nextCursor === "string" ? candidate.nextCursor : undefined,
    };
}
async function fetchInboxPage(options) {
    const isElectron = Boolean(window.actionDeskDesktop?.isElectron);
    const url = new URL("/api/inbox/messages", isElectron ? "http://localhost:3960" : window.location.origin);
    if (options?.cursor) {
        url.searchParams.set("cursor", options.cursor);
    }
    if (typeof options?.limit === "number" && options.limit > 0) {
        url.searchParams.set("limit", String(Math.floor(options.limit)));
    }
    if (options?.interactiveAuth === true) {
        url.searchParams.set("interactiveAuth", "true");
    }
    const headers = {
        Accept: "application/json",
    };
    if (!isElectron) {
        const accessToken = await (0, getAccessToken_1.getAccessToken)({
            interactive: options?.interactiveAuth === true,
        });
        headers.Authorization = `Bearer ${accessToken}`;
    }
    else {
        const sessionId = window.localStorage.getItem(SHARED_SESSION_STORAGE_KEY);
        if (sessionId) {
            headers["x-action-desk-session-id"] = sessionId;
        }
    }
    const response = await fetch(url, {
        method: "GET",
        headers,
        signal: options?.signal,
    });
    if (!response.ok) {
        let errorDetail = "";
        let errorCode = "";
        try {
            const payload = (await response.json());
            if (typeof payload.error === "string") {
                errorDetail = payload.error;
            }
            else if (payload.error && typeof payload.error === "object") {
                errorDetail =
                    typeof payload.error.message === "string" ? payload.error.message : "";
                errorCode = typeof payload.error.code === "string" ? payload.error.code : "";
            }
        }
        catch {
            errorDetail = "";
        }
        if (errorCode === "microsoft_session_missing" ||
            errorCode === "microsoft_session_expired" ||
            errorCode === "stale_microsoft_session") {
            clearStoredSession();
            dispatchSessionExpired();
        }
        const error = new Error(errorDetail || `Inbox API request failed with status ${response.status}.`);
        error.code = errorCode || undefined;
        throw error;
    }
    const payload = await response.json();
    return normalizeInboxApiResponse(payload);
}
