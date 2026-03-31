import { fetchInboxPage } from "../services/inboxApi";
import type { EmailSource, EmailSourceListResult } from "../types/inboxSource";

export const apiEmailSource: EmailSource = {
  async listEmails(options): Promise<EmailSourceListResult> {
    return fetchInboxPage(options);
  },
};
