import { apiEmailSource } from "../sources/apiEmailSource";
import { devJsonEmailSource } from "../sources/devJsonEmailSource";
import { mapRawInboxEmailToEmailItem } from "../sources/mapRawInboxEmailToEmailItem";
import { filterInboxEmailsForPilotMode, isPilotModeEnabled } from "./pilotMode";
import type { EmailItem } from "../types/actionDesk";
import type { EmailSource, RawInboxEmail } from "../types/inboxSource";

type LoadInboxQueueOptions = {
  cursor?: string;
  interactiveAuth?: boolean;
};

type LoadInboxQueueResult = {
  items: EmailItem[];
  nextCursor?: string;
};

export type LoadRawInboxQueueResult = {
  items: RawInboxEmail[];
  nextCursor?: string;
};

function resolveInboxSourceMode(): "api" | "dev" {
  return import.meta.env.VITE_INBOX_SOURCE === "api" ? "api" : "dev";
}

function getActiveEmailSource(): EmailSource {
  if (resolveInboxSourceMode() === "api") {
    return apiEmailSource;
  }

  return devJsonEmailSource;
}

export async function loadRawInboxQueue(options?: LoadInboxQueueOptions): Promise<LoadRawInboxQueueResult> {
  const pilotMode = isPilotModeEnabled();

  if (pilotMode && resolveInboxSourceMode() !== "api") {
    return {
      items: [],
      nextCursor: undefined,
    };
  }

  if (import.meta.env.DEV) {
    console.info("[Action Desk] Inbox source mode:", resolveInboxSourceMode());
  }

  const sourceResult = await getActiveEmailSource().listEmails({
    cursor: options?.cursor,
    interactiveAuth: options?.interactiveAuth,
  });
  const visibleEmails = filterInboxEmailsForPilotMode(sourceResult.emails, pilotMode);

  return {
    items: visibleEmails,
    nextCursor: visibleEmails.length > 0 ? sourceResult.nextCursor : undefined,
  };
}

export async function loadInboxQueue(options?: LoadInboxQueueOptions): Promise<LoadInboxQueueResult> {
  const sourceResult = await loadRawInboxQueue(options);

  return {
    items: sourceResult.items.map(mapRawInboxEmailToEmailItem),
    nextCursor: sourceResult.nextCursor,
  };
}
