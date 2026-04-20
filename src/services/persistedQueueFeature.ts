import { getEnv } from "../utils/env";

export function isPersistedQueueEnabled(): boolean {
  return getEnv("VITE_USE_PERSISTED_QUEUE") === "true";
}