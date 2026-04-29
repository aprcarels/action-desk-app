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
    const provider = (item as { provider?: string } | null)?.provider;

    return (
      source === "outlook_import" ||
      source === "outlook_graph" ||
      source === "test_data" ||
      provider === "outlook_addin_import" ||
      provider === "outlook_graph" ||
      provider === "test_data"
    );
  });
}
