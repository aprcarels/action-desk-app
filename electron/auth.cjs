const crypto = require("node:crypto");
const path = require("node:path");
const { shell } = require("electron");
const {
  CryptoProvider,
  InteractionRequiredAuthError,
  PublicClientApplication,
} = require("@azure/msal-node");
const {
  startLoopbackAuthListener,
} = require("./authPkceHelpers.cjs");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const GRAPH_MAIL_READ_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "Mail.Read",
];
const AUTH_TIMEOUT_MS = 120000;

let msalApp = null;
let cryptoProvider = null;
const sessionContexts = new Map();

function createAuthError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createSessionId() {
  return `session-${crypto.randomUUID()}`;
}

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function getAuthority() {
  const explicitAuthority = process.env.VITE_AZURE_AUTHORITY?.trim();

  if (explicitAuthority) {
    return explicitAuthority;
  }

  return `https://login.microsoftonline.com/${getRequiredEnv("VITE_AZURE_TENANT_ID")}`;
}

function getMsalApp() {
  if (!msalApp) {
    msalApp = new PublicClientApplication({
      auth: {
        clientId: getRequiredEnv("VITE_AZURE_CLIENT_ID"),
        authority: getAuthority(),
      },
      system: {
        loggerOptions: {
          piiLoggingEnabled: false,
        },
      },
    });
  }

  return msalApp;
}

function getCryptoProvider() {
  if (!cryptoProvider) {
    cryptoProvider = new CryptoProvider();
  }

  return cryptoProvider;
}

function buildIdentityFromResult(result) {
  const claims = result.idTokenClaims ?? {};
  const entraObjectId = String(
    claims.oid || claims.sub || result.account?.homeAccountId || "",
  ).trim();
  const email = String(
    claims.preferred_username || claims.email || result.account?.username || "",
  )
    .trim()
    .toLowerCase();
  const displayName = String(claims.name || result.account?.name || email).trim();

  return {
    entraObjectId,
    email,
    displayName,
  };
}

async function redeemAuthCode(options) {
  const app = getMsalApp();

  return app.acquireTokenByCode({
    code: options.code,
    scopes: GRAPH_MAIL_READ_SCOPES,
    redirectUri: options.redirectUri,
    codeVerifier: options.codeVerifier,
  });
}

async function acquireInteractiveResult(logger) {
  const app = getMsalApp();
  const provider = getCryptoProvider();
  const pkceCodes = await provider.generatePkceCodes();
  const state = provider.createNewGuid();

  const listener = await startLoopbackAuthListener({
    expectedState: state,
    timeoutMs: AUTH_TIMEOUT_MS,
    logger,
  });

  const authCodeUrl = await app.getAuthCodeUrl({
    scopes: GRAPH_MAIL_READ_SCOPES,
    redirectUri: listener.redirectUri,
    codeChallenge: pkceCodes.challenge,
    codeChallengeMethod: "S256",
    state,
    prompt: "select_account",
  });

  logger?.info?.("auth", "Created Microsoft auth URL for desktop sign-in.", {
    redirectUri: listener.redirectUri,
  });

  await shell.openExternal(authCodeUrl);

  const code = await listener.waitForCode;

  logger?.info?.("auth", "Redeeming Microsoft auth code.", {
    redirectUri: listener.redirectUri,
  });

  const result = await redeemAuthCode({
    code,
    redirectUri: listener.redirectUri,
    codeVerifier: pkceCodes.verifier,
  });

  logger?.info?.("auth", "Microsoft auth code redeemed successfully.", {
    accountUsername: result?.account?.username || undefined,
  });

  return result;
}

async function signInWithMicrosoft(logger) {
  try {
    const result = await acquireInteractiveResult(logger);

    if (!result?.account || !result.accessToken) {
      throw new Error("Microsoft sign-in did not return a valid session.");
    }

    const sessionId = createSessionId();

    sessionContexts.set(sessionId, {
      account: result.account,
      accessToken: result.accessToken,
      expiresAt: result.expiresOn
        ? result.expiresOn.getTime()
        : Date.now() + 3600 * 1000,
      identity: buildIdentityFromResult(result),
    });

    return {
      sessionId,
      identity: sessionContexts.get(sessionId).identity,
    };
  } catch (error) {
    logger?.error?.("auth", "Microsoft desktop sign-in failed.", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      error instanceof Error && error.message
        ? error.message
        : "Microsoft sign-in could not be completed right now.",
    );
  }
}

async function refreshInteractiveAccessToken(context, logger) {
  const result = await acquireInteractiveResult(logger);

  if (!result?.account || !result.accessToken) {
    throw new Error("Microsoft mailbox access could not be authorized right now.");
  }

  context.account = result.account;
  context.accessToken = result.accessToken;
  context.expiresAt = result.expiresOn
    ? result.expiresOn.getTime()
    : Date.now() + 3600 * 1000;
  context.identity = buildIdentityFromResult(result);

  return context.accessToken;
}

async function getAccessTokenForSession(sessionId, options = {}, logger) {
  const context = sessionContexts.get(String(sessionId || ""));

  if (!context) {
    throw createAuthError(
      "Your Microsoft session expired. Please sign in again.",
      "microsoft_session_missing",
    );
  }

  if (context.accessToken && context.expiresAt > Date.now() + 60_000) {
    return context.accessToken;
  }

  const app = getMsalApp();

  try {
    const result = await app.acquireTokenSilent({
      account: context.account,
      scopes: GRAPH_MAIL_READ_SCOPES,
    });

    if (!result?.accessToken) {
      throw new Error("Microsoft mailbox access could not be refreshed.");
    }

    context.accessToken = result.accessToken;
    context.expiresAt = result.expiresOn
      ? result.expiresOn.getTime()
      : Date.now() + 3600 * 1000;
    context.identity = buildIdentityFromResult(result);

    return context.accessToken;
  } catch (error) {
    if (!(error instanceof InteractionRequiredAuthError) || options.interactive !== true) {
      throw createAuthError(
        "Your Microsoft session expired. Please sign in again.",
        "microsoft_session_expired",
      );
    }

    logger?.info?.("auth", "Silent token refresh requires interactive re-auth.", {
      sessionId: String(sessionId || ""),
    });

    return refreshInteractiveAccessToken(context, logger);
  }
}

function getSessionIdentity(sessionId) {
  return sessionContexts.get(String(sessionId || ""))?.identity ?? null;
}

function hasSessionContext(sessionId) {
  return sessionContexts.has(String(sessionId || ""));
}

function signOutSession(sessionId) {
  sessionContexts.delete(String(sessionId || ""));
}

module.exports = {
  getAccessTokenForSession,
  getSessionIdentity,
  hasSessionContext,
  signInWithMicrosoft,
  signOutSession,
};
