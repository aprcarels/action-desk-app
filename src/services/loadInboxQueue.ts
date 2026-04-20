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
    console.log("[loadInboxQueue] pilot mode enabled and inbox source is not api; returning empty inbox");
    return {
      items: [],
      nextCursor: undefined,
    };
  }

  if (getEnv("DEV") === "true") {
    console.info("[Action Desk] Inbox source mode:", resolveInboxSourceMode());
  }

  console.log("[loadInboxQueue] VITE_INBOX_SOURCE:", getEnv("VITE_INBOX_SOURCE"));
  console.log("[loadInboxQueue] resolved mode:", resolveInboxSourceMode());
  console.log("[loadInboxQueue] interactiveAuth:", options?.interactiveAuth);
  console.log(
    "[loadInboxQueue] source:",
    resolveInboxSourceMode() === "api" ? "apiEmailSource" : "devJsonEmailSource",
  );

  const sourceResult = await getActiveEmailSource().listEmails({
    cursor: options?.cursor,
    interactiveAuth: options?.interactiveAuth,
  });

  console.log("[loadInboxQueue] sourceResult email count:", sourceResult.emails.length);

  const visibleEmails = filterInboxEmailsForPilotMode(
    sourceResult.emails,
    pilotMode,
  );

  console.log("[loadInboxQueue] visible email count after pilot filter:", visibleEmails.length);

  return {
    items: visibleEmails,
    nextCursor: visibleEmails.length > 0 ? sourceResult.nextCursor : undefined,
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