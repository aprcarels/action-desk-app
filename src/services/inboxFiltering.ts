import { getEnv } from "../utils/env";
import type { RawInboxEmail } from "../types/inboxSource";

const DEFAULT_GROUP_INBOX_ADDRESSES = ["ecomcsr@apexpress.com"];

function normalizeEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

function parseEmailAddresses(value: string): string[] {
  return (
    value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)?.map(normalizeEmailAddress) ??
    []
  );
}

function getHeaderEmailAddresses(rawEmail: RawInboxEmail): string[] {
  return (
    rawEmail.internetMessageHeaders
      ?.filter((header) =>
        [
          "to",
          "cc",
          "delivered-to",
          "x-original-to",
          "apparently-to",
          "envelope-to",
        ].includes(header.name.trim().toLowerCase()),
      )
      .flatMap((header) => parseEmailAddresses(header.value)) ?? []
  );
}

function getRecipientEmailAddresses(rawEmail: RawInboxEmail): string[] {
  return [
    ...(rawEmail.toRecipients ?? []),
    ...(rawEmail.ccRecipients ?? []),
    ...getHeaderEmailAddresses(rawEmail),
  ].map(normalizeEmailAddress);
}

function getFallbackMessageText(rawEmail: RawInboxEmail): string {
  return [rawEmail.subject, rawEmail.previewText, rawEmail.bodyText]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .toLowerCase();
}

export function getConfiguredGroupInboxAddresses(): string[] {
  const configuredAddresses = getEnv("VITE_GROUP_INBOX_ADDRESSES")
    ?.split(/[\n,;]+/)
    .map(normalizeEmailAddress)
    .filter(Boolean);

  return configuredAddresses && configuredAddresses.length > 0
    ? configuredAddresses
    : DEFAULT_GROUP_INBOX_ADDRESSES;
}

export function isRelevantGroupDeliveredEmail(
  rawEmail: RawInboxEmail,
  groupAddresses = getConfiguredGroupInboxAddresses(),
): boolean {
  const normalizedGroupAddresses = groupAddresses
    .map(normalizeEmailAddress)
    .filter(Boolean);

  if (normalizedGroupAddresses.length === 0) {
    return true;
  }

  const recipientAddresses = getRecipientEmailAddresses(rawEmail);

  if (recipientAddresses.length > 0) {
    return normalizedGroupAddresses.some((groupAddress) =>
      recipientAddresses.includes(groupAddress),
    );
  }

  const fallbackMessageText = getFallbackMessageText(rawEmail);

  return normalizedGroupAddresses.some((groupAddress) =>
    fallbackMessageText.includes(groupAddress),
  );
}

export function filterRelevantGroupDeliveredEmails(
  rawEmails: RawInboxEmail[],
  _groupAddresses = getConfiguredGroupInboxAddresses(),
): RawInboxEmail[] {
  // TODO: Rebuild inbox filtering safely.
  // Do NOT reintroduce strict filtering that can hide all emails.
  // Future approach should classify emails, not hard-filter them.
  return rawEmails;
}
