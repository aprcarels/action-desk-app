import type {
  AccountInfo,
  Configuration,
  PopupRequest,
  SilentRequest,
} from "@azure/msal-browser";

export const graphMailReadScopes = ["Mail.Read"];
const MSAL_CALLBACK_PATH = "/auth/popup-callback.html";

type MsalRuntimeConfig = {
  clientId?: string;
  tenantId?: string;
  authority?: string;
  redirectUri?: string;
};

export function getMsalRuntimeConfig(): MsalRuntimeConfig {
  return {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID,
    tenantId: import.meta.env.VITE_AZURE_TENANT_ID,
    authority: import.meta.env.VITE_AZURE_AUTHORITY,
    redirectUri: import.meta.env.VITE_AZURE_REDIRECT_URI,
  };
}

function normalizeLocalhostHttps(url: string): string {
  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.hostname === "localhost" && parsedUrl.protocol === "http:") {
      parsedUrl.protocol = "https:";
      return parsedUrl.toString();
    }

    return url;
  } catch {
    return url;
  }
}

function resolveRedirectOrigin(config: MsalRuntimeConfig): string {
  return normalizeLocalhostHttps(config.redirectUri ?? window.location.origin);
}

function resolveAuthCallbackRedirectUri(): string {
  return new URL(
    MSAL_CALLBACK_PATH,
    resolveRedirectOrigin(getMsalRuntimeConfig()),
  ).toString();
}

function resolveMsalAuthority(config: MsalRuntimeConfig): string | undefined {
  if (config.authority) {
    return config.authority;
  }

  if (config.tenantId) {
    return `https://login.microsoftonline.com/${config.tenantId}`;
  }

  return undefined;
}

export function describeMissingMsalConfig(config: MsalRuntimeConfig): string[] {
  const missing: string[] = [];

  if (!config.clientId) {
    missing.push("VITE_AZURE_CLIENT_ID");
  }

  if (!config.authority && !config.tenantId) {
    missing.push("VITE_AZURE_TENANT_ID or VITE_AZURE_AUTHORITY");
  }

  return missing;
}

export function createMsalConfiguration(config: MsalRuntimeConfig): Configuration {
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

export function createMailReadPopupRequest(): PopupRequest {
  const redirectUri = resolveAuthCallbackRedirectUri();

  if (import.meta.env.DEV) {
    console.info("[Action Desk] MSAL popup redirect URI:", redirectUri);
  }

  return {
    scopes: graphMailReadScopes,
    prompt: "select_account",
    redirectUri,
  };
}

export function createMailReadSilentRequest(account: AccountInfo): SilentRequest {
  return {
    scopes: graphMailReadScopes,
    account,
  };
}
