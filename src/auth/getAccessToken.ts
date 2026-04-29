import {
  type AuthenticationResult,
  BrowserAuthError,
  BrowserAuthErrorCodes,
  InteractionRequiredAuthError,
  PublicClientApplication,
} from "@azure/msal-browser";
import {
  createMailReadPopupRequest,
  createMailReadSilentRequest,
  createMsalConfiguration,
  describeMissingMsalConfig,
  getMsalRuntimeConfig,
} from "./msalConfig";

const MISSING_AUTH_CONFIGURATION_MESSAGE =
  "Microsoft mailbox access is not configured. Add VITE_AZURE_CLIENT_ID and VITE_AZURE_TENANT_ID or VITE_AZURE_AUTHORITY.";
const SIGN_IN_FAILED_MESSAGE =
  "Microsoft sign-in could not be completed. Please sign in again and allow Mail.Read access.";
const TOKEN_ACQUISITION_FAILED_MESSAGE =
  "Microsoft mailbox access could not be authorized right now. Please try again.";
const SIGN_IN_ALREADY_IN_PROGRESS_MESSAGE =
  "Microsoft sign-in is already in progress. Please finish the open sign-in popup and try again if needed.";
const SIGN_IN_REQUIRED_MESSAGE =
  "Sign in to Microsoft to load your live inbox.";

let msalClientPromise: Promise<PublicClientApplication | null> | null = null;
let accessTokenPromise: Promise<string> | null = null;
let loginPopupPromise: Promise<AuthenticationResult> | null = null;

function isNoTokenRequestCacheError(error: unknown): boolean {
  return (
    error instanceof BrowserAuthError &&
    error.errorCode === BrowserAuthErrorCodes.noTokenRequestCacheError
  );
}

function isUserCancelledAuthError(error: unknown): boolean {
  return (
    error instanceof BrowserAuthError &&
    (error.errorCode === BrowserAuthErrorCodes.userCancelled ||
      error.errorCode === BrowserAuthErrorCodes.popupWindowError)
  );
}

function isInteractionInProgressError(error: unknown): boolean {
  return (
    error instanceof BrowserAuthError &&
    error.errorCode === BrowserAuthErrorCodes.interactionInProgress
  );
}

async function handleRedirectResponse(
  client: PublicClientApplication,
): Promise<void> {
  try {
    const redirectResponse = await client.handleRedirectPromise();

    if (redirectResponse?.account) {
      client.setActiveAccount(redirectResponse.account);
    }
  } catch (error) {
    if (!isNoTokenRequestCacheError(error)) {
      throw error;
    }
  }
}

async function getMsalClient(): Promise<PublicClientApplication | null> {
  if (msalClientPromise) {
    return msalClientPromise;
  }

  msalClientPromise = (async () => {
    const runtimeConfig = getMsalRuntimeConfig();

    if (describeMissingMsalConfig(runtimeConfig).length > 0) {
      return null;
    }

    const client = new PublicClientApplication(
      createMsalConfiguration(runtimeConfig),
    );

    await client.initialize();
    await handleRedirectResponse(client);

    const existingAccount =
      client.getActiveAccount() ?? client.getAllAccounts()[0] ?? null;

    if (existingAccount) {
      client.setActiveAccount(existingAccount);
    }

    return client;
  })();

  return msalClientPromise;
}

function getActiveAccount(client: PublicClientApplication) {
  const account = client.getActiveAccount() ?? client.getAllAccounts()[0] ?? null;

  if (account) {
    client.setActiveAccount(account);
  }

  return account;
}

async function ensureSignedIn(client: PublicClientApplication) {
  const existingAccount = getActiveAccount(client);

  if (existingAccount) {
    return existingAccount;
  }

  if (!loginPopupPromise) {
    const popupRequest = createMailReadPopupRequest();
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
  } catch (error) {
    if (isUserCancelledAuthError(error)) {
      throw new Error(SIGN_IN_FAILED_MESSAGE);
    }

    if (isInteractionInProgressError(error)) {
      throw new Error(SIGN_IN_ALREADY_IN_PROGRESS_MESSAGE);
    }

    throw error;
  } finally {
    loginPopupPromise = null;
  }
}

async function getAccessTokenInternal(options?: {
  interactive?: boolean;
}): Promise<string> {
  const runtimeConfig = getMsalRuntimeConfig();
  const missingConfig = describeMissingMsalConfig(runtimeConfig);

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
    const tokenResponse = await client.acquireTokenSilent(
      createMailReadSilentRequest(account),
    );

    client.setActiveAccount(tokenResponse.account ?? account);
    return tokenResponse.accessToken;
  } catch (error) {
    if (!(error instanceof InteractionRequiredAuthError)) {
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
      const tokenResponse = await client.acquireTokenSilent(
        createMailReadSilentRequest(popupAccount),
      );

      client.setActiveAccount(tokenResponse.account ?? popupAccount);
      return tokenResponse.accessToken;
    } catch (popupTokenError) {
      if (isInteractionInProgressError(popupTokenError)) {
        throw new Error(SIGN_IN_ALREADY_IN_PROGRESS_MESSAGE);
      }

      throw new Error(TOKEN_ACQUISITION_FAILED_MESSAGE);
    }
  }
}

export async function getAccessToken(options?: {
  interactive?: boolean;
}): Promise<string> {
  if (accessTokenPromise) {
    return accessTokenPromise;
  }

  accessTokenPromise = getAccessTokenInternal(options);

  try {
    return await accessTokenPromise;
  } finally {
    accessTokenPromise = null;
  }
}
