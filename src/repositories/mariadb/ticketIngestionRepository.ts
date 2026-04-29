import {
  logDatabaseError,
  withTransaction,
  type DatabaseTransaction,
  type QueryParameter,
} from "../../persistence/mariadb/database";
import { readId } from "./rowMappers";
import { recalculateTicketSla } from "./slaRepository";
import { upsertByConversationId } from "./ticketsRepository";
import type {
  CreateTicketInput,
  DatabaseId,
  TicketMessageDirection,
  TicketMessageSource,
  TicketSenderType,
  TicketSource,
} from "./schemaTypes";

type IncomingEmailRecipient =
  | string
  | {
      emailAddress?: {
        address?: string;
      };
    };

type IncomingEmailFrom =
  | string
  | {
      emailAddress?: {
        address?: string;
      };
    };

export type IncomingEmail = {
  id?: string;
  messageId?: string;
  externalId?: string;
  conversationId?: string;
  conversation_id?: string;
  threadId?: string;
  mailboxId?: string;
  mailbox_id?: string;
  provider?: string;
  receivedDateTime?: string;
  receivedAt?: string;
  sentDateTime?: string;
  sentAt?: string;
  subject?: string;
  senderEmail?: string;
  fromEmail?: string;
  from?: IncomingEmailFrom;
  senderType?: TicketSenderType;
  direction?: TicketMessageDirection;
  toEmails?: string[];
  toRecipients?: IncomingEmailRecipient[];
  ccEmails?: string[];
  ccRecipients?: IncomingEmailRecipient[];
  bodyPreview?: string;
  previewText?: string;
  bodyText?: string;
  queueId?: DatabaseId | null;
  slaProfileId?: DatabaseId;
};

export type TicketIngestionOptions = {
  source?: TicketMessageSource;
  transaction?: DatabaseTransaction;
};

export type TicketUpsertByEmailResult = {
  ticketId: string;
  created: boolean;
};

export type TicketMessageInsertResult = {
  messageId: string;
  inserted: boolean;
};

const DEFAULT_TICKET_SOURCE: TicketMessageSource = "webhook";
const DEFAULT_MESSAGE_SOURCE: TicketMessageSource = "webhook";
const FALLBACK_SLA_PROFILE_ID = 1;

function normalizeText(value: string | undefined): string {
  return value?.trim() ?? "";
}

function requireText(value: string | undefined, fieldName: string): string {
  const normalized = normalizeText(value);

  if (!normalized) {
    throw new Error(`${fieldName} is required for email ingestion.`);
  }

  return normalized;
}

function normalizeDateTime(value: string | undefined, fieldName: string): string {
  const normalized = requireText(value, fieldName);
  const timestamp = Date.parse(normalized);

  if (Number.isNaN(timestamp)) {
    return normalized;
  }

  return new Date(timestamp).toISOString().slice(0, 19).replace("T", " ");
}

function getMessageId(email: IncomingEmail): string {
  return requireText(
    email.messageId ?? email.id ?? email.externalId,
    "message_id",
  );
}

function getConversationId(email: IncomingEmail): string {
  return requireText(
    email.conversationId ??
      email.conversation_id ??
      email.threadId ??
      email.messageId ??
      email.id ??
      email.externalId,
    "conversation_id",
  );
}

function getMailboxId(email: IncomingEmail): string {
  return (
    normalizeText(email.mailboxId ?? email.mailbox_id) ||
    normalizeText(email.provider) ||
    "unknown_mailbox"
  );
}

function getSenderEmail(email: IncomingEmail): string {
  if (typeof email.from === "string") {
    return requireText(email.senderEmail ?? email.fromEmail ?? email.from, "sender_email");
  }

  return requireText(
    email.senderEmail ??
      email.fromEmail ??
      email.from?.emailAddress?.address,
    "sender_email",
  );
}

function getSubject(email: IncomingEmail): string {
  return normalizeText(email.subject) || "(no subject)";
}

function getReceivedDateTime(email: IncomingEmail): string {
  return normalizeDateTime(
    email.receivedDateTime ?? email.receivedAt,
    "received_at",
  );
}

function getSentOrReceivedDateTime(email: IncomingEmail): string {
  return normalizeDateTime(
    email.sentDateTime ??
      email.sentAt ??
      email.receivedDateTime ??
      email.receivedAt,
    "sent_or_received_at",
  );
}

function getBodyPreview(email: IncomingEmail): string | null {
  return (
    normalizeText(email.bodyPreview) ||
    normalizeText(email.previewText) ||
    normalizeText(email.bodyText) ||
    null
  );
}

function normalizeRecipient(recipient: IncomingEmailRecipient): string {
  if (typeof recipient === "string") {
    return recipient.trim();
  }

  return recipient.emailAddress?.address?.trim() ?? "";
}

function normalizeRecipients(
  recipients?: IncomingEmailRecipient[] | string[],
): string[] {
  return (
    recipients
      ?.map((recipient) => normalizeRecipient(recipient))
      .filter((recipient) => recipient.length > 0) ?? []
  );
}

function stringifyRecipients(recipients: string[]): string | null {
  return recipients.length > 0 ? JSON.stringify(recipients) : null;
}

function normalizeDirection(email: IncomingEmail): TicketMessageDirection {
  return email.direction === "outbound" ? "outbound" : "inbound";
}

async function runInTransaction<T>(
  transaction: DatabaseTransaction | undefined,
  callback: (activeTransaction: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  if (transaction) {
    return callback(transaction);
  }

  return withTransaction(callback);
}

async function resolveDefaultSlaProfileId(
  email: IncomingEmail,
  transaction: DatabaseTransaction,
): Promise<DatabaseId> {
  if (email.slaProfileId !== undefined) {
    return email.slaProfileId;
  }

  if (email.queueId !== undefined && email.queueId !== null) {
    const queueRows = await transaction.query(
      `
        SELECT default_sla_profile_id AS slaProfileId
        FROM queues
        WHERE id = ? AND is_active = TRUE
        LIMIT 1
      `,
      [email.queueId],
    );

    if (queueRows[0]?.slaProfileId !== null && queueRows[0]?.slaProfileId !== undefined) {
      return readId(queueRows[0], "slaProfileId");
    }
  }

  const generalQueueRows = await transaction.query(
    `
      SELECT default_sla_profile_id AS slaProfileId
      FROM queues
      WHERE name = ? AND is_active = TRUE
      LIMIT 1
    `,
    ["general_queue"],
  );

  if (
    generalQueueRows[0]?.slaProfileId !== null &&
    generalQueueRows[0]?.slaProfileId !== undefined
  ) {
    return readId(generalQueueRows[0], "slaProfileId");
  }

  const fallbackRows = await transaction.query(
    `
      SELECT id AS slaProfileId
      FROM sla_profiles
      WHERE name = ? AND is_active = TRUE
      LIMIT 1
    `,
    ["customer_standard"],
  );

  return fallbackRows[0]
    ? readId(fallbackRows[0], "slaProfileId")
    : FALLBACK_SLA_PROFILE_ID;
}

async function buildCreateTicketInput(
  email: IncomingEmail,
  source: TicketMessageSource,
  transaction: DatabaseTransaction,
): Promise<CreateTicketInput> {
  return {
    conversationId: getConversationId(email),
    source: source as TicketSource,
    mailboxId: getMailboxId(email),
    receivedAt: getReceivedDateTime(email),
    subject: getSubject(email),
    senderEmail: getSenderEmail(email),
    senderType: email.senderType ?? "unknown",
    queueId: email.queueId ?? null,
    slaProfileId: await resolveDefaultSlaProfileId(email, transaction),
  };
}

function buildMessageInsertParameters(
  ticketId: DatabaseId,
  email: IncomingEmail,
  source: TicketMessageSource,
): QueryParameter[] {
  return [
    ticketId,
    getMessageId(email),
    getConversationId(email),
    getMailboxId(email),
    normalizeDirection(email),
    source,
    getSenderEmail(email),
    stringifyRecipients(normalizeRecipients(email.toRecipients ?? email.toEmails)),
    stringifyRecipients(normalizeRecipients(email.ccRecipients ?? email.ccEmails)),
    getSubject(email),
    getBodyPreview(email),
    getSentOrReceivedDateTime(email),
  ];
}

function buildAuditDetails(
  email: IncomingEmail,
  source: TicketMessageSource,
): Record<string, unknown> {
  return {
    message_id: getMessageId(email),
    conversation_id: getConversationId(email),
    mailbox_id: getMailboxId(email),
    source,
  };
}

async function writeTicketAuditLog(
  ticketId: DatabaseId,
  eventType: "TICKET_CREATED" | "MESSAGE_ADDED",
  details: Record<string, unknown>,
  transaction: DatabaseTransaction,
): Promise<void> {
  await transaction.execute(
    `
      INSERT INTO audit_log (
        entity_type,
        entity_id,
        event_type,
        details
      )
      VALUES (?, ?, ?, ?)
    `,
    ["ticket", ticketId, eventType, JSON.stringify(details)],
  );
}

export async function upsertTicketByConversationId(
  email: IncomingEmail,
  options: TicketIngestionOptions = {},
): Promise<TicketUpsertByEmailResult> {
  const source = options.source ?? DEFAULT_TICKET_SOURCE;

  return runInTransaction(options.transaction, async (transaction) => {
    const ticketInput = await buildCreateTicketInput(email, source, transaction);
    const result = await upsertByConversationId(ticketInput, transaction);

    return {
      ticketId: result.ticket.id,
      created: result.created,
    };
  });
}

export async function insertTicketMessage(
  ticketId: DatabaseId,
  email: IncomingEmail,
  source: TicketMessageSource = DEFAULT_MESSAGE_SOURCE,
  options: TicketIngestionOptions = {},
): Promise<TicketMessageInsertResult> {
  return runInTransaction(options.transaction, async (transaction) => {
    const messageId = getMessageId(email);
    const result = await transaction.execute(
      `
        INSERT INTO ticket_messages (
          ticket_id,
          message_id,
          conversation_id,
          mailbox_id,
          direction,
          source,
          from_email,
          to_emails,
          cc_emails,
          subject,
          body_preview,
          sent_or_received_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE message_id = message_id
      `,
      buildMessageInsertParameters(ticketId, email, source),
    );

    return {
      messageId,
      inserted: result.affectedRows === 1,
    };
  });
}

export async function processIncomingEmail(
  email: IncomingEmail,
  source: TicketMessageSource,
): Promise<string | null> {
  try {
    return await withTransaction(async (transaction) => {
      const ticketResult = await upsertTicketByConversationId(email, {
        source,
        transaction,
      });
      const messageResult = await insertTicketMessage(
        ticketResult.ticketId,
        email,
        source,
        { transaction },
      );
      const auditDetails = buildAuditDetails(email, source);

      if (ticketResult.created) {
        await recalculateTicketSla(ticketResult.ticketId, {
          eventType: "CREATED",
          transaction,
        });
        await writeTicketAuditLog(
          ticketResult.ticketId,
          "TICKET_CREATED",
          auditDetails,
          transaction,
        );
      }

      if (messageResult.inserted) {
        await writeTicketAuditLog(
          ticketResult.ticketId,
          "MESSAGE_ADDED",
          auditDetails,
          transaction,
        );
      }

      return ticketResult.ticketId;
    });
  } catch (error) {
    logDatabaseError("Incoming email ingestion failed.", error);
    return null;
  }
}

export const ticketIngestionRepository = {
  upsertTicketByConversationId,
  insertTicketMessage,
  processIncomingEmail,
};
