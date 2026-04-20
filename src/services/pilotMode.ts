import { getEnv } from "../utils/env";

export const PILOT_ORDER_DATA_MESSAGE =
  "Order context is currently using pilot/demo-safe data unless otherwise noted.";

export function isPilotModeEnabled(): boolean {
  return getEnv("VITE_PILOT_MODE") === "true";
}

export function filterInboxEmailsForPilotMode<T>(
  items: T[],
  pilotMode = isPilotModeEnabled(),
): T[] {
  if (!pilotMode) {
    return items;
  }

  return items.filter((item) => {
    const source = (item as { source?: string } | null)?.source;

    return source === "outlook_import" || source === "outlook_graph";
  });
}