import type { RawInboxEmail } from "../types/inboxSource";

export const PILOT_ORDER_DATA_MESSAGE = "Order data not connected yet. Verify in WMS.";

export function isPilotModeEnabled(): boolean {
  return import.meta.env.VITE_PILOT_MODE === "true";
}

export function filterInboxEmailsForPilotMode(
  emails: RawInboxEmail[],
  pilotMode: boolean,
): RawInboxEmail[] {
  if (!pilotMode) {
    return emails;
  }

  return emails.filter((email) => email.provider !== "dev_json");
}
