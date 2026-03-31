import { getMockInboxPage } from "../mocks/mockInboxApi";
import type { EmailSource, EmailSourceListResult } from "../types/inboxSource";

export const devJsonEmailSource: EmailSource = {
  async listEmails(options): Promise<EmailSourceListResult> {
    return getMockInboxPage(options);
  },
};
