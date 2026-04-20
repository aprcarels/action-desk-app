"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.graphMailReadScopes = void 0;
exports.getMsalRuntimeConfig = getMsalRuntimeConfig;
exports.describeMissingMsalConfig = describeMissingMsalConfig;
exports.createMsalConfiguration = createMsalConfiguration;
exports.createMailReadPopupRequest = createMailReadPopupRequest;
exports.createMailReadSilentRequest = createMailReadSilentRequest;
const env_1 = require("../utils/env");
exports.graphMailReadScopes = ["Mail.Read"];
const MSAL_CALLBACK_PATH = "/auth/popup-callback.html";
function getMsalRuntimeConfig() {
    return {
        clientId: (0, env_1.getEnv)("VITE_AZURE_CLIENT_ID"),
        tenantId: (0, env_1.getEnv)("VITE_AZURE_TENANT_ID"),
        authority: (0, env_1.getEnv)("VITE_AZURE_AUTHORITY"),
        redirectUri: (0, env_1.getEnv)("VITE_AZURE_REDIRECT_URI"),
    };
}
function normalizeLocalhostHttps(url) {
    try {
        const parsedUrl = new URL(url);
        if (parsedUrl.hostname === "localhost" && parsedUrl.protocol === "http:") {
            parsedUrl.protocol = "https:";
            return parsedUrl.toString();
        }
        return url;
    }
    catch {
        return url;
    }
}
function resolveRedirectOrigin(config) {
    const fallbackOrigin = typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "https://localhost:5173";
    return normalizeLocalhostHttps(config.redirectUri ?? fallbackOrigin);
}
function resolveAuthCallbackRedirectUri() {
    return new URL(MSAL_CALLBACK_PATH, resolveRedirectOrigin(getMsalRuntimeConfig())).toString();
}
function resolveMsalAuthority(config) {
    if (config.authority) {
        return config.authority;
    }
    if (config.tenantId) {
        return `https://login.microsoftonline.com/${config.tenantId}`;
    }
    return undefined;
}
function describeMissingMsalConfig(config) {
    const missing = [];
    if (!config.clientId) {
        missing.push("VITE_AZURE_CLIENT_ID");
    }
    if (!config.authority && !config.tenantId) {
        missing.push("VITE_AZURE_TENANT_ID or VITE_AZURE_AUTHORITY");
    }
    return missing;
}
function createMsalConfiguration(config) {
    return {
        auth: {
            clientId: config.clientId ?? "",
            authority: resolveMsalAuthority(config),
            redirectUri: resolveRedirectOrigin(config),
        },
        cache: {
            cacheLocation: "localStorage",
        },
        system: {
            popupBridgeTimeout: 15000,
            iframeBridgeTimeout: 15000,
            redirectNavigationTimeout: 15000,
        },
    };
}
function createMailReadPopupRequest() {
    const redirectUri = resolveAuthCallbackRedirectUri();
    if ((0, env_1.getEnv)("DEV") === "true") {
        console.info("[Action Desk] MSAL popup redirect URI:", redirectUri);
    }
    return {
        scopes: exports.graphMailReadScopes,
        prompt: "select_account",
        redirectUri,
    };
}
function createMailReadSilentRequest(account) {
    return {
        scopes: exports.graphMailReadScopes,
        account,
    };
}
