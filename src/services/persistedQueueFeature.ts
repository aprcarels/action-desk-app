export function isPersistedQueueEnabled(): boolean {
  return import.meta.env.VITE_USE_PERSISTED_QUEUE === "true";
}
