const { PublicClientApplication } = require("@azure/msal-node");

let msalApp = null;
let cachedAccount = null;
let cachedToken = null;
let tokenExpiresAt = 0;

function isDeviceCodeAuthEnabled() {
  return process.env.ACTION_DESK_ENABLE_DEVICE_CODE_AUTH === "true";
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function getMsalApp() {
  if (!msalApp) {
    const clientId = getRequiredEnv("VITE_AZURE_CLIENT_ID");
    const tenantId = process.env.VITE_AZURE_TENANT_ID?.trim();
    const authority =
      process.env.VITE_AZURE_AUTHORITY?.trim() ||
      `https://login.microsoftonline.com/${tenantId}`;

    msalApp = new PublicClientApplication({
      auth: {
        clientId,
        authority,
      },
    });
  }

  return msalApp;
}

async function signInDesktop() {
  if (!isDeviceCodeAuthEnabled()) {
    throw new Error(
      "Device-code desktop auth is disabled. Use the normal Microsoft sign-in popup instead.",
    );
  }

  const app = getMsalApp();

  const result = await app.acquireTokenByDeviceCode({
    scopes: ["Mail.Read"],
    deviceCodeCallback: (response) => {
      console.log("");
      console.log("[Action Desk] Microsoft sign-in required");
      console.log("[Action Desk] Open this URL in your browser:");
      console.log(response.verificationUri);
      console.log("[Action Desk] Enter this code:");
      console.log(response.userCode);
      console.log("");
      console.log(response.message);
      console.log("");
    },
  });

  if (!result || !result.account || !result.accessToken) {
    throw new Error("Microsoft sign-in did not return an access token.");
  }

  cachedAccount = result.account;
  cachedToken = result.accessToken;
  tokenExpiresAt = result.expiresOn
    ? result.expiresOn.getTime()
    : Date.now() + 3600 * 1000;

  return {
    username: result.account.username || "",
    expiresAt: tokenExpiresAt,
  };
}

async function getDesktopAccessToken() {
  if (!isDeviceCodeAuthEnabled()) {
    throw new Error(
      "Device-code desktop auth is disabled. Use the normal Microsoft sign-in popup instead.",
    );
  }

  const now = Date.now();

  if (cachedToken && tokenExpiresAt > now + 60 * 1000) {
    return cachedToken;
  }

  if (!cachedAccount) {
    throw new Error("No Microsoft account is signed in for desktop mode.");
  }

  const app = getMsalApp();

  const result = await app.acquireTokenSilent({
    account: cachedAccount,
    scopes: ["Mail.Read"],
  });

  if (!result || !result.accessToken) {
    throw new Error("Silent desktop token acquisition failed.");
  }

  cachedToken = result.accessToken;
  tokenExpiresAt = result.expiresOn
    ? result.expiresOn.getTime()
    : Date.now() + 3600 * 1000;

  return cachedToken;
}

module.exports = {
  isDeviceCodeAuthEnabled,
  signInDesktop,
  getDesktopAccessToken,
};
