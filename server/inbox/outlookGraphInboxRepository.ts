import type { EmailSourceListResult } from "../../src/types/inboxSource";
import type { InboxRepository, InboxRepositoryListOptions } from "./inboxRepository";
import { normalizeGraphMessagesResponse } from "./inboxNormalizer";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const DEFAULT_INBOX_PAGE_SIZE = 25;

function buildGraphMessagesPath(cursor?: string, limit?: number) {
  if (cursor) {
    return cursor.startsWith("/") ? cursor : `/${cursor}`;
  }

  const searchParams = new URLSearchParams({
    "$top": String(limit ?? DEFAULT_INBOX_PAGE_SIZE),
    "$orderby": "receivedDateTime desc",
    "$select":
      "id,conversationId,subject,from,receivedDateTime,sentDateTime,bodyPreview,body,hasAttachments,webLink,toRecipients,ccRecipients,internetMessageHeaders",
  });

  return `/me/messages?${searchParams.toString()}`;
}

export class OutlookGraphInboxRepository implements InboxRepository {
  async listMessages(options?: InboxRepositoryListOptions): Promise<EmailSourceListResult> {
    const authorization = options?.authorization?.trim();

    if (!authorization?.startsWith("Bearer ")) {
      throw new Error("Missing Outlook authorization token.");
    }

    const graphPath = buildGraphMessagesPath(options?.cursor, options?.limit);
    const response = await fetch(`${GRAPH_BASE_URL}${graphPath}`, {
      method: "GET",
      headers: {
        Authorization: authorization,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Outlook inbox request failed with status ${response.status}.`);
    }

    const payload: unknown = await response.json();
    return normalizeGraphMessagesResponse(payload);
  }
}
