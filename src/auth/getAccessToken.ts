import { PublicClientApplication } from "@azure/msal-browser";
import {
  createMsalConfiguration,
  createMailReadPopupRequest,
  createMailReadSilentRequest,
  getMsalRuntimeConfig,
} from "./msalConfig";

let msalInstance: PublicClientApplication | null = null;
let msalInitializePromise: Promise<PublicClientApplication> | null = null;
let desktopSignInPromise: Promise<void> | null = null;

async function getBrowserMsalInstance(): Promise<PublicClientApplication> {
  if (msalInstance) {
    return msalInstance;
  }

  if (!msalInitializePromise) {
    msalInitializePromise = (async () => {
      const config = getMsalRuntimeConfig();
      const instance = new PublicClientApplication(
        createMsalConfiguration(config),
      );

      await instance.initialize();
      msalInstance = instance;

      console.info("[getAccessToken] Browser MSAL initialized");
      return instance;
    })();
  }

  return msalInitializePromise;
}

async function getBrowserAccessToken(options?: {
  interactive?: boolean;
}): Promise<string> {
  console.log("[getAccessToken] using browser auth");

  const instance = await getBrowserMsalInstance();
  const accounts = instance.getAllAccounts();

  console.log("[getAccessToken] browser account count:", accounts.length);

  const account = accounts[0];

  if (account) {
    try {
      console.log("[getAccessToken] trying browser silent token");
      const silentResult = await instance.acquireTokenSilent(
        createMailReadSilentRequest(account),
      );
      console.log("[getAccessToken] browser silent token success");
      return silentResult.accessToken;
    } catch (error) {
      console.warn("[getAccessToken] browser silent token failed:", error);
    }
  }

  if (options?.interactive === true) {
    console.log("[getAccessToken] starting browser popup login");
    const loginResult = await instance.loginPopup(
      createMailReadPopupRequest(),
    );

    const loginAccount = loginResult.account;
    if (!loginAccount) {
      throw new Error("Microsoft login completed, but no account was returned.");
    }

    const tokenResult = await instance.acquireTokenSilent(
      createMailReadSilentRequest(loginAccount),
    );

    console.log("[getAccessToken] browser popup login success");
    return tokenResult.accessToken;
  }

  throw new Error("User not authenticated and interactive login not allowed.");
}

async function runSingleDesktopSignIn(): Promise<void> {
  if (!desktopSignInPromise) {
    desktopSignInPromise = (async () => {
      console.log("[getAccessToken] starting desktop sign-in");
      await window.actionDeskDesktop!.signIn!();
    })().finally(() => {
      desktopSignInPromise = null;
    });
  }

  return desktopSignInPromise;
}

export async function getAccessToken(options?: {
  interactive?: boolean;
}): Promise<string> {
  const isDesktop = Boolean(window.actionDeskDesktop?.isElectron);

  console.log(
    "[getAccessToken] called. isDesktop:",
    isDesktop,
    "interactive:",
    options?.interactive,
  );

  if (isDesktop) {
    console.log("[getAccessToken] using Electron desktop auth flow");

    try {
      const token = await window.actionDeskDesktop!.getAccessToken!();
      console.log("[getAccessToken] desktop silent token success");
      return token;
    } catch (error) {
      console.warn("[getAccessToken] desktop silent token failed:", error);

      if (options?.interactive === true) {
        await runSingleDesktopSignIn();
        const token = await window.actionDeskDesktop!.getAccessToken!();
        console.log("[getAccessToken] desktop sign-in success");
        return token;
      }

      throw error;
    }
  }

  return getBrowserAccessToken(options);
}