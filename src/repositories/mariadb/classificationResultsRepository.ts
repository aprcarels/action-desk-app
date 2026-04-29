import {
  withTransaction,
  type DatabaseRow,
  type DatabaseTransaction,
  type QueryParameter,
} from "../../persistence/mariadb/database";
import {
  validateAiClassificationResponse,
  type AiClassificationValidationResult,
} from "../../services/aiClassification";
import { readId, readString } from "./rowMappers";
import { routeTicket } from "./routingRepository";
import type { AiClassification, DatabaseId } from "./schemaTypes";

export type SavedClassificationResult = {
  id: string;
  ticketId: string;
  classification: AiClassification;
  validation: AiClassificationValidationResult;
};

type ClassificationDatabaseClient = DatabaseTransaction;

function toMariaDbDateTime(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 19).replace("T", " ");
}

function buildInsertParameters(
  ticketId: DatabaseId,
  rawResponse: string | null,
  validation: AiClassificationValidationResult,
): QueryParameter[] {
  const classification = validation.classification;

  return [
    ticketId,
    classification.category,
    classification.urgency,
    classification.importance,
    classification.suggestedAction,
    classification.requiresResponse,
    toMariaDbDateTime(classification.estimatedDueDate),
    classification.summary,
    classification.confidence,
    rawResponse,
    validation.validationStatus,
  ];
}

async function flagTicketFallbackState(
  ticketId: DatabaseId,
  validation: AiClassificationValidationResult,
  databaseClient: ClassificationDatabaseClient,
): Promise<void> {
  await databaseClient.execute(
    `
      UPDATE tickets
      SET flags = JSON_SET(
        COALESCE(flags, JSON_OBJECT()),
        '$.aiClassificationFallback',
        ?,
        '$.aiClassificationValidationStatus',
        ?
      )
      WHERE id = ?
    `,
    [validation.usedFallback, validation.validationStatus, ticketId],
  );
}

async function writeAuditLog(
  ticketId: DatabaseId,
  validation: AiClassificationValidationResult,
  databaseClient: ClassificationDatabaseClient,
): Promise<void> {
  await databaseClient.execute(
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
      ticketId,
      "AI_CLASSIFICATION_RECORDED",
      JSON.stringify({
        validation_status: validation.validationStatus,
        used_fallback: validation.usedFallback,
        validation_errors: validation.validationErrors,
      }),
    ],
  );
}

async function loadSavedResult(
  id: DatabaseId,
  validation: AiClassificationValidationResult,
  databaseClient: ClassificationDatabaseClient,
): Promise<SavedClassificationResult> {
  const rows = await databaseClient.query(
    `
      SELECT id, ticket_id AS ticketId
      FROM classification_results
      WHERE id = ?
      LIMIT 1
    `,
    [id],
  );
  const row: DatabaseRow | undefined = rows[0];

  if (!row) {
    throw new Error("Classification result was saved but could not be loaded.");
  }

  return {
    id: readId(row, "id"),
    ticketId: readString(row, "ticketId"),
    classification: validation.classification,
    validation,
  };
}

async function saveForTicketInTransaction(
  ticketId: DatabaseId,
  rawResponse: string | null,
  databaseClient: ClassificationDatabaseClient,
): Promise<SavedClassificationResult> {
  const validation = validateAiClassificationResponse(rawResponse);
  const insertResult = await databaseClient.execute(
    `
      INSERT INTO classification_results (
        ticket_id,
        category,
        urgency,
        importance,
        suggested_action,
        requires_response,
        estimated_due_date,
        summary,
        confidence,
        raw_llm_response,
        validation_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    buildInsertParameters(ticketId, rawResponse, validation),
  );

  await flagTicketFallbackState(ticketId, validation, databaseClient);
  await writeAuditLog(ticketId, validation, databaseClient);
  await routeTicket(ticketId, validation.classification, databaseClient);

  return loadSavedResult(insertResult.insertId ?? 0, validation, databaseClient);
}

export async function saveClassificationResultForTicket(
  ticketId: DatabaseId,
  rawResponse: string | null,
  transaction?: DatabaseTransaction,
): Promise<SavedClassificationResult> {
  if (transaction) {
    return saveForTicketInTransaction(ticketId, rawResponse, transaction);
  }

  return withTransaction((activeTransaction) =>
    saveForTicketInTransaction(ticketId, rawResponse, activeTransaction),
  );
}

export const classificationResultsRepository = {
  saveClassificationResultForTicket,
};
