import { randomUUID } from "node:crypto";
import {
  execute,
  query,
  withTransaction,
  type DatabaseRow,
  type DatabaseTransaction,
  type QueryParameter,
} from "../../persistence/mariadb/database";
import {
  getCustomerPrimaryOwnerId,
  getSavedCustomerDisplayName,
  isBlockedCustomerDomain,
  normalizeCustomerAssignments,
  normalizeCustomerDomain,
  normalizeCustomerDomains,
  normalizeCustomerEmail,
  normalizeCustomerName,
  normalizeSavedCustomer,
} from "../../services/customerSettings";
import { normalizeLocationId } from "../../services/locations";
import type {
  CustomerAssignmentRole,
  CustomerCsrAssignment,
  ManagedUser,
  ManagedUserDraft,
  RepProfile,
  SavedCustomer,
  SavedCustomerDraft,
} from "../../types/actionDesk";
import {
  readBoolean,
  readId,
  readNullableId,
  readNullableString,
  readString,
} from "./rowMappers";

type DirectoryEmployeeRole =
  | "csr"
  | "team_lead"
  | "supervisor"
  | "admin"
  | "manager"
  | "employee";

type DirectoryUserIdentity = {
  accountUsername?: string | null;
  displayName?: string | null;
  entraObjectId?: string | null;
  email?: string | null;
  homeAccountId?: string | null;
  localAccountId?: string | null;
  microsoft_user_id?: string | null;
  microsoftUserId?: string | null;
};

export type SignInRepProfileResolution =
  | {
      status: "active";
      repProfile: RepProfile;
    }
  | {
      status: "inactive" | "missing";
    };

export type ManagedUserMutationResult = {
  users: ManagedUser[];
  mutation?: DirectoryMutationMetadata;
  invalidatedUserId?: string;
  invalidationReason?: "access_changed" | "deactivated";
};

export type DirectoryMutationMetadata = {
  action: string;
  affectedRows: number;
  returnedId?: string;
};

export type SavedCustomerMutationResult = {
  customers: SavedCustomer[];
  mutation?: DirectoryMutationMetadata;
};

export type DirectoryCounts = {
  databaseReady: boolean;
  customerCount: number;
  csrCount: number;
  assignmentCount: number;
};

const DIRECTORY_EMPLOYEE_ROLES: DirectoryEmployeeRole[] = [
  "admin",
  "supervisor",
  "team_lead",
  "manager",
  "csr",
];

const CUSTOMER_SELECT = `
  SELECT
    customers.id,
    customers.name,
    customers.email,
    customers.company,
    customers.domain,
    customers.assigned_csr_id AS assignedCsrId,
    customers.is_active AS isActive,
    customers.created_at AS createdAt,
    customers.updated_at AS updatedAt,
    assigned_employee.id AS legacyEmployeeId,
    assigned_employee.display_name AS legacyEmployeeDisplayName,
    assigned_employee.email AS legacyEmployeeEmail,
    assigned_employee.department AS legacyEmployeeDepartment
  FROM customers
  LEFT JOIN employees assigned_employee
    ON assigned_employee.id = customers.assigned_csr_id
    AND assigned_employee.is_active = TRUE
`;

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function getCommandAffectedRows(result: { affectedRows?: unknown } | null | undefined): number {
  const affectedRows = Number(result?.affectedRows);

  return Number.isFinite(affectedRows) ? affectedRows : 0;
}

function getCommandInsertId(result: { insertId?: unknown } | null | undefined): string | undefined {
  return result?.insertId === null || result?.insertId === undefined
    ? undefined
    : String(result.insertId);
}

function getIdentityEmail(identity: DirectoryUserIdentity): string {
  return normalizeEmail(identity.email) || normalizeEmail(identity.accountUsername);
}

function uniqueNormalizedText(values: unknown[]): string[] {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)));
}

function getMicrosoftUserIdCandidates(identity: DirectoryUserIdentity): string[] {
  return uniqueNormalizedText([
    identity.microsoftUserId,
    identity.microsoft_user_id,
    identity.entraObjectId,
    identity.localAccountId,
    identity.homeAccountId,
  ]);
}

function isActiveDirectoryRow(row: DatabaseRow): boolean {
  return readBoolean(row, "isActive");
}

function mapEmployeeRoleToRepRole(role: string): RepProfile["role"] {
  if (role === "admin") {
    return "admin";
  }

  if (role === "supervisor" || role === "team_lead" || role === "manager") {
    return "supervisor";
  }

  return "rep";
}

function mapRepRoleToEmployeeRole(role: RepProfile["role"]): DirectoryEmployeeRole {
  if (role === "admin") {
    return "admin";
  }

  if (role === "supervisor") {
    return "supervisor";
  }

  return "csr";
}

function deriveInitials(displayName: string, email: string): string {
  const words = displayName
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);
  const initials = words.length > 1
    ? `${words[0][0] ?? ""}${words[words.length - 1][0] ?? ""}`
    : words[0]?.slice(0, 2) ?? email.slice(0, 2);

  return initials.toUpperCase() || "AD";
}

function mapEmployeeRowToRepProfile(
  row: DatabaseRow,
  locationOverride?: string,
): RepProfile {
  const displayName = readString(row, "displayName");
  const email = readString(row, "email");
  const locationId =
    normalizeLocationId(locationOverride) ??
    normalizeLocationId(readNullableString(row, "department"));

  return {
    id: readId(row, "id"),
    name: displayName,
    initials: deriveInitials(displayName, email),
    email,
    role: mapEmployeeRoleToRepRole(readString(row, "role")),
    locationId,
    isActive: isActiveDirectoryRow(row),
  };
}

function mapEmployeeRowToManagedUser(row: DatabaseRow): ManagedUser {
  const displayName = readString(row, "displayName");
  const email = readString(row, "email");
  const entraObjectId = readNullableString(row, "microsoftUserId") ?? undefined;

  return {
    id: readId(row, "id"),
    entraObjectId,
    displayName,
    initials: deriveInitials(displayName, email),
    email,
    role: mapEmployeeRoleToRepRole(readString(row, "role")),
    locationId: normalizeLocationId(readNullableString(row, "department")),
    isActive: isActiveDirectoryRow(row),
    hasSignedIn: Boolean(entraObjectId),
    mappingStatus: entraObjectId ? "mapped" : "pending_first_sign_in",
    createdAt: readString(row, "createdAt"),
    updatedAt: readString(row, "updatedAt"),
  };
}

function employeeSelect(whereClause: string): string {
  return `
    SELECT
      id,
      microsoft_user_id AS microsoftUserId,
      display_name AS displayName,
      email,
      role,
      department,
      is_active AS isActive,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM employees
    ${whereClause}
  `;
}

async function loadActiveDirectoryEmployeeRows(): Promise<DatabaseRow[]> {
  const placeholders = DIRECTORY_EMPLOYEE_ROLES.map(() => "?").join(", ");

  return query(
    `${employeeSelect(`
      WHERE is_active = TRUE
        AND role IN (${placeholders})
    `)}
    ORDER BY
      CASE role
        WHEN 'admin' THEN 0
        WHEN 'supervisor' THEN 1
        WHEN 'team_lead' THEN 2
        WHEN 'manager' THEN 3
        WHEN 'csr' THEN 4
        ELSE 5
      END,
      display_name ASC,
      id ASC`,
    DIRECTORY_EMPLOYEE_ROLES,
  );
}

async function loadActiveAssignmentLocationIdsByEmployeeId(): Promise<Map<string, Set<string>>> {
  const rows = await query(`
    SELECT
      cca.employee_id AS employeeId,
      cca.location_name AS locationName
    FROM customer_csr_assignments cca
    JOIN employees ON employees.id = cca.employee_id
    WHERE cca.is_active = TRUE
      AND employees.is_active = TRUE
      AND cca.location_name IS NOT NULL
    ORDER BY cca.employee_id ASC, cca.id ASC
  `);
  const locationIdsByEmployeeId = new Map<string, Set<string>>();

  for (const row of rows) {
    const locationId = normalizeLocationId(readNullableString(row, "locationName"));

    if (!locationId) {
      continue;
    }

    const employeeId = readId(row, "employeeId");
    const locationIds = locationIdsByEmployeeId.get(employeeId) ?? new Set<string>();
    locationIds.add(locationId);
    locationIdsByEmployeeId.set(employeeId, locationIds);
  }

  return locationIdsByEmployeeId;
}

export async function listVisibleRepProfiles(
  currentUser: RepProfile | null,
): Promise<RepProfile[]> {
  const [rows, assignmentLocationIdsByEmployeeId] = await Promise.all([
    loadActiveDirectoryEmployeeRows(),
    loadActiveAssignmentLocationIdsByEmployeeId(),
  ]);
  const profiles = rows.map((row) => mapEmployeeRowToRepProfile(row));

  if (!currentUser || currentUser.role === "admin") {
    return profiles;
  }

  const currentLocationId = normalizeLocationId(currentUser.locationId);

  if (!currentLocationId) {
    return profiles.filter((profile) => profile.id === currentUser.id);
  }

  return profiles
    .map((profile) => {
      const assignmentLocationIds = assignmentLocationIdsByEmployeeId.get(profile.id);
      const assignmentLocationMatch = assignmentLocationIds?.has(currentLocationId) ?? false;

      if (!profile.locationId && assignmentLocationMatch) {
        return {
          ...profile,
          locationId: currentLocationId,
        };
      }

      return profile;
    })
    .filter(
      (profile) =>
        profile.id === currentUser.id ||
        normalizeLocationId(profile.locationId) === currentLocationId ||
        assignmentLocationIdsByEmployeeId.get(profile.id)?.has(currentLocationId),
    );
}

export async function resolveCurrentRepProfile(
  currentUser: Pick<RepProfile, "id" | "email" | "locationId">,
): Promise<RepProfile | null> {
  const id = normalizeText(currentUser.id);
  const email = normalizeEmail(currentUser.email);
  const conditions: string[] = [];
  const parameters: QueryParameter[] = [];

  if (id) {
    conditions.push("id = ?");
    parameters.push(id);
  }

  if (email) {
    conditions.push("LOWER(email) = ?");
    parameters.push(email);
  }

  if (conditions.length === 0) {
    return null;
  }

  const rows = await query(
    `${employeeSelect(`
      WHERE (${conditions.join(" OR ")})
        AND is_active = TRUE
      LIMIT 1
    `)}`,
    parameters,
  );
  const row = rows[0];

  if (!row) {
    return null;
  }

  const repProfile = mapEmployeeRowToRepProfile(row);

  return {
    ...repProfile,
    locationId: repProfile.locationId ?? normalizeLocationId(currentUser.locationId),
  };
}

export async function resolveSignInRepProfile(
  identity: DirectoryUserIdentity,
): Promise<RepProfile | null> {
  const result = await resolveSignInRepProfileStatus(identity);

  return result.status === "active" ? result.repProfile : null;
}

export async function resolveSignInRepProfileStatus(
  identity: DirectoryUserIdentity,
): Promise<SignInRepProfileResolution> {
  const microsoftUserIdCandidates = getMicrosoftUserIdCandidates(identity);
  const email = getIdentityEmail(identity);

  if (microsoftUserIdCandidates.length === 0 && !email) {
    return { status: "missing" };
  }

  let row: DatabaseRow | undefined;

  if (microsoftUserIdCandidates.length > 0) {
    const placeholders = microsoftUserIdCandidates.map(() => "?").join(", ");
    const rows = await query(
      `${employeeSelect(`
        WHERE microsoft_user_id IN (${placeholders})
      `)}`,
      microsoftUserIdCandidates,
    );

    row = microsoftUserIdCandidates
      .map((candidate) =>
        rows.find(
          (employeeRow) =>
            normalizeText(readNullableString(employeeRow, "microsoftUserId")) === candidate,
        ),
      )
      .find((candidateRow): candidateRow is DatabaseRow => Boolean(candidateRow));
  }

  if (!row && email) {
    const rows = await query(
      `${employeeSelect(`
        WHERE LOWER(email) = ?
        ORDER BY id ASC
        LIMIT 1
      `)}`,
      [email],
    );
    row = rows[0];
  }

  if (!row) {
    return { status: "missing" };
  }

  if (!isActiveDirectoryRow(row)) {
    return { status: "inactive" };
  }

  const microsoftUserId = microsoftUserIdCandidates[0];
  const existingMicrosoftUserId = normalizeText(readNullableString(row, "microsoftUserId"));

  if (microsoftUserId && !existingMicrosoftUserId) {
    await execute(
      `
        UPDATE employees
        SET microsoft_user_id = ?
        WHERE id = ?
          AND (microsoft_user_id IS NULL OR microsoft_user_id = '')
      `,
      [microsoftUserId, readId(row, "id")],
    );
  }

  return {
    status: "active",
    repProfile: mapEmployeeRowToRepProfile({
      ...row,
      microsoftUserId: existingMicrosoftUserId || microsoftUserId || null,
    }),
  };
}

function getAssignmentSortRank(role: string): number {
  if (role === "primary") {
    return 0;
  }

  if (role === "secondary") {
    return 1;
  }

  return 2;
}

function mapAssignmentRow(row: DatabaseRow): CustomerCsrAssignment {
  return {
    repId: readId(row, "employeeId"),
    repName: readNullableString(row, "employeeDisplayName") ?? undefined,
    repEmail: normalizeCustomerEmail(readNullableString(row, "employeeEmail")) || undefined,
    assignmentRole: readString(row, "assignmentRole") as CustomerAssignmentRole,
    locationName: readNullableString(row, "locationName") ?? undefined,
    isActive: isActiveDirectoryRow(row),
  };
}

function isGeneratedPlaceholderEmail(value: string): boolean {
  const normalized = normalizeCustomerEmail(value);

  return normalized.startsWith("customer-") && normalized.endsWith("@actiondesk.local");
}

function getCustomerLocationId(
  assignments: CustomerCsrAssignment[],
  assignmentRows: DatabaseRow[],
  customerRow: DatabaseRow,
): string | undefined {
  for (const assignment of assignments) {
    const locationId = normalizeLocationId(assignment.locationName);

    if (locationId) {
      return locationId;
    }
  }

  for (const row of assignmentRows) {
    const locationId = normalizeLocationId(readNullableString(row, "employeeDepartment"));

    if (locationId) {
      return locationId;
    }
  }

  return normalizeLocationId(readNullableString(customerRow, "legacyEmployeeDepartment"));
}

function mapCustomerRowToSavedCustomer(
  row: DatabaseRow,
  assignmentRows: DatabaseRow[],
): SavedCustomer | null {
  const assignments = assignmentRows
    .map(mapAssignmentRow)
    .filter((assignment) => assignment.isActive)
    .sort(
      (left, right) =>
        getAssignmentSortRank(left.assignmentRole) -
          getAssignmentSortRank(right.assignmentRole) ||
        left.repId.localeCompare(right.repId),
    );
  const legacyEmployeeId = readNullableId(row, "legacyEmployeeId");

  if (assignments.length === 0 && legacyEmployeeId) {
    assignments.push({
      repId: legacyEmployeeId,
      repName: readNullableString(row, "legacyEmployeeDisplayName") ?? undefined,
      repEmail:
        normalizeCustomerEmail(readNullableString(row, "legacyEmployeeEmail")) ||
        undefined,
      assignmentRole: "primary",
      locationName: normalizeLocationId(readNullableString(row, "legacyEmployeeDepartment")),
      isActive: true,
    });
  }

  const ownerRepId = getCustomerPrimaryOwnerId({
    ownerRepId: undefined,
    ownerRepIds: assignments.map((assignment) => assignment.repId),
    assignedCSRs: assignments,
  });
  const email = normalizeCustomerEmail(readString(row, "email"));
  const emails = email && !isGeneratedPlaceholderEmail(email) ? [email] : [];
  const domain = normalizeCustomerDomain(readNullableString(row, "domain"));
  const domains = domain ? [domain] : [];
  const normalizedCustomer = normalizeSavedCustomer({
    id: readId(row, "id"),
    name:
      normalizeCustomerName(readString(row, "name")) ||
      normalizeCustomerName(readNullableString(row, "company")) ||
      getSavedCustomerDisplayName({ emails, domains }),
    emails,
    domains,
    ownerRepId,
    ownerRepIds: assignments.map((assignment) => assignment.repId),
    assignedCSRs: assignments,
    locationId: getCustomerLocationId(assignments, assignmentRows, row),
  });

  return normalizedCustomer;
}

async function loadActiveAssignmentRowsByCustomerId(
  customerIds: string[],
): Promise<Map<string, DatabaseRow[]>> {
  if (customerIds.length === 0) {
    return new Map();
  }

  const placeholders = customerIds.map(() => "?").join(", ");
  const rows = await query(
    `
      SELECT
        cca.customer_id AS customerId,
        cca.employee_id AS employeeId,
        employees.display_name AS employeeDisplayName,
        employees.email AS employeeEmail,
        employees.department AS employeeDepartment,
        cca.assignment_role AS assignmentRole,
        cca.location_name AS locationName,
        cca.is_active AS isActive
      FROM customer_csr_assignments cca
      JOIN employees ON employees.id = cca.employee_id
      WHERE cca.customer_id IN (${placeholders})
        AND cca.is_active = TRUE
        AND employees.is_active = TRUE
      ORDER BY
        cca.customer_id ASC,
        CASE cca.assignment_role
          WHEN 'primary' THEN 0
          WHEN 'secondary' THEN 1
          ELSE 2
        END,
        employees.display_name ASC,
        cca.id ASC
    `,
    customerIds,
  );
  const rowsByCustomerId = new Map<string, DatabaseRow[]>();

  for (const row of rows) {
    const customerId = readId(row, "customerId");
    rowsByCustomerId.set(customerId, [
      ...(rowsByCustomerId.get(customerId) ?? []),
      row,
    ]);
  }

  return rowsByCustomerId;
}

export async function listSavedCustomers(): Promise<SavedCustomer[]> {
  const customerRows = await query(
    `${CUSTOMER_SELECT}
     WHERE customers.is_active = TRUE
     ORDER BY customers.name ASC, customers.id ASC`,
  );
  const assignmentRowsByCustomerId = await loadActiveAssignmentRowsByCustomerId(
    customerRows.map((row) => readId(row, "id")),
  );

  return customerRows
    .map((row) =>
      mapCustomerRowToSavedCustomer(
        row,
        assignmentRowsByCustomerId.get(readId(row, "id")) ?? [],
      ),
    )
    .filter((customer): customer is SavedCustomer => customer !== null);
}

export async function listSavedCustomersForUser(
  currentUser: RepProfile | null,
): Promise<SavedCustomer[]> {
  const customers = await listSavedCustomers();

  if (!currentUser || currentUser.role === "admin") {
    return customers;
  }

  const currentLocationId = normalizeLocationId(currentUser.locationId);

  if (!currentLocationId) {
    return [];
  }

  return customers.filter(
    (customer) => normalizeLocationId(customer.locationId) === currentLocationId,
  );
}

async function loadActiveCsrRowsByIds(
  employeeIds: string[],
  databaseClient: DatabaseTransaction,
): Promise<Map<string, DatabaseRow>> {
  const uniqueEmployeeIds = Array.from(new Set(employeeIds));

  if (uniqueEmployeeIds.length === 0) {
    return new Map();
  }

  const placeholders = uniqueEmployeeIds.map(() => "?").join(", ");
  const rows = await databaseClient.query(
    `${employeeSelect(`
      WHERE id IN (${placeholders})
        AND role = 'csr'
        AND is_active = TRUE
    `)}`,
    uniqueEmployeeIds,
  );

  return new Map(rows.map((row) => [readId(row, "id"), row]));
}

function createGeneratedCustomerEmail(customerKey?: string): string {
  return `customer-${customerKey || randomUUID()}@actiondesk.local`;
}

function getPrimaryEmailForSave(
  normalizedCustomer: SavedCustomer,
  existingEmail?: string,
): string {
  return (
    normalizeCustomerEmail(normalizedCustomer.emails[0]) ||
    normalizeCustomerEmail(existingEmail) ||
    createGeneratedCustomerEmail(normalizedCustomer.id)
  );
}

async function findReusableCustomerId(
  normalizedCustomer: SavedCustomer,
  databaseClient: DatabaseTransaction,
): Promise<string | null> {
  const normalizedEmail = normalizeCustomerEmail(normalizedCustomer.emails[0]);

  if (!normalizedEmail) {
    return null;
  }

  const rows = await databaseClient.query(
    `
      SELECT id
      FROM customers
      WHERE LOWER(email) = ?
      LIMIT 1
    `,
    [normalizedEmail],
  );

  return rows[0] ? readId(rows[0], "id") : null;
}

async function assertNoDomainConflict(
  normalizedCustomer: SavedCustomer,
  databaseClient: DatabaseTransaction,
) {
  const domains = normalizeCustomerDomains(normalizedCustomer.domains);

  if (domains.length === 0) {
    return;
  }

  const placeholders = domains.map(() => "?").join(", ");
  const rows = await databaseClient.query(
    `
      SELECT id, name, domain
      FROM customers
      WHERE is_active = TRUE
        AND LOWER(domain) IN (${placeholders})
        AND id <> ?
      LIMIT 1
    `,
    [...domains, normalizedCustomer.id],
  );
  const conflictingCustomer = rows[0];

  if (!conflictingCustomer) {
    return;
  }

  throw new Error(
    `${readString(conflictingCustomer, "domain")} is already assigned to ${readString(conflictingCustomer, "name")}. Each company domain can belong to only one customer.`,
  );
}

function getActiveCustomerAssignments(
  normalizedCustomer: SavedCustomer,
): CustomerCsrAssignment[] {
  return normalizeCustomerAssignments(
    normalizedCustomer.assignedCSRs,
    normalizedCustomer.ownerRepId,
    normalizedCustomer.ownerRepIds,
  ).filter((assignment) => assignment.isActive);
}

function resolveCustomerSaveLocationId(
  normalizedCustomer: SavedCustomer,
  currentUser: RepProfile,
  ownerRowsById: Map<string, DatabaseRow>,
): string | undefined {
  const explicitLocationId = normalizeLocationId(normalizedCustomer.locationId);

  if (explicitLocationId) {
    return explicitLocationId;
  }

  const primaryOwnerId = getCustomerPrimaryOwnerId(normalizedCustomer);
  const primaryOwnerLocationId = primaryOwnerId
    ? normalizeLocationId(readNullableString(ownerRowsById.get(primaryOwnerId) ?? {}, "department"))
    : undefined;

  return primaryOwnerLocationId ?? normalizeLocationId(currentUser.locationId);
}

function assertSupervisorCanSaveLocation(
  currentUser: RepProfile,
  locationId?: string,
) {
  if (currentUser.role === "admin") {
    return;
  }

  const currentLocationId = normalizeLocationId(currentUser.locationId);

  if (!currentLocationId || !locationId || currentLocationId !== locationId) {
    throw new Error("Customer location must match your Action Desk location.");
  }
}

function assertCustomerOwnerLocations(
  ownerRowsById: Map<string, DatabaseRow>,
  locationId?: string,
) {
  if (!locationId) {
    return;
  }

  for (const ownerRow of ownerRowsById.values()) {
    const ownerLocationId = normalizeLocationId(readNullableString(ownerRow, "department"));

    if (ownerLocationId && ownerLocationId !== locationId) {
      throw new Error("Customer CSRs must belong to the selected location.");
    }
  }
}

async function loadExistingCustomerRow(
  customerId: string,
  databaseClient: DatabaseTransaction,
): Promise<DatabaseRow | null> {
  const rows = await databaseClient.query(
    `
      SELECT id, email
      FROM customers
      WHERE id = ?
      LIMIT 1
    `,
    [customerId],
  );

  return rows[0] ?? null;
}

async function saveCustomerRecord(
  normalizedCustomer: SavedCustomer,
  primaryEmail: string,
  primaryDomain: string | null,
  primaryCsrId: string | null,
  databaseClient: DatabaseTransaction,
): Promise<{
  affectedRows: number;
  customerId: string;
  returnedId?: string;
}> {
  const existing = await loadExistingCustomerRow(normalizedCustomer.id, databaseClient);
  const parameters = [
    getSavedCustomerDisplayName(normalizedCustomer),
    primaryEmail,
    getSavedCustomerDisplayName(normalizedCustomer),
    primaryDomain,
    primaryCsrId,
  ];

  if (existing) {
    const result = await databaseClient.execute(
      `
        UPDATE customers
        SET name = ?,
            email = ?,
            company = ?,
            domain = ?,
            assigned_csr_id = ?,
            is_active = TRUE
        WHERE id = ?
      `,
      [...parameters, normalizedCustomer.id],
    );

    return {
      affectedRows: getCommandAffectedRows(result),
      customerId: normalizedCustomer.id,
      returnedId: normalizedCustomer.id,
    };
  }

  const result = await databaseClient.execute(
    `
      INSERT INTO customers (
        name,
        email,
        company,
        domain,
        assigned_csr_id,
        is_active
      )
      VALUES (?, ?, ?, ?, ?, TRUE)
    `,
    parameters,
  );
  const customerId = getCommandInsertId(result);

  if (!customerId) {
    throw new Error("Customer was saved but no MariaDB id was returned.");
  }

  return {
    affectedRows: getCommandAffectedRows(result),
    customerId,
    returnedId: customerId,
  };
}

async function replaceCustomerAssignments(
  customerId: string,
  assignments: CustomerCsrAssignment[],
  locationId: string | undefined,
  databaseClient: DatabaseTransaction,
): Promise<number> {
  const deactivateResult = await databaseClient.execute(
    `
      UPDATE customer_csr_assignments
      SET is_active = FALSE
      WHERE customer_id = ?
    `,
    [customerId],
  );
  let affectedRows = getCommandAffectedRows(deactivateResult);

  for (const assignment of assignments) {
    const result = await databaseClient.execute(
      `
        INSERT INTO customer_csr_assignments (
          customer_id,
          employee_id,
          assignment_role,
          location_name,
          is_active
        )
        VALUES (?, ?, ?, ?, TRUE)
        ON DUPLICATE KEY UPDATE
          assignment_role = VALUES(assignment_role),
          location_name = VALUES(location_name),
          is_active = TRUE
      `,
      [
        customerId,
        assignment.repId,
        assignment.assignmentRole,
        locationId ?? normalizeLocationId(assignment.locationName) ?? null,
      ],
    );
    affectedRows += getCommandAffectedRows(result);
  }

  return affectedRows;
}

export async function upsertSavedCustomer(
  draft: SavedCustomerDraft,
  currentUser: RepProfile,
): Promise<SavedCustomerMutationResult> {
  const normalizedDraft = normalizeSavedCustomer(draft);

  if (!normalizedDraft) {
    throw new Error("Customer name, email, or domain is required.");
  }

  const blockedDomain = normalizeCustomerDomains(normalizedDraft.domains).find((domain) =>
    isBlockedCustomerDomain(domain),
  );

  if (blockedDomain) {
    throw new Error(
      `${blockedDomain} is blocked because public email domains are too broad for customer ownership matching.`,
    );
  }

  const mutation = await withTransaction(async (databaseClient) => {
    const reusableCustomerId =
      normalizedDraft.id || (await findReusableCustomerId(normalizedDraft, databaseClient));
    const normalizedCustomer: SavedCustomer = {
      ...normalizedDraft,
      id: reusableCustomerId || normalizedDraft.id,
    };
    const assignments = getActiveCustomerAssignments(normalizedCustomer);
    const ownerRowsById = await loadActiveCsrRowsByIds(
      assignments.map((assignment) => assignment.repId),
      databaseClient,
    );

    if (ownerRowsById.size !== assignments.length) {
      throw new Error("Customer CSRs must be active MariaDB CSR users.");
    }

    const locationId = resolveCustomerSaveLocationId(
      normalizedCustomer,
      currentUser,
      ownerRowsById,
    );
    assertSupervisorCanSaveLocation(currentUser, locationId);
    assertCustomerOwnerLocations(ownerRowsById, locationId);
    await assertNoDomainConflict(normalizedCustomer, databaseClient);

    const existing = reusableCustomerId
      ? await loadExistingCustomerRow(reusableCustomerId, databaseClient)
      : null;
    const primaryEmail = getPrimaryEmailForSave(
      normalizedCustomer,
      existing ? readString(existing, "email") : undefined,
    );
    const primaryDomain = normalizeCustomerDomain(normalizedCustomer.domains[0]) || null;
    const primaryCsrId = getCustomerPrimaryOwnerId(normalizedCustomer) ?? null;
    const savedCustomer = await saveCustomerRecord(
      normalizedCustomer,
      primaryEmail,
      primaryDomain,
      primaryCsrId,
      databaseClient,
    );

    const assignmentAffectedRows = await replaceCustomerAssignments(
      savedCustomer.customerId,
      assignments,
      locationId,
      databaseClient,
    );

    return {
      action: existing ? "update_customer" : "create_customer",
      affectedRows: savedCustomer.affectedRows + assignmentAffectedRows,
      returnedId: savedCustomer.returnedId,
    };
  });

  return {
    customers: await listSavedCustomersForUser(currentUser),
    mutation,
  };
}

async function loadCustomerForAccess(
  customerId: string,
  currentUser: RepProfile,
): Promise<SavedCustomer | null> {
  const visibleCustomers = await listSavedCustomersForUser(currentUser);

  return visibleCustomers.find((customer) => customer.id === customerId) ?? null;
}

export async function deleteSavedCustomer(
  customerId: string,
  currentUser: RepProfile,
): Promise<SavedCustomerMutationResult> {
  const normalizedCustomerId = normalizeText(customerId);

  if (!normalizedCustomerId) {
    return {
      customers: await listSavedCustomersForUser(currentUser),
      mutation: {
        action: "deactivate_customer",
        affectedRows: 0,
      },
    };
  }

  const existing = await loadCustomerForAccess(normalizedCustomerId, currentUser);

  if (!existing) {
    return {
      customers: await listSavedCustomersForUser(currentUser),
      mutation: {
        action: "deactivate_customer",
        affectedRows: 0,
        returnedId: normalizedCustomerId,
      },
    };
  }

  const mutation = await withTransaction(async (databaseClient) => {
    const customerResult = await databaseClient.execute(
      `
        UPDATE customers
        SET is_active = FALSE
        WHERE id = ?
      `,
      [normalizedCustomerId],
    );
    const assignmentResult = await databaseClient.execute(
      `
        UPDATE customer_csr_assignments
        SET is_active = FALSE
        WHERE customer_id = ?
      `,
      [normalizedCustomerId],
    );

    return {
      action: "deactivate_customer",
      affectedRows:
        getCommandAffectedRows(customerResult) +
        getCommandAffectedRows(assignmentResult),
      returnedId: normalizedCustomerId,
    };
  });

  return {
    customers: await listSavedCustomersForUser(currentUser),
    mutation,
  };
}

export async function clearSavedCustomers(
  currentUser: RepProfile,
): Promise<SavedCustomerMutationResult> {
  const visibleCustomers = await listSavedCustomersForUser(currentUser);
  const customerIds = visibleCustomers.map((customer) => customer.id);

  if (customerIds.length === 0) {
    return {
      customers: [],
      mutation: {
        action: "clear_customers",
        affectedRows: 0,
      },
    };
  }

  const placeholders = customerIds.map(() => "?").join(", ");

  const mutation = await withTransaction(async (databaseClient) => {
    const customerResult = await databaseClient.execute(
      `
        UPDATE customers
        SET is_active = FALSE
        WHERE id IN (${placeholders})
      `,
      customerIds,
    );
    const assignmentResult = await databaseClient.execute(
      `
        UPDATE customer_csr_assignments
        SET is_active = FALSE
        WHERE customer_id IN (${placeholders})
      `,
      customerIds,
    );

    return {
      action: "clear_customers",
      affectedRows:
        getCommandAffectedRows(customerResult) +
        getCommandAffectedRows(assignmentResult),
    };
  });

  return {
    customers: await listSavedCustomersForUser(currentUser),
    mutation,
  };
}

export async function listManagedUsers(options?: {
  includeInactive?: boolean;
}): Promise<ManagedUser[]> {
  const includeInactive = options?.includeInactive === true;
  const rows = await query(
    `${employeeSelect(includeInactive ? "" : "WHERE is_active = TRUE")}
     ORDER BY display_name ASC, id ASC`,
  );

  return rows.map(mapEmployeeRowToManagedUser);
}

async function loadManagedUserRow(
  userId: string,
  databaseClient?: DatabaseTransaction,
): Promise<DatabaseRow | null> {
  const sql = `${employeeSelect("WHERE id = ? LIMIT 1")}`;
  const rows = databaseClient
    ? await databaseClient.query(sql, [userId])
    : await query(
        sql,
        [userId],
      );

  return rows[0] ?? null;
}

async function countActiveAdmins(
  excludingUserId: string | undefined,
  databaseClient: DatabaseTransaction,
): Promise<number> {
  const rows = await databaseClient.query(
    `
      SELECT id
      FROM employees
      WHERE role = 'admin'
        AND is_active = TRUE
    `,
  );

  return rows.filter((row) => readId(row, "id") !== excludingUserId).length;
}

async function assertAdminSafety(
  userId: string,
  nextRole: RepProfile["role"],
  nextIsActive: boolean,
  databaseClient: DatabaseTransaction,
) {
  const existing = await loadManagedUserRow(userId, databaseClient);

  if (!existing) {
    throw new Error("User not found.");
  }

  const currentIsAdmin = mapEmployeeRoleToRepRole(readString(existing, "role")) === "admin";
  const willRemainActiveAdmin = nextRole === "admin" && nextIsActive;

  if (currentIsAdmin && !willRemainActiveAdmin && (await countActiveAdmins(userId, databaseClient)) === 0) {
    throw new Error("Action Desk must keep at least one active admin.");
  }
}

export async function createManagedUser(
  payload: ManagedUserDraft,
): Promise<ManagedUserMutationResult> {
  const displayName = normalizeCustomerName(payload.displayName);
  const email = normalizeCustomerEmail(payload.email);
  const role = mapRepRoleToEmployeeRole(payload.role);
  const locationId = normalizeLocationId(payload.locationId) ?? null;
  const isActive = payload.isActive !== false;

  if (!displayName) {
    throw new Error("Display name is required.");
  }

  if (!email) {
    throw new Error("Email is required.");
  }

  const result = await execute(
    `
      INSERT INTO employees (
        display_name,
        email,
        role,
        department,
        is_active,
        is_online
      )
      VALUES (?, ?, ?, ?, ?, FALSE)
    `,
    [displayName, email, role, locationId, isActive],
  );

  return {
    users: await listManagedUsers({ includeInactive: true }),
    mutation: {
      action: "create_user",
      affectedRows: getCommandAffectedRows(result),
      returnedId: getCommandInsertId(result),
    },
  };
}

export async function updateManagedUser(payload: {
  userId: string;
  displayName?: string;
  initials?: string;
  role?: RepProfile["role"];
  locationId?: string;
  isActive?: boolean;
}): Promise<ManagedUserMutationResult> {
  const userId = normalizeText(payload.userId);

  if (!userId) {
    throw new Error("User id is required.");
  }

  return withTransaction(async (databaseClient) => {
    const existing = await loadManagedUserRow(userId, databaseClient);

    if (!existing) {
      throw new Error("User not found.");
    }

    const currentRole = mapEmployeeRoleToRepRole(readString(existing, "role"));
    const nextRole = payload.role ?? currentRole;
    const nextEmployeeRole = mapRepRoleToEmployeeRole(nextRole);
    const nextIsActive =
      payload.isActive === undefined
        ? readBoolean(existing, "isActive")
        : payload.isActive === true;
    const nextDisplayName =
      normalizeCustomerName(payload.displayName) || readString(existing, "displayName");
    const nextLocationId =
      payload.locationId === undefined
        ? normalizeLocationId(readNullableString(existing, "department")) ?? null
        : normalizeLocationId(payload.locationId) ?? null;

    await assertAdminSafety(userId, nextRole, nextIsActive, databaseClient);

    const result = await databaseClient.execute(
      `
        UPDATE employees
        SET display_name = ?,
            role = ?,
            department = ?,
            is_active = ?
        WHERE id = ?
      `,
      [nextDisplayName, nextEmployeeRole, nextLocationId, nextIsActive, userId],
    );

    const didRoleChange = currentRole !== nextRole;
    const didActiveStateChange = readBoolean(existing, "isActive") !== nextIsActive;

    return {
      users: await listManagedUsers({ includeInactive: true }),
      mutation: {
        action: nextIsActive ? "update_user" : "deactivate_user",
        affectedRows: getCommandAffectedRows(result),
        returnedId: userId,
      },
      invalidatedUserId:
        didRoleChange || didActiveStateChange ? userId : undefined,
      invalidationReason: !nextIsActive ? "deactivated" : "access_changed",
    };
  });
}

export async function deactivateManagedUser(
  userId: string,
): Promise<ManagedUserMutationResult> {
  return updateManagedUser({
    userId,
    isActive: false,
  });
}

export async function getDirectoryCounts(
  currentUser?: RepProfile | null,
): Promise<DirectoryCounts> {
  const [customers, reps] = await Promise.all([
    listSavedCustomersForUser(currentUser ?? null),
    listVisibleRepProfiles(currentUser ?? null),
  ]);

  return {
    databaseReady: true,
    customerCount: customers.length,
    csrCount: reps.filter((rep) => rep.role === "rep" && rep.isActive !== false).length,
    assignmentCount: customers.reduce(
      (count, customer) =>
        count +
        (customer.assignedCSRs?.filter((assignment) => assignment.isActive).length ?? 0),
      0,
    ),
  };
}

export const workflowDirectoryRepository = {
  clearSavedCustomers,
  createManagedUser,
  deactivateManagedUser,
  deleteSavedCustomer,
  getDirectoryCounts,
  listManagedUsers,
  listSavedCustomers,
  listSavedCustomersForUser,
  listVisibleRepProfiles,
  resolveCurrentRepProfile,
  resolveSignInRepProfile,
  resolveSignInRepProfileStatus,
  upsertSavedCustomer,
  updateManagedUser,
};
