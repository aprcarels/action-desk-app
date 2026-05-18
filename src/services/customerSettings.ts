import type {
  CustomerCsrAssignment,
  RepProfile,
  SavedCustomer,
  SavedCustomerDraft,
} from "../types/actionDesk";
import { canAccessLocation, getLocationLabel, normalizeLocationId } from "./locations";

const CUSTOMER_SETTINGS_STORAGE_KEY = "action-desk.saved-customers";
export const BLOCKED_PUBLIC_CUSTOMER_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "aol.com",
  "icloud.com",
]);

function safeText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getStructuredText(value: unknown, keys: string[]): string {
  if (typeof value === "string") {
    return value;
  }

  if (!isRecord(value)) {
    return "";
  }

  for (const key of keys) {
    const candidate = safeText(value[key]);

    if (candidate) {
      return candidate;
    }
  }

  return "";
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeCustomerName(value: unknown): string {
  return collapseWhitespace(
    getStructuredText(value, [
      "name",
      "customerName",
      "customer_name",
      "company",
      "displayName",
      "display_name",
      "value",
    ]) || safeText(value),
  );
}

export function normalizeCustomerEmail(value: unknown): string {
  return collapseWhitespace(
    getStructuredText(value, ["email", "emailAddress", "email_address", "address", "value"]) ||
      safeText(value),
  ).toLowerCase();
}

export function normalizeCustomerDomain(value: unknown): string {
  let normalizedValue = collapseWhitespace(
    getStructuredText(value, ["domain", "domainName", "domain_name", "value"]) ||
      safeText(value),
  ).toLowerCase();

  if (!normalizedValue) {
    return "";
  }

  if (normalizedValue.includes("://")) {
    try {
      normalizedValue = new URL(normalizedValue).hostname.toLowerCase();
    } catch {
      // Leave the original text in place and continue with simpler cleanup.
    }
  }

  if (normalizedValue.includes("@")) {
    const parts = normalizedValue.split("@");
    normalizedValue = parts[parts.length - 1] ?? "";
  }

  normalizedValue = normalizedValue
    .replace(/^@+/, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/^\.+|\.+$/g, "");

  return normalizedValue;
}

export function normalizeCustomerEmails(values: unknown): string[] {
  const rawValues = Array.isArray(values) ? values : values ? [values] : [];

  return Array.from(
    new Set(
      rawValues
        .map((value) => normalizeCustomerEmail(value))
        .filter((value) => value.length > 0),
    ),
  );
}

export function normalizeCustomerDomains(values: unknown): string[] {
  const rawValues = Array.isArray(values) ? values : values ? [values] : [];

  return Array.from(
    new Set(
      rawValues
        .map((value) => normalizeCustomerDomain(value))
        .filter((value) => value.length > 0),
    ),
  );
}

export function getEmailDomain(email: unknown): string {
  return normalizeCustomerDomain(email);
}

export function isBlockedCustomerDomain(value: unknown): boolean {
  return BLOCKED_PUBLIC_CUSTOMER_DOMAINS.has(normalizeCustomerDomain(value));
}

export function findConflictingCustomerDomain(
  customers: SavedCustomer[],
  domains: string[],
  excludingCustomerId?: string,
): { domain: string; customerName: string } | null {
  const normalizedDomains = normalizeCustomerDomains(domains);

  for (const domain of normalizedDomains) {
    const conflictingCustomer = customers.find(
      (customer) =>
        customer.id !== excludingCustomerId &&
        normalizeCustomerDomains([
          customer.domain,
          ...normalizeCustomerDomains(customer.domains ?? []),
        ]).includes(domain),
    );

    if (conflictingCustomer) {
      return {
        domain,
        customerName: getSavedCustomerDisplayName(conflictingCustomer),
      };
    }
  }

  return null;
}

export function getSavedCustomerDisplayName(customer: {
  name?: string | null;
  email?: string | null;
  emails?: string[] | null;
  domain?: string | null;
  domains?: string[] | null;
}): string {
  const normalizedName = normalizeCustomerName(customer.name);

  if (normalizedName.length > 0) {
    return normalizedName;
  }

  const normalizedEmails = normalizeCustomerEmails([
    customer.email,
    ...normalizeCustomerEmails(customer.emails ?? []),
  ]);

  if (normalizedEmails.length > 0) {
    return normalizedEmails[0];
  }

  const normalizedDomains = normalizeCustomerDomains([
    customer.domain,
    ...normalizeCustomerDomains(customer.domains ?? []),
  ]);

  if (normalizedDomains.length > 0) {
    return normalizedDomains[0];
  }

  return "Unnamed customer";
}

function createCustomerId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `customer-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function normalizeAssignedCsr(
  value: unknown,
): CustomerCsrAssignment | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const assignment = value as Partial<CustomerCsrAssignment> & {
    assignment_role?: unknown;
    employeeId?: unknown;
    employee_id?: unknown;
    rep_id?: unknown;
    repName?: unknown;
    rep_name?: unknown;
    employeeName?: unknown;
    employee_name?: unknown;
    csrName?: unknown;
    csr_name?: unknown;
    name?: unknown;
    displayName?: unknown;
    display_name?: unknown;
    repEmail?: unknown;
    rep_email?: unknown;
    employeeEmail?: unknown;
    employee_email?: unknown;
    csrEmail?: unknown;
    csr_email?: unknown;
    email?: unknown;
    emailAddress?: unknown;
    email_address?: unknown;
    csrId?: unknown;
    csr_id?: unknown;
    assignedCsrId?: unknown;
    assigned_csr_id?: unknown;
    location_name?: unknown;
    location?: unknown;
    is_active?: unknown;
    active?: unknown;
  };
  const repId = collapseWhitespace(
    safeText(assignment.repId) ||
      safeText(assignment.employeeId) ||
      safeText(assignment.employee_id) ||
      safeText(assignment.rep_id) ||
      safeText(assignment.csrId) ||
      safeText(assignment.csr_id) ||
      safeText(assignment.assignedCsrId) ||
      safeText(assignment.assigned_csr_id),
  );

  if (!repId) {
    return null;
  }

  const assignmentRole =
    assignment.assignmentRole === "secondary" ||
    assignment.assignment_role === "secondary" ||
    assignment.assignmentRole === "backup" ||
    assignment.assignment_role === "backup"
      ? ((assignment.assignmentRole ?? assignment.assignment_role) as CustomerCsrAssignment["assignmentRole"])
      : "primary";
  const locationName = collapseWhitespace(
    safeText(assignment.locationName) ||
      safeText(assignment.location_name) ||
      safeText(assignment.location),
  );
  const repName =
    normalizeCustomerName(assignment.repName) ||
    normalizeCustomerName(assignment.rep_name) ||
    normalizeCustomerName(assignment.employeeName) ||
    normalizeCustomerName(assignment.employee_name) ||
    normalizeCustomerName(assignment.csrName) ||
    normalizeCustomerName(assignment.csr_name) ||
    normalizeCustomerName(assignment.displayName) ||
    normalizeCustomerName(assignment.display_name) ||
    normalizeCustomerName(assignment.name);
  const repEmail =
    normalizeCustomerEmail(assignment.repEmail) ||
    normalizeCustomerEmail(assignment.rep_email) ||
    normalizeCustomerEmail(assignment.employeeEmail) ||
    normalizeCustomerEmail(assignment.employee_email) ||
    normalizeCustomerEmail(assignment.csrEmail) ||
    normalizeCustomerEmail(assignment.csr_email) ||
    normalizeCustomerEmail(assignment.email) ||
    normalizeCustomerEmail(assignment.emailAddress) ||
    normalizeCustomerEmail(assignment.email_address);

  return {
    repId,
    repName: repName || undefined,
    repEmail: repEmail || undefined,
    assignmentRole,
    locationName: locationName || undefined,
    isActive: assignment.isActive !== false && assignment.is_active !== false && assignment.active !== false,
  };
}

function normalizeOwnerRepIds(value: unknown): string[] {
  const rawValues = Array.isArray(value) ? value : value ? [value] : [];

  return Array.from(
    new Set(
      rawValues
        .map((repId) =>
          collapseWhitespace(
            getStructuredText(repId, [
              "id",
              "repId",
              "rep_id",
              "employeeId",
              "employee_id",
              "locationId",
              "location_id",
              "name",
              "value",
            ]) || safeText(repId),
          ),
        )
        .filter((repId) => repId.length > 0),
    ),
  );
}

export function normalizeCustomerAssignments(
  value: unknown,
  ownerRepId?: string,
  ownerRepIds?: string[],
): CustomerCsrAssignment[] {
  const normalizedAssignments = Array.isArray(value)
    ? value
        .map((assignment) => normalizeAssignedCsr(assignment))
        .filter((assignment): assignment is CustomerCsrAssignment => assignment !== null)
    : [];
  const activeAssignmentIds = new Set(
    normalizedAssignments
      .filter((assignment) => assignment.isActive)
      .map((assignment) => assignment.repId),
  );
  const fallbackOwnerIds = Array.from(
    new Set(
      [ownerRepId, ...(ownerRepIds ?? [])]
        .map((repId) => collapseWhitespace(safeText(repId)))
        .filter((repId) => repId.length > 0),
    ),
  );

  for (const repId of fallbackOwnerIds) {
    if (!activeAssignmentIds.has(repId)) {
      normalizedAssignments.push({
        repId,
        assignmentRole:
          repId === ownerRepId || normalizedAssignments.length === 0
            ? "primary"
            : "secondary",
        isActive: true,
      });
      activeAssignmentIds.add(repId);
    }
  }

  const seen = new Set<string>();
  return normalizedAssignments.filter((assignment) => {
    if (seen.has(assignment.repId)) {
      return false;
    }

    seen.add(assignment.repId);
    return true;
  });
}

export function getCustomerPrimaryOwnerId(
  customer: Pick<SavedCustomer, "ownerRepId" | "ownerRepIds" | "assignedCSRs">,
): string | undefined {
  const primaryAssignment = customer.assignedCSRs?.find(
    (assignment) =>
      assignment.isActive && assignment.assignmentRole === "primary",
  );

  return (
    primaryAssignment?.repId ??
    customer.ownerRepId ??
    customer.ownerRepIds?.find((repId) => repId.trim().length > 0)
  );
}

export function getCustomerOwnerRepIds(
  customer: Pick<SavedCustomer, "ownerRepId" | "ownerRepIds" | "assignedCSRs">,
): string[] {
  return Array.from(
    new Set(
      [
        getCustomerPrimaryOwnerId(customer),
        ...(customer.ownerRepIds ?? []),
        ...(customer.assignedCSRs
          ?.filter((assignment) => assignment.isActive)
          .map((assignment) => assignment.repId) ?? []),
      ].filter((repId): repId is string => Boolean(repId)),
    ),
  );
}

export function normalizeSavedCustomer(value: unknown): SavedCustomer | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const customer = value as Partial<SavedCustomer> & {
    customerId?: unknown;
    customer_id?: unknown;
    customerName?: unknown;
    customer_name?: unknown;
    company?: unknown;
    displayName?: unknown;
    display_name?: unknown;
    email?: unknown;
    domain?: unknown;
    assignedCsrId?: unknown;
    assignedCSRId?: unknown;
    assigned_csr_id?: unknown;
    assignedCsrs?: unknown;
    assigned_csrs?: unknown;
    assignments?: unknown;
    customerAssignments?: unknown;
    csrId?: unknown;
    csr_id?: unknown;
    repId?: unknown;
    rep_id?: unknown;
    owner_rep_id?: unknown;
    owner_rep_ids?: unknown;
    location?: unknown;
    locationId?: unknown;
    location_id?: unknown;
    locationName?: unknown;
    location_name?: unknown;
    locations?: unknown;
    locationIds?: unknown;
    location_ids?: unknown;
    isActive?: unknown;
    is_active?: unknown;
    active?: unknown;
  };
  const id =
    collapseWhitespace(safeText(customer.id)) ||
    collapseWhitespace(safeText(customer.customerId)) ||
    collapseWhitespace(safeText(customer.customer_id)) ||
    createCustomerId();
  const name =
    normalizeCustomerName(customer.name) ||
    normalizeCustomerName(customer.customerName) ||
    normalizeCustomerName(customer.customer_name) ||
    normalizeCustomerName(customer.company) ||
    normalizeCustomerName(customer.displayName) ||
    normalizeCustomerName(customer.display_name);
  const email = normalizeCustomerEmail(customer.email);
  const emails = normalizeCustomerEmails([
    email,
    ...normalizeCustomerEmails(customer.emails ?? []),
  ]);
  const domain = normalizeCustomerDomain(customer.domain);
  const domains = normalizeCustomerDomains([
    domain,
    ...normalizeCustomerDomains(customer.domains ?? []),
  ]);
  const assignedCsrId =
    collapseWhitespace(safeText(customer.assignedCsrId)) ||
    collapseWhitespace(safeText(customer.assignedCSRId)) ||
    collapseWhitespace(safeText(customer.assigned_csr_id)) ||
    collapseWhitespace(safeText(customer.csrId)) ||
    collapseWhitespace(safeText(customer.csr_id)) ||
    collapseWhitespace(safeText(customer.repId)) ||
    collapseWhitespace(safeText(customer.rep_id)) ||
    undefined;
  const ownerRepId =
    collapseWhitespace(safeText(customer.ownerRepId)) ||
    collapseWhitespace(safeText(customer.owner_rep_id)) ||
    assignedCsrId ||
    undefined;
  const ownerRepIds = normalizeOwnerRepIds([
    ...normalizeOwnerRepIds(customer.ownerRepIds),
    ...normalizeOwnerRepIds(customer.owner_rep_ids),
    assignedCsrId,
  ]);
  const assignedCSRs = normalizeCustomerAssignments(
    customer.assignedCSRs ??
      customer.assignedCsrs ??
      customer.assigned_csrs ??
      customer.customerAssignments ??
      customer.assignments,
    ownerRepId,
    ownerRepIds,
  );
  const allOwnerRepIds = Array.from(
    new Set([
      ...(ownerRepId ? [ownerRepId] : []),
      ...ownerRepIds,
      ...assignedCSRs
        .filter((assignment) => assignment.isActive)
        .map((assignment) => assignment.repId),
    ]),
  );
  const primaryOwnerRepId =
    getCustomerPrimaryOwnerId({
      ownerRepId,
      ownerRepIds: allOwnerRepIds,
      assignedCSRs,
    }) ?? ownerRepId;
  const locationIds = Array.from(
    new Set(
      [
        normalizeLocationId(customer.locationId),
        normalizeLocationId(customer.location_id),
        normalizeLocationId(customer.locationName),
        normalizeLocationId(customer.location_name),
        normalizeLocationId(customer.location),
        ...normalizeOwnerRepIds(customer.locationIds).map((location) =>
          normalizeLocationId(location),
        ),
        ...normalizeOwnerRepIds(customer.location_ids).map((location) =>
          normalizeLocationId(location),
        ),
        ...normalizeOwnerRepIds(customer.locations).map((location) =>
          normalizeLocationId(location),
        ),
      ].filter((locationId): locationId is string => Boolean(locationId)),
    ),
  );
  const locationId =
    locationIds[0] ??
    normalizeLocationId(customer.locationId) ??
    normalizeLocationId(customer.location_id) ??
    normalizeLocationId(customer.locationName) ??
    normalizeLocationId(customer.location_name) ??
    normalizeLocationId(customer.location);
  const locationName =
    normalizeCustomerName(customer.locationName) ||
    normalizeCustomerName(customer.location_name) ||
    (locationId ? getLocationLabel(locationId) : undefined);

  if (name.length === 0 && emails.length === 0 && domains.length === 0) {
    return null;
  }

  const normalizedCustomer: SavedCustomer = {
    id,
    name: name.length > 0 ? name : getSavedCustomerDisplayName({ emails, domains }),
    emails,
    domains,
    assignedCsrId: primaryOwnerRepId ?? "",
    assignedCSRs,
    isActive:
      customer.isActive === false || customer.is_active === false || customer.active === false
        ? false
        : true,
  };

  if (emails[0]) {
    normalizedCustomer.email = emails[0];
  }

  if (domains[0]) {
    normalizedCustomer.domain = domains[0];
  }

  if (primaryOwnerRepId) {
    normalizedCustomer.ownerRepId = primaryOwnerRepId;
  }

  if (allOwnerRepIds.length > 0) {
    normalizedCustomer.ownerRepIds = allOwnerRepIds;
  }

  if (locationId) {
    normalizedCustomer.locationId = locationId;
  }

  if (locationName) {
    normalizedCustomer.locationName = locationName;
  }

  if (locationIds.length > 0) {
    normalizedCustomer.locations = locationIds;
  }

  return normalizedCustomer;
}

export function loadSavedCustomers(): SavedCustomer[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(CUSTOMER_SETTINGS_STORAGE_KEY);

    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .map((value) => normalizeSavedCustomer(value))
      .filter((value): value is SavedCustomer => value !== null);
  } catch {
    return [];
  }
}

export function saveSavedCustomers(customers: SavedCustomer[]) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  const normalizedCustomers = customers
    .map((customer) => normalizeSavedCustomer(customer))
    .filter((customer): customer is SavedCustomer => customer !== null);

  window.localStorage.setItem(
    CUSTOMER_SETTINGS_STORAGE_KEY,
    JSON.stringify(normalizedCustomers),
  );
}

export function getCustomersForRep(
  customers: SavedCustomer[],
  repId: string,
): SavedCustomer[] {
  return customers.filter((customer) =>
    getCustomerOwnerRepIds(customer).includes(repId),
  );
}

export function getVisibleCustomersForSettings(
  customers: SavedCustomer[],
  currentRep: RepProfile,
  canManageCustomerOwnership: boolean,
): SavedCustomer[] {
  if (currentRep.role === "admin") {
    return customers;
  }

  if (canManageCustomerOwnership) {
    return customers.filter((customer) =>
      canAccessLocation(currentRep, customer.locationId),
    );
  }

  return getCustomersForRep(customers, currentRep.id).filter((customer) =>
    canAccessLocation(currentRep, customer.locationId),
  );
}

export function upsertSavedCustomer(
  customers: SavedCustomer[],
  draft: SavedCustomerDraft,
  ownerRepId?: string,
): SavedCustomer[] {
  const normalizedCustomer = normalizeSavedCustomer({
    id: draft.id,
    name: draft.name,
    emails: draft.emails ?? [],
    domains: draft.domains ?? [],
    ownerRepId: ownerRepId ?? draft.ownerRepId,
    ownerRepIds: draft.ownerRepIds,
    assignedCSRs: draft.assignedCSRs,
    locationId: draft.locationId,
  });

  if (!normalizedCustomer) {
    return customers;
  }

  const existingIndex = customers.findIndex(
    (customer) => customer.id === normalizedCustomer.id,
  );

  if (existingIndex === -1) {
    return [...customers, normalizedCustomer];
  }

  return customers.map((customer, index) =>
    index === existingIndex ? normalizedCustomer : customer,
  );
}

export function deleteSavedCustomer(
  customers: SavedCustomer[],
  customerId: string,
): SavedCustomer[] {
  return customers.filter((customer) => customer.id !== customerId);
}

export function clearSavedCustomers(): SavedCustomer[] {
  return [];
}

export function clearSavedCustomersForRep(
  customers: SavedCustomer[],
  repId: string,
): SavedCustomer[] {
  return customers.filter(
    (customer) => !getCustomerOwnerRepIds(customer).includes(repId),
  );
}

export function migrateCustomersToRep(
  customers: SavedCustomer[],
  reps: RepProfile[],
  currentRepId: string,
): SavedCustomer[] {
  const fallbackRepId =
    reps.find((rep) => rep.id === currentRepId)?.id ?? reps[0]?.id ?? currentRepId;

  return customers.map((customer) =>
    getCustomerOwnerRepIds(customer).length > 0
      ? customer
      : {
          ...customer,
          ownerRepId: fallbackRepId,
          ownerRepIds: [fallbackRepId],
          assignedCSRs: [
            {
              repId: fallbackRepId,
              assignmentRole: "primary",
              isActive: true,
            },
          ],
        },
  );
}
