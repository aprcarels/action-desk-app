import type { Configuration, PopupRequest } from "@azure/msal-browser";

export const graphMailReadScopes = ["Mail.Read"];

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
      redirectUri: config.redirectUri ?? window.location.origin,
    },
    cache: {
      cacheLocation: "localStorage",
    },
  };
}

export function createMailReadPopupRequest(): PopupRequest {
  return {
    scopes: graphMailReadScopes,
    prompt: "select_account",
    redirectUri: new URL(
      "/auth/popup-callback.html",
      getMsalRuntimeConfig().redirectUri ?? window.location.origin,
    ).toString(),
  };
}
