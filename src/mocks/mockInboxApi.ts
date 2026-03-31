import { mockEmails } from "../data/mockEmails";
import type { EmailSourceListResult, RawInboxEmail } from "../types/inboxSource";

const DEFAULT_PAGE_SIZE = 6;

function mapSeededEmailToRawInboxEmail(seedEmail: (typeof mockEmails)[number]): RawInboxEmail {
  return {
    id: seedEmail.id,
    subject: seedEmail.subject,
    fromName: seedEmail.senderName,
    fromEmail: seedEmail.senderEmail,
    receivedAt: seedEmail.receivedAt,
    bodyText: seedEmail.body,
    provider: "mock_api",
  };
}

export function getMockRawInboxEmails(): RawInboxEmail[] {
  return mockEmails.map(mapSeededEmailToRawInboxEmail);
}

export function getMockInboxPage(options?: {
  cursor?: string;
  limit?: number;
}): EmailSourceListResult {
  const rawEmails = getMockRawInboxEmails();
  const parsedCursor = options?.cursor ? Number.parseInt(options.cursor, 10) : 0;
  const startIndex = Number.isNaN(parsedCursor) ? 0 : Math.max(parsedCursor, 0);
  const pageSize =
    typeof options?.limit === "number" && options.limit > 0
      ? Math.floor(options.limit)
      : DEFAULT_PAGE_SIZE;
  const emails = rawEmails.slice(startIndex, startIndex + pageSize);
  const nextCursor =
    startIndex + pageSize < rawEmails.length ? String(startIndex + pageSize) : undefined;

  return {
    emails,
    nextCursor,
  };
}
