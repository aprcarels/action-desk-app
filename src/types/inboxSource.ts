export type InboxProvider =
  | "dev_json"
  | "outlook_graph"
  | "outlook_addin_import"
  | "test_data";

export type RawInboxEmailHeader = {
  name: string;
  value: string;
};

export type RawInboxEmail = {
  id: string;
  externalId: string;
  provider: InboxProvider;
  threadId?: string;
  locationId?: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  receivedAt: string;
  bodyText: string;
  bodyHtml?: string;
  previewText?: string;
  outlookWebLink?: string;
  toRecipients?: string[];
  ccRecipients?: string[];
  internetMessageHeaders?: RawInboxEmailHeader[];
};

export type EmailSourceListResult = {
  emails: RawInboxEmail[];
  nextCursor?: string;
};

export interface EmailSource {
  listEmails(options?: {
    limit?: number;
    cursor?: string;
    interactiveAuth?: boolean;
  }): Promise<EmailSourceListResult>;
}
