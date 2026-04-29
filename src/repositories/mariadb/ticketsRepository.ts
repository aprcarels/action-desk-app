import {
  execute,
  isDuplicateKeyError,
  query,
  withTransaction,
  type DatabaseTransaction,
  type DatabaseRow,
  type QueryParameter,
} from "../../persistence/mariadb/database";
import {
  readId,
  readJsonObject,
  readNullableId,
  readNullableString,
  readNumber,
  readString,
  toNullableSqlValue,
  toSqlJson,
} from "./rowMappers";
import type {
  CreateTicketInput,
  DatabaseId,
  Ticket,
  TicketPriority,
  TicketSenderType,
  TicketSlaState,
  TicketSource,
  TicketStatus,
} from "./schemaTypes";

type TicketDatabaseClient = DatabaseTransaction;

export type TicketUpsertResult = {
  ticket: Ticket;
  created: boolean;
};

const TICKET_SELECT = `
  SELECT
    id,
    conversation_id AS conversationId,
    source,
    mailbox_id AS mailboxId,
    received_at AS receivedAt,
    created_at AS createdAt,
    updated_at AS updatedAt,
    subject,
    status,
    priority,
    sender_email AS senderEmail,
    sender_type AS senderType,
    customer_id AS customerId,
    match_confidence AS matchConfidence,
    queue_id AS queueId,
    assigned_csr_id AS assignedCsrId,
    sla_profile_id AS slaProfileId,
    sla_state AS slaState,
    sla_elapsed_minutes AS slaElapsedMinutes,
    first_response_at AS firstResponseAt,
    resolved_at AS resolvedAt,
    closed_at AS closedAt,
    flags
  FROM tickets
`;

const defaultDatabaseClient: TicketDatabaseClient = {
  query,
  execute,
};

function mapTicket(row: DatabaseRow): Ticket {
  return {
    id: readId(row, "id"),
    conversationId: readString(row, "conversationId"),
    source: readString(row, "source") as TicketSource,
    mailboxId: readString(row, "mailboxId"),
    receivedAt: readString(row, "receivedAt"),
    createdAt: readString(row, "createdAt"),
    updatedAt: readString(row, "updatedAt"),
    subject: readString(row, "subject"),
    status: readString(row, "status") as TicketStatus,
    priority: readString(row, "priority") as TicketPriority,
    senderEmail: readString(row, "senderEmail"),
    senderType: readString(row, "senderType") as TicketSenderType,
    customerId: readNullableId(row, "customerId"),
    matchConfidence: readNumber(row, "matchConfidence"),
    queueId: readNullableId(row, "queueId"),
    assignedCsrId: readNullableId(row, "assignedCsrId"),
    slaProfileId: readId(row, "slaProfileId"),
    slaState: readString(row, "slaState") as TicketSlaState,
    slaElapsedMinutes: readNumber(row, "slaElapsedMinutes"),
    firstResponseAt: readNullableString(row, "firstResponseAt"),
    resolvedAt: readNullableString(row, "resolvedAt"),
    closedAt: readNullableString(row, "closedAt"),
    flags: readJsonObject(row, "flags"),
  };
}

function normalizeRequiredText(value: string, fieldName: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required to create a ticket.`);
  }

  return normalized;
}

function toNullableDateTime(
  value: string | Date | null | undefined,
): QueryParameter {
  return value === undefined ? null : value;
}

function normalizeCreateTicketInput(input: CreateTicketInput): CreateTicketInput {
  return {
    ...input,
    conversationId: normalizeRequiredText(input.conversationId, "conversationId"),
    mailboxId: normalizeRequiredText(input.mailboxId, "mailboxId"),
    subject: normalizeRequiredText(input.subject, "subject"),
    senderEmail: normalizeRequiredText(input.senderEmail, "senderEmail"),
  };
}

function buildCreateTicketParameters(input: CreateTicketInput): QueryParameter[] {
  return [
    normalizeRequiredText(input.conversationId, "conversationId"),
    input.source ?? "webhook",
    normalizeRequiredText(input.mailboxId, "mailboxId"),
    input.receivedAt,
    normalizeRequiredText(input.subject, "subject"),
    input.status ?? "open",
    input.priority ?? "medium",
    normalizeRequiredText(input.senderEmail, "senderEmail"),
    input.senderType ?? "unknown",
    toNullableSqlValue(input.customerId),
    input.matchConfidence ?? 0,
    toNullableSqlValue(input.queueId),
    toNullableSqlValue(input.assignedCsrId),
    input.slaProfileId,
    input.slaState ?? "OK",
    input.slaElapsedMinutes ?? 0,
    toNullableDateTime(input.firstResponseAt),
    toNullableDateTime(input.resolvedAt),
    toNullableDateTime(input.closedAt),
    toSqlJson(input.flags),
  ];
}

async function loadById(
  id: DatabaseId,
  databaseClient: TicketDatabaseClient,
): Promise<Ticket | null> {
  const rows = await databaseClient.query(`${TICKET_SELECT} WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ? mapTicket(rows[0]) : null;
}

async function loadByConversationId(
  conversationId: string,
  databaseClient: TicketDatabaseClient,
): Promise<Ticket | null> {
  const rows = await databaseClient.query(
    `${TICKET_SELECT} WHERE conversation_id = ? LIMIT 1`,
    [conversationId],
  );
  return rows[0] ? mapTicket(rows[0]) : null;
}

async function lockTicketIdByConversationId(
  conversationId: string,
  databaseClient: TicketDatabaseClient,
): Promise<DatabaseId | null> {
  const rows = await databaseClient.query(
    "SELECT id FROM tickets WHERE conversation_id = ? FOR UPDATE",
    [conversationId],
  );

  return rows[0] ? readId(rows[0], "id") : null;
}

async function insertTicket(
  input: CreateTicketInput,
  databaseClient: TicketDatabaseClient,
): Promise<Ticket> {
  const result = await databaseClient.execute(
    `
      INSERT INTO tickets (
        conversation_id,
        source,
        mailbox_id,
        received_at,
        subject,
        status,
        priority,
        sender_email,
        sender_type,
        customer_id,
        match_confidence,
        queue_id,
        assigned_csr_id,
        sla_profile_id,
        sla_state,
        sla_elapsed_minutes,
        first_response_at,
        resolved_at,
        closed_at,
        flags
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    buildCreateTicketParameters(input),
  );

  const createdTicket =
    result.insertId !== null ? await loadById(result.insertId, databaseClient) : null;

  if (createdTicket) {
    return createdTicket;
  }

  const ticketByConversation = await loadByConversationId(
    input.conversationId,
    databaseClient,
  );

  if (ticketByConversation) {
    return ticketByConversation;
  }

  throw new Error("Ticket was inserted but could not be loaded.");
}

async function upsertByConversationIdInTransaction(
  input: CreateTicketInput,
  databaseClient: TicketDatabaseClient,
): Promise<TicketUpsertResult> {
  const normalizedInput = normalizeCreateTicketInput(input);
  const existingTicketId = await lockTicketIdByConversationId(
    normalizedInput.conversationId,
    databaseClient,
  );

  if (existingTicketId !== null) {
    const existingTicket = await loadById(existingTicketId, databaseClient);

    if (!existingTicket) {
      throw new Error("Locked ticket could not be loaded.");
    }

    return {
      ticket: existingTicket,
      created: false,
    };
  }

  try {
    return {
      ticket: await insertTicket(normalizedInput, databaseClient),
      created: true,
    };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const duplicateTicketId = await lockTicketIdByConversationId(
        normalizedInput.conversationId,
        databaseClient,
      );

      if (duplicateTicketId !== null) {
        const duplicateTicket = await loadById(duplicateTicketId, databaseClient);

        if (duplicateTicket) {
          return {
            ticket: duplicateTicket,
            created: false,
          };
        }
      }
    }

    throw error;
  }
}

export async function getById(id: DatabaseId): Promise<Ticket | null> {
  return loadById(id, defaultDatabaseClient);
}

export async function getByConversationId(
  conversationId: string,
): Promise<Ticket | null> {
  return loadByConversationId(conversationId, defaultDatabaseClient);
}

export async function upsertByConversationId(
  input: CreateTicketInput,
  transaction?: DatabaseTransaction,
): Promise<TicketUpsertResult> {
  if (transaction) {
    return upsertByConversationIdInTransaction(input, transaction);
  }

  return withTransaction((activeTransaction) =>
    upsertByConversationIdInTransaction(input, activeTransaction),
  );
}

export async function create(input: CreateTicketInput): Promise<Ticket> {
  const result = await upsertByConversationId(input);
  return result.ticket;
}

export const ticketsRepository = {
  getById,
  getByConversationId,
  upsertByConversationId,
  create,
};
