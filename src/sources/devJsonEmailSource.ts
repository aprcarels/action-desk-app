import { getMockInboxPage } from "../mocks/mockInboxApi";
import { getEnv } from "../utils/env";
import type { EmailSource, EmailSourceListResult } from "../types/inboxSource";

function isDemoDataEnabled(): boolean {
  return getEnv("ACTION_DESK_ENABLE_DEMO_DATA") === "true";
}

export const devJsonEmailSource: EmailSource = {
  async listEmails(options): Promise<EmailSourceListResult> {
    if (!isDemoDataEnabled()) {
      return {
        emails: [],
        nextCursor: undefined,
      };
    }

    return getMockInboxPage(options);
  },
};
