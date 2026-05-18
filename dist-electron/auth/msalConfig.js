"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.graphMailReadWriteScopes = void 0;
exports.getMsalRuntimeConfig = getMsalRuntimeConfig;
exports.describeMissingMsalConfig = describeMissingMsalConfig;
exports.createMsalConfiguration = createMsalConfiguration;
exports.createMailReadWritePopupRequest = createMailReadWritePopupRequest;
exports.createMailReadWriteSilentRequest = createMailReadWriteSilentRequest;
const env_1 = require("../utils/env");
exports.graphMailReadWriteScopes = ["Mail.ReadWrite"];
const MSAL_CALLBACK_PATH = "/auth/popup-callback.html";
function getMsalRuntimeConfig() {
    return {
        clientId: (0, env_1.getEnv)("VITE_AZURE_CLIENT_ID"),
        tenantId: (0, env_1.getEnv)("VITE_AZURE_TENANT_ID"),
        authority: (0, env_1.getEnv)("VITE_AZURE_AUTHORITY"),
        redirectUri: (0, env_1.getEnv)("VITE_AZURE_REDIRECT_URI"),
    };
}
function normalizeLocalhostProtocol(url, options) {
    try {
        const parsedUrl = new URL(url);
        if (options?.preferHttps === true &&
            parsedUrl.hostname === "localhost" &&
            parsedUrl.protocol === "http:") {
            parsedUrl.protocol = "https:";
            return parsedUrl.toString();
        }
        return url;
    }
    catch {
        return url;
    }
}
function isElectronDesktopRuntime() {
    return (typeof window !== "undefined" &&
        Boolean(window.actionDeskDesktop?.isElectron));
}
function resolveRedirectBaseUrl(config) {
    const isElectronDesktop = isElectronDesktopRuntime();
    const windowOrigin = typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : undefined;
    const fallbackOrigin = windowOrigin ?? "https://localhost:5173";
    const configuredBaseUrl = isElectronDesktop && windowOrigin
        ? windowOrigin
        : config.redirectUri ?? fallbackOrigin;
    return normalizeLocalhostProtocol(configuredBaseUrl, {
        preferHttps: !isElectronDesktop,
    });
}
function resolveAuthCallbackRedirectUri(config) {
    return new URL(MSAL_CALLBACK_PATH, resolveRedirectBaseUrl(config)).toString();
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
    const redirectUri = resolveAuthCallbackRedirectUri(config);
    return {
        auth: {
            clientId: config.clientId ?? "",
            authority: resolveMsalAuthority(config),
            redirectUri,
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
function createMailReadWritePopupRequest() {
    const redirectUri = resolveAuthCallbackRedirectUri(getMsalRuntimeConfig());
    if ((0, env_1.getEnv)("DEV") === "true") {
        console.info("[Action Desk] MSAL popup redirect URI:", redirectUri);
    }
    return {
        scopes: exports.graphMailReadWriteScopes,
        prompt: "select_account",
        redirectUri,
    };
}
function createMailReadWriteSilentRequest(account) {
    return {
        scopes: exports.graphMailReadWriteScopes,
        account,
    };
}
