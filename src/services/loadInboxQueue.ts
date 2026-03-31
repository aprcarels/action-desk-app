import { apiEmailSource } from "../sources/apiEmailSource";
import { devJsonEmailSource } from "../sources/devJsonEmailSource";
import { mapRawInboxEmailToEmailItem } from "../sources/mapRawInboxEmailToEmailItem";
import type { EmailItem } from "../types/actionDesk";
import type { EmailSource } from "../types/inboxSource";

type LoadInboxQueueResult = {
  items: EmailItem[];
  nextCursor?: string;
};

function getActiveEmailSource(): EmailSource {
  if (import.meta.env.VITE_INBOX_SOURCE === "api") {
    return apiEmailSource;
  }

  return devJsonEmailSource;
}

export async function loadInboxQueue(cursor?: string): Promise<LoadInboxQueueResult> {
  const sourceResult = await getActiveEmailSource().listEmails({ cursor });

  return {
    items: sourceResult.emails.map(mapRawInboxEmailToEmailItem),
    nextCursor: sourceResult.nextCursor,
  };
}
