import { getEnv } from "../utils/env";

export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_MODEL = "qwen2.5:3b";
export const DEFAULT_OLLAMA_TIMEOUT_MS = 4000;

export function getOllamaBaseUrl(): string {
  return getEnv("OLLAMA_BASE_URL")?.trim() || DEFAULT_OLLAMA_BASE_URL;
}

export function getOllamaModel(): string {
  return getEnv("OLLAMA_MODEL")?.trim() || DEFAULT_OLLAMA_MODEL;
}

export function getOllamaTimeoutMs(): number {
  const parsed = Number.parseInt(getEnv("OLLAMA_TIMEOUT_MS") ?? "", 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_OLLAMA_TIMEOUT_MS;
  }

  return parsed;
}

export const OLLAMA_BASE_URL = getOllamaBaseUrl();
export const OLLAMA_URL = `${OLLAMA_BASE_URL.replace(/\/+$/, "")}/api/generate`;
export const OLLAMA_MODEL = getOllamaModel();
export const OLLAMA_TIMEOUT_MS = getOllamaTimeoutMs();
