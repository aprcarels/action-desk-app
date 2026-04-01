import {
  BrowserAuthError,
  BrowserAuthErrorCodes,
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
} from "@azure/msal-browser";
import {
  createMailReadPopupRequest,
  createMsalConfiguration,
  describeMissingMsalConfig,
  getMsalRuntimeConfig,
  graphMailReadScopes,
} from "./msalConfig";

let msalClientPromise: Promise<PublicClientApplication | null> | null = null;
const MISSING_AUTH_CONFIGURATION_MESSAGE =
  "Microsoft mailbox access is not configured. Add VITE_AZURE_CLIENT_ID and VITE_AZURE_TENANT_ID or VITE_AZURE_AUTHORITY.";
const SIGN_IN_FAILED_MESSAGE =
  "Microsoft sign-in could not be completed. Please sign in again and allow Mail.Read access.";
const TOKEN_ACQUISITION_FAILED_MESSAGE =
  "Microsoft mailbox access could not be authorized right now. Please try again.";

function isNoTokenRequestCacheError(error: unknown): boolean {
  return error instanceof BrowserAuthError && error.errorCode === BrowserAuthErrorCodes.noTokenRequestCacheError;
}

function isUserCancelledAuthError(error: unknown): boolean {
  return (
    error instanceof BrowserAuthError &&
    (error.errorCode === BrowserAuthErrorCodes.userCancelled ||
      error.errorCode === BrowserAuthErrorCodes.popupWindowError)
  );
}

async function handleRedirectResponse(
  client: PublicClientApplication,
): Promise<AuthenticationResult | null> {
  try {
    return await client.handleRedirectPromise();
  } catch (error) {
    if (isNoTokenRequestCacheError(error)) {
      return null;
    }

    throw error;
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

    const client = new PublicClientApplication(createMsalConfiguration(runtimeConfig));
    await client.initialize();
    const redirectResponse = await handleRedirectResponse(client);

    if (redirectResponse?.account) {
      client.setActiveAccount(redirectResponse.account);
    }

    const existingAccount = client.getActiveAccount() ?? client.getAllAccounts()[0] ?? null;

    if (existingAccount) {
      client.setActiveAccount(existingAccount);
    }

    return client;
  })();

  return msalClientPromise;
}

function getActiveAccount(client: PublicClientApplication): AccountInfo | null {
  const account = client.getActiveAccount() ?? client.getAllAccounts()[0] ?? null;

  if (account) {
    client.setActiveAccount(account);
  }

  return account;
}

export async function getAccessToken(): Promise<string> {
  const runtimeConfig = getMsalRuntimeConfig();
  const missingConfig = describeMissingMsalConfig(runtimeConfig);

  if (missingConfig.length > 0) {
    throw new Error(MISSING_AUTH_CONFIGURATION_MESSAGE);
  }

  const client = await getMsalClient();

  if (!client) {
    throw new Error("Microsoft auth client could not be initialized.");
  }

  let account = getActiveAccount(client);

  if (!account) {
    try {
      const loginResponse = await client.loginPopup(createMailReadPopupRequest());
      account = loginResponse.account ?? getActiveAccount(client);
    } catch (error) {
      if (isUserCancelledAuthError(error)) {
        throw new Error(SIGN_IN_FAILED_MESSAGE);
      }

      throw error;
    }
  }

  if (!account) {
    throw new Error(SIGN_IN_FAILED_MESSAGE);
  }

  try {
    const tokenResponse = await client.acquireTokenSilent({
      scopes: graphMailReadScopes,
      account,
    });

    client.setActiveAccount(tokenResponse.account ?? account);
    return tokenResponse.accessToken;
  } catch (error) {
    if (!(error instanceof InteractionRequiredAuthError)) {
      if (isUserCancelledAuthError(error)) {
        throw new Error(SIGN_IN_FAILED_MESSAGE);
      }

      throw new Error(TOKEN_ACQUISITION_FAILED_MESSAGE);
    }

    let popupAccount: AccountInfo | null = null;

    try {
      const loginResponse = await client.loginPopup(createMailReadPopupRequest());
      popupAccount = loginResponse.account ?? getActiveAccount(client);
    } catch (popupError) {
      if (isUserCancelledAuthError(popupError)) {
        throw new Error(SIGN_IN_FAILED_MESSAGE);
      }

      throw new Error(TOKEN_ACQUISITION_FAILED_MESSAGE);
    }

    if (!popupAccount) {
      throw new Error(SIGN_IN_FAILED_MESSAGE);
    }

    try {
      const tokenResponse = await client.acquireTokenSilent({
        scopes: graphMailReadScopes,
        account: popupAccount,
      });

      client.setActiveAccount(tokenResponse.account ?? popupAccount);
      return tokenResponse.accessToken;
    } catch {
      throw new Error(TOKEN_ACQUISITION_FAILED_MESSAGE);
    }
  }
}
