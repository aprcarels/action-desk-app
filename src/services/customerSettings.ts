import type {
  CustomerCsrAssignment,
  RepProfile,
  SavedCustomer,
  SavedCustomerDraft,
} from "../types/actionDesk";
import { canAccessLocation, normalizeLocationId } from "./locations";

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
  return typeof value === "string" ? value : "";
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeCustomerName(value: unknown): string {
  return collapseWhitespace(safeText(value));
}

export function normalizeCustomerEmail(value: unknown): string {
  return collapseWhitespace(safeText(value)).toLowerCase();
}

export function normalizeCustomerDomain(value: unknown): string {
  let normalizedValue = collapseWhitespace(safeText(value)).toLowerCase();

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
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .map((value) => normalizeCustomerEmail(value))
        .filter((value) => value.length > 0),
    ),
  );
}

export function normalizeCustomerDomains(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
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
        normalizeCustomerDomains(customer.domains).includes(domain),
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
  emails?: string[] | null;
  domains?: string[] | null;
}): string {
  const normalizedName = normalizeCustomerName(customer.name);

  if (normalizedName.length > 0) {
    return normalizedName;
  }

  const normalizedEmails = normalizeCustomerEmails(customer.emails);

  if (normalizedEmails.length > 0) {
    return normalizedEmails[0];
  }

  const normalizedDomains = normalizeCustomerDomains(customer.domains);

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

  const assignment = value as Partial<CustomerCsrAssignment>;
  const repId = collapseWhitespace(safeText(assignment.repId));

  if (!repId) {
    return null;
  }

  const assignmentRole =
    assignment.assignmentRole === "secondary" ||
    assignment.assignmentRole === "backup"
      ? assignment.assignmentRole
      : "primary";
  const locationName = collapseWhitespace(safeText(assignment.locationName));

  return {
    repId,
    assignmentRole,
    locationName: locationName || undefined,
    isActive: assignment.isActive !== false,
  };
}

function normalizeOwnerRepIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((repId) => collapseWhitespace(safeText(repId)))
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

  const customer = value as Partial<SavedCustomer>;
  const id = collapseWhitespace(safeText(customer.id)) || createCustomerId();
  const name = normalizeCustomerName(customer.name);
  const emails = normalizeCustomerEmails(customer.emails);
  const domains = normalizeCustomerDomains(customer.domains);
  const ownerRepId = collapseWhitespace(safeText(customer.ownerRepId)) || undefined;
  const ownerRepIds = normalizeOwnerRepIds(customer.ownerRepIds);
  const assignedCSRs = normalizeCustomerAssignments(
    customer.assignedCSRs,
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
  const locationId = normalizeLocationId(customer.locationId);

  if (name.length === 0 && emails.length === 0 && domains.length === 0) {
    return null;
  }

  const normalizedCustomer: SavedCustomer = {
    id,
    name: name.length > 0 ? name : getSavedCustomerDisplayName({ emails, domains }),
    emails,
    domains,
  };

  if (primaryOwnerRepId) {
    normalizedCustomer.ownerRepId = primaryOwnerRepId;
  }

  if (allOwnerRepIds.length > 0) {
    normalizedCustomer.ownerRepIds = allOwnerRepIds;
  }

  if (assignedCSRs.length > 0) {
    normalizedCustomer.assignedCSRs = assignedCSRs;
  }

  if (locationId) {
    normalizedCustomer.locationId = locationId;
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
    emails: draft.emails,
    domains: draft.domains,
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
