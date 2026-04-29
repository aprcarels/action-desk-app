import {
  withTransaction,
  type DatabaseRow,
  type DatabaseTransaction,
  type QueryParameter,
} from "../../persistence/mariadb/database";
import {
  readId,
  readNullableId,
  readNullableString,
  readNumber,
  readString,
} from "./rowMappers";
import type {
  AiClassification,
  DatabaseId,
  EmployeeRole,
  TicketSenderType,
} from "./schemaTypes";

type RoutingDatabaseClient = Pick<DatabaseTransaction, "query" | "execute">;

type TicketRoutingRecord = {
  id: string;
  senderType: TicketSenderType;
  customerId: string | null;
  assignedCsrId: string | null;
  queueId: string | null;
  slaProfileId: string;
};

type CustomerAssignmentRecord = {
  employeeId: string;
  assignmentRole: "primary" | "secondary" | "backup";
};

type RoutingRuleRecord = {
  id: string;
  ruleName: string;
  targetQueueId: string | null;
  targetRole: EmployeeRole | null;
  slaProfileId: string | null;
};

export type TicketRoutingResult = {
  ticketId: string;
  assignedEmployeeId: string | null;
  assignedQueueId: string | null;
  slaProfileId: string;
  reason: string;
  routingRuleId?: string;
};

function mapTicketRoutingRecord(row: DatabaseRow): TicketRoutingRecord {
  return {
    id: readId(row, "id"),
    senderType: readString(row, "senderType") as TicketSenderType,
    customerId: readNullableId(row, "customerId"),
    assignedCsrId: readNullableId(row, "assignedCsrId"),
    queueId: readNullableId(row, "queueId"),
    slaProfileId: readId(row, "slaProfileId"),
  };
}

function mapCustomerAssignment(row: DatabaseRow): CustomerAssignmentRecord {
  return {
    employeeId: readId(row, "employeeId"),
    assignmentRole: readString(row, "assignmentRole") as CustomerAssignmentRecord["assignmentRole"],
  };
}

function mapRoutingRule(row: DatabaseRow): RoutingRuleRecord {
  return {
    id: readId(row, "id"),
    ruleName: readString(row, "ruleName"),
    targetQueueId: readNullableId(row, "targetQueueId"),
    targetRole: readNullableString(row, "targetRole") as EmployeeRole | null,
    slaProfileId: readNullableId(row, "slaProfileId"),
  };
}

async function loadTicketForRouting(
  ticketId: DatabaseId,
  databaseClient: RoutingDatabaseClient,
): Promise<TicketRoutingRecord | null> {
  const rows = await databaseClient.query(
    `
      SELECT
        id,
        sender_type AS senderType,
        customer_id AS customerId,
        assigned_csr_id AS assignedCsrId,
        queue_id AS queueId,
        sla_profile_id AS slaProfileId
      FROM tickets
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
    `,
    [ticketId],
  );

  return rows[0] ? mapTicketRoutingRecord(rows[0]) : null;
}

async function loadActiveCustomerAssignments(
  customerId: DatabaseId,
  databaseClient: RoutingDatabaseClient,
): Promise<CustomerAssignmentRecord[]> {
  const rows = await databaseClient.query(
    `
      SELECT
        cca.employee_id AS employeeId,
        cca.assignment_role AS assignmentRole
      FROM customer_csr_assignments cca
      JOIN employees ON employees.id = cca.employee_id
      WHERE cca.customer_id = ? AND cca.is_active = TRUE AND employees.is_active = TRUE
      ORDER BY
        CASE cca.assignment_role
          WHEN 'primary' THEN 0
          WHEN 'secondary' THEN 1
          ELSE 2
        END,
        cca.id ASC
    `,
    [customerId],
  );

  return rows.map(mapCustomerAssignment);
}

async function loadLegacyCustomerAssignment(
  customerId: DatabaseId,
  databaseClient: RoutingDatabaseClient,
): Promise<CustomerAssignmentRecord[]> {
  const rows = await databaseClient.query(
    `
      SELECT assigned_csr_id AS employeeId
      FROM customers
      JOIN employees ON employees.id = customers.assigned_csr_id
      WHERE customers.id = ? AND customers.assigned_csr_id IS NOT NULL AND employees.is_active = TRUE
      LIMIT 1
    `,
    [customerId],
  );

  return rows[0]
    ? [
        {
          employeeId: readId(rows[0], "employeeId"),
          assignmentRole: "primary",
        },
      ]
    : [];
}

async function loadWeightedLoads(
  employeeIds: string[],
  databaseClient: RoutingDatabaseClient,
): Promise<Map<string, number>> {
  if (employeeIds.length === 0) {
    return new Map();
  }

  const placeholders = employeeIds.map(() => "?").join(", ");
  const rows = await databaseClient.query(
    `
      SELECT
        employees.id AS employeeId,
        COALESCE(SUM(
          CASE tickets.priority
            WHEN 'critical' THEN 4
            WHEN 'high' THEN 3
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 1
            ELSE 1
          END
        ), 0) AS weightedLoad
      FROM employees
      LEFT JOIN tickets
        ON tickets.assigned_csr_id = employees.id
        AND tickets.status IN ('open', 'pending')
      WHERE employees.id IN (${placeholders}) AND employees.is_active = TRUE
      GROUP BY employees.id
    `,
    employeeIds,
  );

  return new Map(
    rows.map((row) => [readId(row, "employeeId"), readNumber(row, "weightedLoad")]),
  );
}

async function chooseLowestLoadEmployee(
  employeeIds: string[],
  databaseClient: RoutingDatabaseClient,
): Promise<string | null> {
  const uniqueEmployeeIds = Array.from(new Set(employeeIds));
  const weightedLoads = await loadWeightedLoads(uniqueEmployeeIds, databaseClient);

  return uniqueEmployeeIds.sort((left, right) => {
    const loadDifference =
      (weightedLoads.get(left) ?? 0) - (weightedLoads.get(right) ?? 0);

    if (loadDifference !== 0) {
      return loadDifference;
    }

    return left.localeCompare(right);
  })[0] ?? null;
}

async function chooseLowestLoadEmployeeByRole(
  role: EmployeeRole,
  databaseClient: RoutingDatabaseClient,
): Promise<string | null> {
  const rows = await databaseClient.query(
    `
      SELECT
        employees.id AS employeeId,
        COALESCE(SUM(
          CASE tickets.priority
            WHEN 'critical' THEN 4
            WHEN 'high' THEN 3
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 1
            ELSE 1
          END
        ), 0) AS weightedLoad
      FROM employees
      LEFT JOIN tickets
        ON tickets.assigned_csr_id = employees.id
        AND tickets.status IN ('open', 'pending')
      WHERE employees.role = ? AND employees.is_active = TRUE
      GROUP BY employees.id, employees.display_name, employees.is_online
      ORDER BY weightedLoad ASC, employees.is_online DESC, employees.display_name ASC
      LIMIT 1
    `,
    [role],
  );

  return rows[0] ? readId(rows[0], "employeeId") : null;
}

async function loadQueueByName(
  queueName: string,
  databaseClient: RoutingDatabaseClient,
): Promise<{ queueId: string; slaProfileId: string | null } | null> {
  const rows = await databaseClient.query(
    `
      SELECT id AS queueId, default_sla_profile_id AS slaProfileId
      FROM queues
      WHERE name = ? AND is_active = TRUE
      LIMIT 1
    `,
    [queueName],
  );

  return rows[0]
    ? {
        queueId: readId(rows[0], "queueId"),
        slaProfileId: readNullableId(rows[0], "slaProfileId"),
      }
    : null;
}

async function loadMatchingRoutingRule(
  ticket: TicketRoutingRecord,
  classification: AiClassification,
  databaseClient: RoutingDatabaseClient,
): Promise<RoutingRuleRecord | null> {
  const rows = await databaseClient.query(
    `
      SELECT
        id,
        rule_name AS ruleName,
        target_queue_id AS targetQueueId,
        target_role AS targetRole,
        sla_profile_id AS slaProfileId
      FROM routing_rules
      WHERE is_active = TRUE
        AND (sender_type IS NULL OR sender_type = ?)
        AND (category IS NULL OR category = ?)
        AND (urgency IS NULL OR urgency = ?)
        AND (importance IS NULL OR importance = ?)
        AND (suggested_action IS NULL OR suggested_action = ?)
      ORDER BY priority_order ASC, id ASC
      LIMIT 1
    `,
    [
      ticket.senderType,
      classification.category,
      classification.urgency,
      classification.importance,
      classification.suggestedAction,
    ],
  );

  return rows[0] ? mapRoutingRule(rows[0]) : null;
}

async function resolveCustomerOwnerAssignment(
  ticket: TicketRoutingRecord,
  databaseClient: RoutingDatabaseClient,
): Promise<string | null> {
  if (ticket.senderType !== "known_customer" || !ticket.customerId) {
    return null;
  }

  const assignments = await loadActiveCustomerAssignments(
    ticket.customerId,
    databaseClient,
  );
  const effectiveAssignments =
    assignments.length > 0
      ? assignments
      : await loadLegacyCustomerAssignment(ticket.customerId, databaseClient);

  if (effectiveAssignments.length === 0) {
    return null;
  }

  const primaryAssignments = effectiveAssignments.filter(
    (assignment) => assignment.assignmentRole === "primary",
  );

  if (primaryAssignments.length === 1) {
    return primaryAssignments[0].employeeId;
  }

  return chooseLowestLoadEmployee(
    effectiveAssignments.map((assignment) => assignment.employeeId),
    databaseClient,
  );
}

async function resolveHoldingQueueAssignment(
  ticket: TicketRoutingRecord,
  databaseClient: RoutingDatabaseClient,
): Promise<TicketRoutingResult | null> {
  if (ticket.senderType !== "unknown" && ticket.senderType !== "domain_match") {
    return null;
  }

  const queueName =
    ticket.senderType === "domain_match"
      ? "verification_queue"
      : "supervisor_queue";
  const queue = await loadQueueByName(queueName, databaseClient);

  if (!queue) {
    return null;
  }

  return {
    ticketId: ticket.id,
    assignedEmployeeId: null,
    assignedQueueId: queue.queueId,
    slaProfileId: queue.slaProfileId ?? ticket.slaProfileId,
    reason:
      ticket.senderType === "domain_match"
        ? "Domain-only customer match routed to verification queue."
        : "Unknown sender routed to supervisor queue.",
  };
}

async function resolveRuleAssignment(
  ticket: TicketRoutingRecord,
  classification: AiClassification,
  databaseClient: RoutingDatabaseClient,
): Promise<TicketRoutingResult | null> {
  const rule = await loadMatchingRoutingRule(ticket, classification, databaseClient);

  if (!rule) {
    return null;
  }

  const assignedEmployeeId = rule.targetRole
    ? await chooseLowestLoadEmployeeByRole(rule.targetRole, databaseClient)
    : null;

  return {
    ticketId: ticket.id,
    assignedEmployeeId,
    assignedQueueId: rule.targetQueueId ?? ticket.queueId,
    slaProfileId: rule.slaProfileId ?? ticket.slaProfileId,
    reason: `Routing rule ${rule.ruleName} matched.`,
    routingRuleId: rule.id,
  };
}

async function writeTicketAssignment(
  result: TicketRoutingResult,
  databaseClient: RoutingDatabaseClient,
): Promise<void> {
  const params: QueryParameter[] = [
    result.assignedEmployeeId,
    result.assignedQueueId,
    result.slaProfileId,
    result.ticketId,
  ];

  await databaseClient.execute(
    `
      UPDATE ticket_assignments
      SET ended_at = CURRENT_TIMESTAMP
      WHERE ticket_id = ? AND ended_at IS NULL
    `,
    [result.ticketId],
  );
  await databaseClient.execute(
    `
      UPDATE tickets
      SET
        assigned_csr_id = ?,
        queue_id = ?,
        sla_profile_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    params,
  );
  await databaseClient.execute(
    `
      INSERT INTO ticket_assignments (
        ticket_id,
        assigned_to_employee_id,
        assigned_to_queue_id,
        assignment_type,
        reason
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    [
      result.ticketId,
      result.assignedEmployeeId,
      result.assignedQueueId,
      "automatic",
      result.reason,
    ],
  );
  await databaseClient.execute(
    `
      INSERT INTO audit_log (
        entity_type,
        entity_id,
        event_type,
        new_values,
        details
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    [
      "ticket",
      result.ticketId,
      "TICKET_ROUTED",
      JSON.stringify({
        assigned_csr_id: result.assignedEmployeeId,
        queue_id: result.assignedQueueId,
        sla_profile_id: result.slaProfileId,
      }),
      JSON.stringify({
        reason: result.reason,
        routing_rule_id: result.routingRuleId,
      }),
    ],
  );
}

async function routeTicketInTransaction(
  ticketId: DatabaseId,
  classification: AiClassification,
  databaseClient: RoutingDatabaseClient,
): Promise<TicketRoutingResult | null> {
  const ticket = await loadTicketForRouting(ticketId, databaseClient);

  if (!ticket) {
    return null;
  }

  const assignedCustomerOwnerId = await resolveCustomerOwnerAssignment(
    ticket,
    databaseClient,
  );

  if (assignedCustomerOwnerId) {
    const result: TicketRoutingResult = {
      ticketId: ticket.id,
      assignedEmployeeId: assignedCustomerOwnerId,
      assignedQueueId: ticket.queueId,
      slaProfileId: ticket.slaProfileId,
      reason: "Known customer routed to assigned CSR.",
    };

    await writeTicketAssignment(result, databaseClient);
    return result;
  }

  const holdingQueueAssignment = await resolveHoldingQueueAssignment(
    ticket,
    databaseClient,
  );

  if (holdingQueueAssignment) {
    await writeTicketAssignment(holdingQueueAssignment, databaseClient);
    return holdingQueueAssignment;
  }

  const ruleAssignment = await resolveRuleAssignment(
    ticket,
    classification,
    databaseClient,
  );

  if (!ruleAssignment) {
    return null;
  }

  await writeTicketAssignment(ruleAssignment, databaseClient);
  return ruleAssignment;
}

export async function routeTicket(
  ticketId: DatabaseId,
  classification: AiClassification,
  transaction?: DatabaseTransaction,
): Promise<TicketRoutingResult | null> {
  if (transaction) {
    return routeTicketInTransaction(ticketId, classification, transaction);
  }

  return withTransaction((activeTransaction) =>
    routeTicketInTransaction(ticketId, classification, activeTransaction),
  );
}

export const routingRepository = {
  routeTicket,
};
