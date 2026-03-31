export type RawInboxEmail = {
  id: string;
  threadId?: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  receivedAt: string;
  bodyText: string;
  bodyHtml?: string;
  provider: string;
};

export type EmailSourceListResult = {
  emails: RawInboxEmail[];
  nextCursor?: string;
};

export interface EmailSource {
  listEmails(options?: {
    limit?: number;
    cursor?: string;
  }): Promise<EmailSourceListResult>;
}
