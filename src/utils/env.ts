type EnvKey =
  | "ACTION_DESK_API_URL"
  | "VITE_ACTION_DESK_API_URL"
  | "ACTION_DESK_ENABLE_DEMO_DATA"
  | "ACTION_DESK_AI_ENABLED"
  | "OLLAMA_BASE_URL"
  | "OLLAMA_MODEL"
  | "OLLAMA_TIMEOUT_MS"
  | "DEV"
  | "VITE_INBOX_SOURCE"
  | "VITE_PILOT_MODE"
  | "VITE_AZURE_CLIENT_ID"
  | "VITE_AZURE_TENANT_ID"
  | "VITE_AZURE_AUTHORITY"
  | "VITE_AZURE_REDIRECT_URI"
  | "VITE_USE_PERSISTED_QUEUE"
  | "VITE_GROUP_INBOX_ADDRESSES"
  | "VITE_AI_CLASSIFICATION_ENABLED"
  | "VITE_SHOW_DEBUG_UI";

type RuntimeEnvSource = Record<string, string | boolean | undefined>;

function normalizeEnvValue(value: string | boolean | undefined): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return undefined;
}

function getRuntimeEnvStore(): RuntimeEnvSource | undefined {
  const runtimeGlobal = globalThis as typeof globalThis & {
    __ACTION_DESK_ENV__?: RuntimeEnvSource;
  };

  return runtimeGlobal.__ACTION_DESK_ENV__;
}

function readFromRuntimeStore(key: string): string | undefined {
  return normalizeEnvValue(getRuntimeEnvStore()?.[key]);
}

function readFromProcessEnv(key: string): string | undefined {
  if (
    typeof process === "undefined" ||
    !process.env ||
    typeof process.env[key] !== "string"
  ) {
    return undefined;
  }

  return process.env[key];
}

export function setRuntimeEnv(source: RuntimeEnvSource): void {
  const runtimeGlobal = globalThis as typeof globalThis & {
    __ACTION_DESK_ENV__?: RuntimeEnvSource;
  };

  runtimeGlobal.__ACTION_DESK_ENV__ = source;
}

export function getEnv(key: EnvKey): string | undefined {
  return readFromRuntimeStore(key) ?? readFromProcessEnv(key);
}
