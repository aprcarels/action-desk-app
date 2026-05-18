import type {
  AccountInfo,
  Configuration,
  PopupRequest,
  SilentRequest,
} from "@azure/msal-browser";
import { getEnv } from "../utils/env";

export const graphMailReadWriteScopes = ["Mail.ReadWrite"];
const MSAL_CALLBACK_PATH = "/auth/popup-callback.html";

type MsalRuntimeConfig = {
  clientId?: string;
  tenantId?: string;
  authority?: string;
  redirectUri?: string;
};

export function getMsalRuntimeConfig(): MsalRuntimeConfig {
  return {
    clientId: getEnv("VITE_AZURE_CLIENT_ID"),
    tenantId: getEnv("VITE_AZURE_TENANT_ID"),
    authority: getEnv("VITE_AZURE_AUTHORITY"),
    redirectUri: getEnv("VITE_AZURE_REDIRECT_URI"),
  };
}

function normalizeLocalhostProtocol(
  url: string,
  options?: { preferHttps?: boolean },
): string {
  try {
    const parsedUrl = new URL(url);

    if (
      options?.preferHttps === true &&
      parsedUrl.hostname === "localhost" &&
      parsedUrl.protocol === "http:"
    ) {
      parsedUrl.protocol = "https:";
      return parsedUrl.toString();
    }

    return url;
  } catch {
    return url;
  }
}

function isElectronDesktopRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.actionDeskDesktop?.isElectron)
  );
}

function resolveRedirectBaseUrl(config: MsalRuntimeConfig): string {
  const isElectronDesktop = isElectronDesktopRuntime();
  const windowOrigin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : undefined;
  const fallbackOrigin = windowOrigin ?? "https://localhost:5173";
  const configuredBaseUrl =
    isElectronDesktop && windowOrigin
      ? windowOrigin
      : config.redirectUri ?? fallbackOrigin;

  return normalizeLocalhostProtocol(configuredBaseUrl, {
    preferHttps: !isElectronDesktop,
  });
}

function resolveAuthCallbackRedirectUri(config: MsalRuntimeConfig): string {
  return new URL(
    MSAL_CALLBACK_PATH,
    resolveRedirectBaseUrl(config),
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

export function createMailReadWritePopupRequest(): PopupRequest {
  const redirectUri = resolveAuthCallbackRedirectUri(getMsalRuntimeConfig());

  if (getEnv("DEV") === "true") {
    console.info("[Action Desk] MSAL popup redirect URI:", redirectUri);
  }

  return {
    scopes: graphMailReadWriteScopes,
    prompt: "select_account",
    redirectUri,
  };
}

export function createMailReadWriteSilentRequest(account: AccountInfo): SilentRequest {
  return {
    scopes: graphMailReadWriteScopes,
    account,
  };
}
