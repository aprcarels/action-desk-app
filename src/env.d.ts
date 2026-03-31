interface ImportMetaEnv {
  readonly VITE_INBOX_SOURCE?: "dev" | "api";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
