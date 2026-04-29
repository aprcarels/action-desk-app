import { getEnv } from "../utils/env";
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
  return getEnv("VITE_INBOX_SOURCE") === "api" ? "api" : "dev";
}

function getActiveEmailSource(): EmailSource {
  if (resolveInboxSourceMode() === "api") {
    return apiEmailSource;
  }

  return devJsonEmailSource;
}

export async function loadRawInboxQueue(
  options?: LoadInboxQueueOptions,
): Promise<LoadRawInboxQueueResult> {
  const pilotMode = isPilotModeEnabled();

  if (pilotMode && resolveInboxSourceMode() !== "api") {
    return {
      items: [],
      nextCursor: undefined,
    };
  }

  if (getEnv("DEV") === "true") {
    console.info("[Action Desk] Inbox source mode:", resolveInboxSourceMode());
  }

  const sourceResult = await getActiveEmailSource().listEmails({
    cursor: options?.cursor,
    interactiveAuth: options?.interactiveAuth,
  });

  const visibleEmails = filterInboxEmailsForPilotMode(
    sourceResult.emails,
    pilotMode,
  );

  // TODO: Rebuild inbox filtering safely.
  // Do NOT reintroduce strict filtering that can hide all emails.
  // Future approach should classify emails, not hard-filter them.
  const filteredRelevantEmails = visibleEmails;

  return {
    items: filteredRelevantEmails,
    nextCursor: sourceResult.nextCursor,
  };
}

export async function loadInboxQueue(
  options?: LoadInboxQueueOptions,
): Promise<LoadInboxQueueResult> {
  const sourceResult = await loadRawInboxQueue(options);

  return {
    items: sourceResult.items.map(mapRawInboxEmailToEmailItem),
    nextCursor: sourceResult.nextCursor,
  };
}
