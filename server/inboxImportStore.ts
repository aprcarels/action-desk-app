import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { getMockRawInboxEmails } from "../src/mocks/mockInboxApi";
import { cleanEmailText } from "../src/services/cleanEmailText";
import type {
  EmailSourceListResult,
  RawInboxEmail,
  RawInboxEmailHeader,
} from "../src/types/inboxSource";

type InboxImportPayload = {
  id: string;
  subject: string;
  bodyText: string;
  fromName: string;
  fromEmail: string;
  receivedAt: string;
};

const DEFAULT_PAGE_SIZE = 6;
const importedInboxFilePath = resolve(__dirname, "..", ".local-data", "imported-inbox.json");

function isDemoDataEnabled(): boolean {
  return process.env.ACTION_DESK_ENABLE_DEMO_DATA === "true";
}

function ensureImportedInboxFile() {
  const folderPath = dirname(importedInboxFilePath);

  if (!existsSync(folderPath)) {
    mkdirSync(folderPath, { recursive: true });
  }

  if (!existsSync(importedInboxFilePath)) {
    writeFileSync(importedInboxFilePath, "[]", "utf8");
  }
}

function isPersistedRawInboxEmail(value: unknown): value is RawInboxEmail {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  const isRawInboxEmailHeader = (header: unknown): header is RawInboxEmailHeader => {
    if (!header || typeof header !== "object") {
      return false;
    }

    const candidateHeader = header as Record<string, unknown>;
    return (
      typeof candidateHeader.name === "string" &&
      typeof candidateHeader.value === "string"
    );
  };

  return (
    typeof candidate.id === "string" &&
    typeof candidate.externalId === "string" &&
    typeof candidate.subject === "string" &&
    typeof candidate.fromName === "string" &&
    typeof candidate.fromEmail === "string" &&
    typeof candidate.receivedAt === "string" &&
    typeof candidate.bodyText === "string" &&
    typeof candidate.provider === "string" &&
    (candidate.sentAt === undefined || typeof candidate.sentAt === "string") &&
    (candidate.threadId === undefined || typeof candidate.threadId === "string") &&
    (candidate.locationId === undefined || typeof candidate.locationId === "string") &&
    (candidate.bodyHtml === undefined || typeof candidate.bodyHtml === "string") &&
    (candidate.previewText === undefined || typeof candidate.previewText === "string") &&
    (candidate.hasAttachments === undefined ||
      typeof candidate.hasAttachments === "boolean") &&
    (candidate.outlookWebLink === undefined ||
      typeof candidate.outlookWebLink === "string") &&
    (candidate.toRecipients === undefined ||
      (Array.isArray(candidate.toRecipients) &&
        candidate.toRecipients.every((recipient) => typeof recipient === "string"))) &&
    (candidate.ccRecipients === undefined ||
      (Array.isArray(candidate.ccRecipients) &&
        candidate.ccRecipients.every((recipient) => typeof recipient === "string"))) &&
    (candidate.internetMessageHeaders === undefined ||
      (Array.isArray(candidate.internetMessageHeaders) &&
        candidate.internetMessageHeaders.every(isRawInboxEmailHeader)))
  );
}

function isInboxImportPayload(value: unknown): value is InboxImportPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.subject === "string" &&
    typeof candidate.bodyText === "string" &&
    typeof candidate.fromName === "string" &&
    typeof candidate.fromEmail === "string" &&
    typeof candidate.receivedAt === "string"
  );
}

function buildPreviewText(bodyText: string): string {
  return bodyText.replace(/\s+/g, " ").trim();
}

function normalizeImportedEmail(payload: InboxImportPayload): RawInboxEmail {
  const cleanedBodyText = cleanEmailText(payload.bodyText);

  return {
    id: payload.id.trim(),
    externalId: payload.id.trim(),
    subject: payload.subject.trim(),
    fromName: payload.fromName.trim(),
    fromEmail: payload.fromEmail.trim(),
    receivedAt: payload.receivedAt.trim(),
    bodyText: cleanedBodyText,
    previewText: buildPreviewText(cleanedBodyText),
    provider: "outlook_addin_import",
  };
}

function loadPersistedImportedEmails(): RawInboxEmail[] {
  ensureImportedInboxFile();

  try {
    const rawFile = readFileSync(importedInboxFilePath, "utf8");
    const parsed = JSON.parse(rawFile) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isPersistedRawInboxEmail);
  } catch {
    return [];
  }
}

function persistImportedEmails(importedEmails: RawInboxEmail[]) {
  ensureImportedInboxFile();
  writeFileSync(importedInboxFilePath, JSON.stringify(importedEmails, null, 2), "utf8");
}

let importedInboxStore = loadPersistedImportedEmails();

export function importInboxEmail(payload: unknown): { success: true } {
  if (!isInboxImportPayload(payload)) {
    throw new Error("Invalid inbox import payload.");
  }

  const normalizedEmail = normalizeImportedEmail(payload);

  if (
    !normalizedEmail.id ||
    !normalizedEmail.subject ||
    !normalizedEmail.bodyText ||
    !normalizedEmail.fromName ||
    !normalizedEmail.fromEmail ||
    !normalizedEmail.receivedAt
  ) {
    throw new Error("Invalid inbox import payload.");
  }

  importedInboxStore = importedInboxStore.filter((email) => email.id !== normalizedEmail.id);
  importedInboxStore.unshift(normalizedEmail);
  persistImportedEmails(importedInboxStore);

  return { success: true };
}

export function getInboxPage(options?: {
  cursor?: string;
  limit?: number;
}): EmailSourceListResult {
  importedInboxStore = loadPersistedImportedEmails();

  const seededEmails = isDemoDataEnabled()
    ? getMockRawInboxEmails().filter(
        (seededEmail) =>
          !importedInboxStore.some((importedEmail) => importedEmail.id === seededEmail.id),
      )
    : [];
  const rawEmails = [...importedInboxStore, ...seededEmails];
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
