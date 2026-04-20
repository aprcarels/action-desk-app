type EnvKey =
  | "DEV"
  | "VITE_INBOX_SOURCE"
  | "VITE_PILOT_MODE"
  | "VITE_AZURE_CLIENT_ID"
  | "VITE_AZURE_TENANT_ID"
  | "VITE_AZURE_AUTHORITY"
  | "VITE_AZURE_REDIRECT_URI"
  | "VITE_USE_PERSISTED_QUEUE";

type ViteEnv = ImportMetaEnv & Record<string, string | boolean | undefined>;

function readFromViteEnv(key: string): string | undefined {
  try {
    const viteEnv = import.meta.env as ViteEnv | undefined;
    const value = viteEnv?.[key];

    if (typeof value === "string") {
      return value;
    }

    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }

    return undefined;
  } catch {
    return undefined;
  }
}

export function getEnv(key: EnvKey): string | undefined {
  return readFromViteEnv(key);
}