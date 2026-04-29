import {
  query,
  withTransaction,
  type DatabaseRow,
  type DatabaseTransaction,
} from "../persistence/mariadb/database";
import {
  insertTicketMessage,
  upsertTicketByConversationId,
  type IncomingEmail,
} from "../repositories/mariadb/ticketIngestionRepository";
import { recalculateTicketSla } from "../repositories/mariadb/slaRepository";
import { readId, readNullableString } from "../repositories/mariadb/rowMappers";

export type SentItemMessage = {
  id: string;
  messageId?: string;
  conversationId: string;
  mailboxId?: string;
  fromEmail?: string;
  toEmails?: string[];
  ccEmails?: string[];
  subject: string;
  bodyPreview?: string;
  sentDateTime: string;
};

export type SentItemsSyncState = {
  lastSentAt: string | null;
  deltaLink: string | null;
};

export type SentItemsListResult = {
  messages: SentItemMessage[];
  deltaLink?: string | null;
};

export type SentItemsProvider = {
  listSentItems(options: {
    csrEmail: string;
    since?: string;
    deltaLink?: string;
  }): Promise<SentItemsListResult>;
};

export type SentItemsSyncResult = {
  csrEmail: string;
  processedCount: number;
  insertedMessageCount: number;
  firstResponseUpdatedCount: number;
  unmatchedTicketCount: number;
  nextSyncState: SentItemsSyncState;
};

type TicketMatch = {
  id: string;
  firstResponseAt: string | null;
};

let configuredSentItemsProvider: SentItemsProvider | null = null;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function getSyncStateKey(csrEmail: string, field: "last_sent_at" | "delta_link") {
  const mailboxKey = normalizeEmail(csrEmail)
    .replace(/[^a-z0-9_.-]/g, "_")
    .slice(0, 60);

  return `sent_items_sync:${mailboxKey}:${field}`;
}

function toMariaDbDateTime(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString().slice(0, 19).replace("T", " ");
}

function maxIsoDateTime(left: string | null, right: string): string {
  if (!left) {
    return right;
  }

  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (Number.isNaN(leftTime)) {
    return right;
  }

  if (Number.isNaN(rightTime)) {
    return left;
  }

  return rightTime > leftTime ? right : left;
}

function mapTicketMatch(row: DatabaseRow): TicketMatch {
  return {
    id: readId(row, "id"),
    firstResponseAt: readNullableString(row, "firstResponseAt"),
  };
}

async function loadSyncState(
  csrEmail: string,
  transaction: DatabaseTransaction,
): Promise<SentItemsSyncState> {
  const rows = await transaction.query(
    `
      SELECT setting_key AS settingKey, setting_value AS settingValue
      FROM app_settings
      WHERE setting_key IN (?, ?)
    `,
    [
      getSyncStateKey(csrEmail, "last_sent_at"),
      getSyncStateKey(csrEmail, "delta_link"),
    ],
  );
  const state: SentItemsSyncState = {
    lastSentAt: null,
    deltaLink: null,
  };

  for (const row of rows) {
    const key = String(row.settingKey ?? "");
    const value = String(row.settingValue ?? "").trim() || null;

    if (key.endsWith(":last_sent_at")) {
      state.lastSentAt = value;
    }

    if (key.endsWith(":delta_link")) {
      state.deltaLink = value;
    }
  }

  return state;
}

async function saveSyncSetting(
  key: string,
  value: string,
  description: string,
  transaction: DatabaseTransaction,
): Promise<void> {
  await transaction.execute(
    `
      INSERT INTO app_settings (setting_key, setting_value, description)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        setting_value = VALUES(setting_value),
        description = VALUES(description)
    `,
    [key, value, description],
  );
}

async function saveSyncState(
  csrEmail: string,
  state: SentItemsSyncState,
  transaction: DatabaseTransaction,
): Promise<void> {
  if (state.lastSentAt) {
    await saveSyncSetting(
      getSyncStateKey(csrEmail, "last_sent_at"),
      state.lastSentAt,
      "Last sent item timestamp processed for CSR sent-folder sync.",
      transaction,
    );
  }

  if (state.deltaLink) {
    await saveSyncSetting(
      getSyncStateKey(csrEmail, "delta_link"),
      state.deltaLink,
      "Provider delta cursor for CSR sent-folder sync.",
      transaction,
    );
  }
}

async function findOpenTicketByConversationId(
  conversationId: string,
  transaction: DatabaseTransaction,
): Promise<TicketMatch | null> {
  const rows = await transaction.query(
    `
      SELECT id, first_response_at AS firstResponseAt
      FROM tickets
      WHERE conversation_id = ? AND status IN ('open', 'pending')
      ORDER BY received_at DESC
      LIMIT 1
      FOR UPDATE
    `,
    [conversationId],
  );

  return rows[0] ? mapTicketMatch(rows[0]) : null;
}

async function resolveDefaultSlaProfileId(
  transaction: DatabaseTransaction,
): Promise<string> {
  const rows = await transaction.query(
    `
      SELECT default_sla_profile_id AS slaProfileId
      FROM queues
      WHERE name = ? AND is_active = TRUE
      LIMIT 1
    `,
    ["general_queue"],
  );

  return rows[0] ? readNullableString(rows[0], "slaProfileId") ?? "1" : "1";
}

function buildIncomingEmail(
  message: SentItemMessage,
  csrEmail: string,
): IncomingEmail {
  return {
    id: message.id,
    messageId: message.messageId ?? message.id,
    conversationId: message.conversationId,
    mailboxId: message.mailboxId ?? csrEmail,
    provider: "sent_items_sync",
    sentDateTime: message.sentDateTime,
    receivedDateTime: message.sentDateTime,
    subject: message.subject,
    senderEmail: message.fromEmail ?? csrEmail,
    fromEmail: message.fromEmail ?? csrEmail,
    senderType: "internal_employee",
    direction: "outbound",
    toEmails: message.toEmails ?? [],
    ccEmails: message.ccEmails ?? [],
    bodyPreview: message.bodyPreview,
  };
}

async function createTraceableTicketForSentItem(
  message: SentItemMessage,
  csrEmail: string,
  transaction: DatabaseTransaction,
): Promise<string> {
  const ticketResult = await upsertTicketByConversationId(
    {
      ...buildIncomingEmail(message, csrEmail),
      queueId: null,
      slaProfileId: await resolveDefaultSlaProfileId(transaction),
    },
    {
      source: "email_sync",
      transaction,
    },
  );

  await transaction.execute(
    `
      UPDATE tickets
      SET flags = JSON_SET(
        COALESCE(flags, JSON_OBJECT()),
        '$.createdFromUnmatchedSentItem',
        TRUE,
        '$.sentSyncMailbox',
        ?
      )
      WHERE id = ?
    `,
    [csrEmail, ticketResult.ticketId],
  );

  return ticketResult.ticketId;
}

async function updateFirstResponseAt(
  ticket: TicketMatch,
  sentDateTime: string,
  transaction: DatabaseTransaction,
): Promise<boolean> {
  if (ticket.firstResponseAt) {
    return false;
  }

  const result = await transaction.execute(
    `
      UPDATE tickets
      SET first_response_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND first_response_at IS NULL
    `,
    [toMariaDbDateTime(sentDateTime), ticket.id],
  );

  if (result.affectedRows === 0) {
    return false;
  }

  await recalculateTicketSla(ticket.id, {
    eventType: "FIRST_RESPONSE",
    transaction,
    recordUnchangedRecalculation: true,
  });
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
    [
      "ticket",
      ticket.id,
      "FIRST_RESPONSE_SYNCED",
      JSON.stringify({
        first_response_at: sentDateTime,
        source: "email_sync",
      }),
    ],
  );

  return true;
}

export function setSentItemsProvider(provider: SentItemsProvider | null) {
  configuredSentItemsProvider = provider;
}

export async function syncSentItems(
  csrEmail: string,
  provider: SentItemsProvider | null = configuredSentItemsProvider,
): Promise<SentItemsSyncResult> {
  const normalizedCsrEmail = normalizeEmail(csrEmail);

  if (!normalizedCsrEmail) {
    throw new Error("CSR email is required for sent-item sync.");
  }

  if (!provider) {
    throw new Error("Sent items provider is not configured.");
  }

  const initialSyncStateRows = await query(
    `
      SELECT setting_key AS settingKey, setting_value AS settingValue
      FROM app_settings
      WHERE setting_key IN (?, ?)
    `,
    [
      getSyncStateKey(normalizedCsrEmail, "last_sent_at"),
      getSyncStateKey(normalizedCsrEmail, "delta_link"),
    ],
  );
  const initialSyncState: SentItemsSyncState = {
    lastSentAt: null,
    deltaLink: null,
  };

  for (const row of initialSyncStateRows) {
    const key = String(row.settingKey ?? "");
    const value = String(row.settingValue ?? "").trim() || null;

    if (key.endsWith(":last_sent_at")) {
      initialSyncState.lastSentAt = value;
    }

    if (key.endsWith(":delta_link")) {
      initialSyncState.deltaLink = value;
    }
  }

  const sentItems = await provider.listSentItems({
    csrEmail: normalizedCsrEmail,
    since: initialSyncState.lastSentAt ?? undefined,
    deltaLink: initialSyncState.deltaLink ?? undefined,
  });

  return withTransaction(async (transaction) => {
    const currentSyncState = await loadSyncState(normalizedCsrEmail, transaction);
    let processedCount = 0;
    let insertedMessageCount = 0;
    let firstResponseUpdatedCount = 0;
    let unmatchedTicketCount = 0;
    let lastSentAt = currentSyncState.lastSentAt;

    for (const message of sentItems.messages) {
      const incomingEmail = buildIncomingEmail(message, normalizedCsrEmail);
      const matchedTicket = await findOpenTicketByConversationId(
        message.conversationId,
        transaction,
      );
      const ticketId = matchedTicket
        ? matchedTicket.id
        : await createTraceableTicketForSentItem(
            message,
            normalizedCsrEmail,
            transaction,
          );

      if (!matchedTicket) {
        unmatchedTicketCount += 1;
      }

      const messageResult = await insertTicketMessage(
        ticketId,
        incomingEmail,
        "email_sync",
        { transaction },
      );

      if (messageResult.inserted) {
        insertedMessageCount += 1;
      }

      if (
        matchedTicket &&
        (await updateFirstResponseAt(
          matchedTicket,
          message.sentDateTime,
          transaction,
        ))
      ) {
        firstResponseUpdatedCount += 1;
      }

      lastSentAt = maxIsoDateTime(lastSentAt, message.sentDateTime);
      processedCount += 1;
    }

    const nextSyncState: SentItemsSyncState = {
      lastSentAt,
      deltaLink: sentItems.deltaLink ?? currentSyncState.deltaLink,
    };
    await saveSyncState(normalizedCsrEmail, nextSyncState, transaction);

    return {
      csrEmail: normalizedCsrEmail,
      processedCount,
      insertedMessageCount,
      firstResponseUpdatedCount,
      unmatchedTicketCount,
      nextSyncState,
    };
  });
}
