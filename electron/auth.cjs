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
const sessionAliases = new Map();
let lastActiveSessionId = null;

function createAuthError(message, code, details) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
}

function createSessionId() {
  return `session-${crypto.randomUUID()}`;
}

function rememberActiveSession(sessionId) {
  const normalizedSessionId = normalizeSessionId(sessionId);

  if (normalizedSessionId && hasSessionContext(normalizedSessionId)) {
    lastActiveSessionId = normalizedSessionId;
  }
}

function normalizeSessionId(sessionId) {
  return String(sessionId || "").trim();
}

function resolveSessionId(sessionId) {
  const normalizedSessionId = normalizeSessionId(sessionId);
  const seenSessionIds = new Set();
  let currentSessionId = normalizedSessionId;

  while (currentSessionId && sessionAliases.has(currentSessionId)) {
    if (seenSessionIds.has(currentSessionId)) {
      return normalizedSessionId;
    }

    seenSessionIds.add(currentSessionId);
    currentSessionId = sessionAliases.get(currentSessionId);
  }

  return currentSessionId || normalizedSessionId;
}

function getSessionContextForLookup(sessionId) {
  const requestedSessionId = normalizeSessionId(sessionId);
  const microsoftAuthSessionId = resolveSessionId(requestedSessionId);
  const context =
    sessionContexts.get(microsoftAuthSessionId) ??
    sessionContexts.get(requestedSessionId);

  return {
    context,
    microsoftAuthSessionId,
    requestedSessionId,
  };
}

function getSessionLookupState(sessionId) {
  const {
    context,
    microsoftAuthSessionId,
    requestedSessionId,
  } = getSessionContextForLookup(sessionId);
  const aliasUsed = requestedSessionId !== microsoftAuthSessionId;

  return {
    tokenLookupSessionId: requestedSessionId,
    backendSessionId: aliasUsed ? requestedSessionId : undefined,
    resolvedMicrosoftSessionId: microsoftAuthSessionId,
    microsoftAuthSessionId,
    tokenContextExists: Boolean(context),
    aliasUsed,
  };
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
  const account = result.account ?? {};
  const homeAccountId = String(account.homeAccountId || "").trim();
  const localAccountId = String(account.localAccountId || "").trim();
  const accountUsername = String(account.username || "").trim().toLowerCase();
  const entraObjectId = String(
    claims.oid || localAccountId || claims.sub || homeAccountId || "",
  ).trim();
  const email = String(
    claims.preferred_username || claims.email || accountUsername || "",
  )
    .trim()
    .toLowerCase();
  const displayName = String(claims.name || account.name || email).trim();
  const microsoftUserId = String(
    claims.oid || localAccountId || homeAccountId || claims.sub || "",
  ).trim();

  return {
    accountUsername,
    entraObjectId,
    email,
    displayName,
    homeAccountId,
    localAccountId,
    microsoft_user_id: microsoftUserId,
    microsoftUserId,
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
    rememberActiveSession(sessionId);

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
  const {
    context,
    microsoftAuthSessionId,
    requestedSessionId,
  } = getSessionContextForLookup(sessionId);
  const lookupState = getSessionLookupState(sessionId);
  const routePath =
    options.routePath || options.route || options.path || options.context || undefined;

  logger?.info?.("auth", "Microsoft token lookup.", {
    routePath,
    tokenLookupSessionId: requestedSessionId,
    backendSessionId: lookupState.backendSessionId,
    resolvedMicrosoftSessionId: microsoftAuthSessionId,
    microsoftAuthSessionId,
    tokenContextExists: lookupState.tokenContextExists,
    aliasUsed: lookupState.aliasUsed,
  });

  if (!context) {
    logger?.warn?.("auth", "Microsoft token context missing for session.", {
      routePath,
      ...lookupState,
    });
    throw createAuthError(
      "Microsoft token context missing for session",
      "microsoft_token_context_missing",
      lookupState,
    );
  }

  if (context.accessToken && context.expiresAt > Date.now() + 60_000) {
    rememberActiveSession(requestedSessionId);
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

    rememberActiveSession(requestedSessionId);
    return context.accessToken;
  } catch (error) {
    if (!(error instanceof InteractionRequiredAuthError) || options.interactive !== true) {
      logger?.warn?.("auth", "Microsoft token refresh failed.", {
        routePath,
        ...lookupState,
        errorCode: error?.code,
        error: error instanceof Error ? error.message : String(error),
      });
      throw createAuthError(
        "Your Microsoft session expired. Please sign in again.",
        "microsoft_session_expired",
        lookupState,
      );
    }

    logger?.info?.("auth", "Silent token refresh requires interactive re-auth.", {
      routePath,
      tokenLookupSessionId: requestedSessionId,
      resolvedMicrosoftSessionId: microsoftAuthSessionId,
    });

    const accessToken = await refreshInteractiveAccessToken(context, logger);
    rememberActiveSession(requestedSessionId);
    return accessToken;
  }
}

function getAvailableSessionId() {
  if (lastActiveSessionId && hasSessionContext(lastActiveSessionId)) {
    return lastActiveSessionId;
  }

  const firstSessionId = sessionContexts.keys().next().value;

  return firstSessionId ? String(firstSessionId) : "";
}

async function getAccessTokenForAvailableSession(options = {}, logger) {
  const sessionId = getAvailableSessionId();

  if (!sessionId) {
    throw createAuthError(
      "Microsoft token context missing for session",
      "microsoft_token_context_missing",
      getSessionLookupState(sessionId),
    );
  }

  return getAccessTokenForSession(sessionId, options, logger);
}

function getSessionIdentity(sessionId) {
  return getSessionContextForLookup(sessionId).context?.identity ?? null;
}

function aliasSessionContext(sourceSessionId, targetSessionId) {
  const normalizedSourceSessionId = normalizeSessionId(sourceSessionId);
  const normalizedTargetSessionId = normalizeSessionId(targetSessionId);

  if (!normalizedSourceSessionId || !normalizedTargetSessionId) {
    return false;
  }

  const microsoftAuthSessionId = resolveSessionId(normalizedSourceSessionId);
  const context =
    sessionContexts.get(microsoftAuthSessionId) ??
    sessionContexts.get(normalizedSourceSessionId);

  if (!context) {
    return false;
  }

  if (normalizedSourceSessionId === normalizedTargetSessionId) {
    sessionAliases.delete(normalizedTargetSessionId);
    sessionContexts.set(normalizedTargetSessionId, context);
    rememberActiveSession(normalizedTargetSessionId);
    return true;
  }

  sessionAliases.set(normalizedTargetSessionId, microsoftAuthSessionId);
  sessionContexts.set(normalizedTargetSessionId, context);
  rememberActiveSession(normalizedTargetSessionId);
  return true;
}

function hasSessionContext(sessionId) {
  return Boolean(getSessionContextForLookup(sessionId).context);
}

function signOutSession(sessionId) {
  const normalizedSessionId = normalizeSessionId(sessionId);
  const microsoftAuthSessionId = resolveSessionId(normalizedSessionId);
  const removedSessionIds = new Set(
    [normalizedSessionId, microsoftAuthSessionId].filter(Boolean),
  );

  for (const [aliasSessionId, sourceSessionId] of sessionAliases.entries()) {
    if (
      aliasSessionId === normalizedSessionId ||
      aliasSessionId === microsoftAuthSessionId ||
      sourceSessionId === normalizedSessionId ||
      sourceSessionId === microsoftAuthSessionId
    ) {
      removedSessionIds.add(aliasSessionId);
      removedSessionIds.add(sourceSessionId);
      sessionAliases.delete(aliasSessionId);
    }
  }

  for (const removedSessionId of removedSessionIds) {
    sessionContexts.delete(removedSessionId);
  }

  if (removedSessionIds.has(lastActiveSessionId)) {
    lastActiveSessionId = null;
  }
}

module.exports = {
  aliasSessionContext,
  getAccessTokenForAvailableSession,
  getAccessTokenForSession,
  getSessionIdentity,
  getSessionLookupState,
  hasSessionContext,
  signInWithMicrosoft,
  signOutSession,
};
