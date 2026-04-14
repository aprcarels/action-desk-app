interface ImportMetaEnv {
  readonly VITE_INBOX_SOURCE?: "dev" | "api";
  readonly VITE_PILOT_MODE?: "true" | "false";
  readonly VITE_ORDER_CONTEXT_SOURCE?: "mock" | "real";
  readonly VITE_ORDER_CONTEXT_API_BASE_URL?: string;
  readonly VITE_AZURE_CLIENT_ID?: string;
  readonly VITE_AZURE_TENANT_ID?: string;
  readonly VITE_AZURE_AUTHORITY?: string;
  readonly VITE_AZURE_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
