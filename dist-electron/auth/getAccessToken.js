"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAccessToken = getAccessToken;
const msal_browser_1 = require("@azure/msal-browser");
const msalConfig_1 = require("./msalConfig");
const MISSING_AUTH_CONFIGURATION_MESSAGE = "Microsoft mailbox access is not configured. Add VITE_AZURE_CLIENT_ID and VITE_AZURE_TENANT_ID or VITE_AZURE_AUTHORITY.";
const SIGN_IN_FAILED_MESSAGE = "Microsoft sign-in could not be completed. Please sign in again and allow Mail.ReadWrite access.";
const TOKEN_ACQUISITION_FAILED_MESSAGE = "Microsoft mailbox access could not be authorized right now. Please try again.";
const SIGN_IN_ALREADY_IN_PROGRESS_MESSAGE = "Microsoft sign-in is already in progress. Please finish the open sign-in popup and try again if needed.";
const SIGN_IN_REQUIRED_MESSAGE = "Sign in to Microsoft to load your live inbox.";
let msalClientPromise = null;
let accessTokenPromise = null;
let loginPopupPromise = null;
function isNoTokenRequestCacheError(error) {
    return (error instanceof msal_browser_1.BrowserAuthError &&
        error.errorCode === msal_browser_1.BrowserAuthErrorCodes.noTokenRequestCacheError);
}
function isUserCancelledAuthError(error) {
    return (error instanceof msal_browser_1.BrowserAuthError &&
        (error.errorCode === msal_browser_1.BrowserAuthErrorCodes.userCancelled ||
            error.errorCode === msal_browser_1.BrowserAuthErrorCodes.popupWindowError));
}
function isInteractionInProgressError(error) {
    return (error instanceof msal_browser_1.BrowserAuthError &&
        error.errorCode === msal_browser_1.BrowserAuthErrorCodes.interactionInProgress);
}
async function handleRedirectResponse(client) {
    try {
        const redirectResponse = await client.handleRedirectPromise();
        if (redirectResponse?.account) {
            client.setActiveAccount(redirectResponse.account);
        }
    }
    catch (error) {
        if (!isNoTokenRequestCacheError(error)) {
            throw error;
        }
    }
}
async function getMsalClient() {
    if (msalClientPromise) {
        return msalClientPromise;
    }
    msalClientPromise = (async () => {
        const runtimeConfig = (0, msalConfig_1.getMsalRuntimeConfig)();
        if ((0, msalConfig_1.describeMissingMsalConfig)(runtimeConfig).length > 0) {
            return null;
        }
        const client = new msal_browser_1.PublicClientApplication((0, msalConfig_1.createMsalConfiguration)(runtimeConfig));
        await client.initialize();
        await handleRedirectResponse(client);
        const existingAccount = client.getActiveAccount() ?? client.getAllAccounts()[0] ?? null;
        if (existingAccount) {
            client.setActiveAccount(existingAccount);
        }
        return client;
    })();
    return msalClientPromise;
}
function getActiveAccount(client) {
    const account = client.getActiveAccount() ?? client.getAllAccounts()[0] ?? null;
    if (account) {
        client.setActiveAccount(account);
    }
    return account;
}
async function ensureSignedIn(client) {
    const existingAccount = getActiveAccount(client);
    if (existingAccount) {
        return existingAccount;
    }
    if (!loginPopupPromise) {
        const popupRequest = (0, msalConfig_1.createMailReadWritePopupRequest)();
        console.info("[auth] starting loginPopup", {
            redirectUri: popupRequest.redirectUri,
            origin: typeof window !== "undefined" ? window.location.origin : undefined,
        });
        loginPopupPromise = client.loginPopup(popupRequest);
    }
    try {
        const loginResponse = await loginPopupPromise;
        const account = loginResponse.account ?? getActiveAccount(client);
        if (!account) {
            throw new Error(SIGN_IN_FAILED_MESSAGE);
        }
        client.setActiveAccount(account);
        return account;
    }
    catch (error) {
        if (isUserCancelledAuthError(error)) {
            throw new Error(SIGN_IN_FAILED_MESSAGE);
        }
        if (isInteractionInProgressError(error)) {
            throw new Error(SIGN_IN_ALREADY_IN_PROGRESS_MESSAGE);
        }
        throw error;
    }
    finally {
        loginPopupPromise = null;
    }
}
async function getAccessTokenInternal(options) {
    const runtimeConfig = (0, msalConfig_1.getMsalRuntimeConfig)();
    const missingConfig = (0, msalConfig_1.describeMissingMsalConfig)(runtimeConfig);
    if (missingConfig.length > 0) {
        throw new Error(MISSING_AUTH_CONFIGURATION_MESSAGE);
    }
    const client = await getMsalClient();
    if (!client) {
        throw new Error("Microsoft auth client could not be initialized.");
    }
    const existingAccount = getActiveAccount(client);
    if (!existingAccount && options?.interactive !== true) {
        throw new Error(SIGN_IN_REQUIRED_MESSAGE);
    }
    const account = existingAccount ?? (await ensureSignedIn(client));
    client.setActiveAccount(account);
    try {
        const tokenResponse = await client.acquireTokenSilent((0, msalConfig_1.createMailReadWriteSilentRequest)(account));
        client.setActiveAccount(tokenResponse.account ?? account);
        return tokenResponse.accessToken;
    }
    catch (error) {
        if (!(error instanceof msal_browser_1.InteractionRequiredAuthError)) {
            if (isUserCancelledAuthError(error)) {
                throw new Error(SIGN_IN_FAILED_MESSAGE);
            }
            if (isInteractionInProgressError(error)) {
                throw new Error(SIGN_IN_ALREADY_IN_PROGRESS_MESSAGE);
            }
            throw new Error(TOKEN_ACQUISITION_FAILED_MESSAGE);
        }
        const popupAccount = await ensureSignedIn(client);
        try {
            const tokenResponse = await client.acquireTokenSilent((0, msalConfig_1.createMailReadWriteSilentRequest)(popupAccount));
            client.setActiveAccount(tokenResponse.account ?? popupAccount);
            return tokenResponse.accessToken;
        }
        catch (popupTokenError) {
            if (isInteractionInProgressError(popupTokenError)) {
                throw new Error(SIGN_IN_ALREADY_IN_PROGRESS_MESSAGE);
            }
            throw new Error(TOKEN_ACQUISITION_FAILED_MESSAGE);
        }
    }
}
async function getAccessToken(options) {
    if (accessTokenPromise) {
        return accessTokenPromise;
    }
    accessTokenPromise = getAccessTokenInternal(options);
    try {
        return await accessTokenPromise;
    }
    finally {
        accessTokenPromise = null;
    }
}
