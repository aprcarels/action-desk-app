import type {
  AppCapability,
  ManagedUser,
  RepProfile,
  RepRole,
  SavedCustomer,
  SlaSettings,
  WorkflowPreferences,
  WorkflowState,
} from "../types/actionDesk";
import { normalizeSavedCustomer } from "./customerSettings";
import { getLocationLabel, normalizeLocationId } from "./locations";
import { normalizeSlaSettings } from "./sla";
import { getDefaultWorkflowState } from "./workflowState";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}

function getText(source: UnknownRecord, keys: string[]): string {
  for (const key of keys) {
    const value = safeText(source[key]);

    if (value) {
      return value;
    }
  }

  return "";
}

function normalizeRole(value: unknown): RepRole {
  if (value === "admin") {
    return "admin";
  }

  if (value === "supervisor" || value === "team_lead" || value === "manager") {
    return "supervisor";
  }

  if (value === "rep" || value === "csr" || value === "employee") {
    return "rep";
  }

  return "rep";
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  return fallback;
}

function deriveInitials(name: string, email: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
  }

  return (words[0]?.slice(0, 2) || email.slice(0, 2) || "AD").toUpperCase();
}

function normalizeLocationArray(value: unknown): string[] {
  const rawLocations = Array.isArray(value) ? value : value ? [value] : [];

  return Array.from(
    new Set(
      rawLocations
        .map((location) => normalizeLocationId(location))
        .filter((locationId): locationId is string => Boolean(locationId)),
    ),
  );
}

export function normalizeRepProfile(value: unknown): RepProfile | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = getText(value, [
    "id",
    "userId",
    "user_id",
    "repId",
    "rep_id",
    "employeeId",
    "employee_id",
  ]);
  const email = getText(value, [
    "email",
    "emailAddress",
    "email_address",
    "mail",
    "userPrincipalName",
    "user_principal_name",
    "employeeEmail",
    "employee_email",
    "userEmail",
    "user_email",
    "repEmail",
    "rep_email",
    "csrEmail",
    "csr_email",
  ]).toLowerCase();
  const displayName =
    getText(value, ["displayName", "display_name", "name", "fullName", "full_name"]) ||
    email ||
    id;
  const name =
    getText(value, ["name", "displayName", "display_name", "fullName", "full_name"]) ||
    displayName;
  const initials = getText(value, ["initials"]) || deriveInitials(displayName, email);

  if (!id || !displayName || !email) {
    return null;
  }

  const locationId =
    normalizeLocationId(value.locationId) ??
    normalizeLocationId(value.location_id) ??
    normalizeLocationId(value.locationName) ??
    normalizeLocationId(value.location_name) ??
    normalizeLocationId(value.department) ??
    normalizeLocationId(value.location);
  const locationName =
    getText(value, ["locationName", "location_name", "department", "location"]) ||
    (locationId ? getLocationLabel(locationId) : undefined);

  return {
    id,
    name,
    displayName,
    initials,
    email,
    role: normalizeRole(value.role),
    locationId,
    locationName,
    allowedLocations: normalizeLocationArray(
      value.allowedLocations ??
        value.allowed_locations ??
        value.locationIds ??
        value.location_ids ??
        value.locations,
    ),
    isActive: normalizeBoolean(value.isActive ?? value.is_active ?? value.active, true),
  };
}

export function normalizeRepProfiles(values: unknown, fallback: RepProfile[] = []): RepProfile[] {
  const normalized = (Array.isArray(values) ? values : [])
    .map((value) => normalizeRepProfile(value))
    .filter((value): value is RepProfile => value !== null);

  return normalized.length > 0 ? normalized : fallback;
}

export function normalizeManagedUser(value: unknown): ManagedUser | null {
  const rep = normalizeRepProfile(value);

  if (!rep || !isRecord(value)) {
    return null;
  }

  const now = new Date().toISOString();
  const entraObjectId =
    getText(value, [
      "entraObjectId",
      "entra_object_id",
      "microsoftUserId",
      "microsoft_user_id",
    ]) ||
    undefined;

  return {
    id: rep.id,
    entraObjectId,
    name: rep.name,
    displayName: rep.displayName ?? rep.name,
    initials: rep.initials,
    email: rep.email,
    role: rep.role,
    locationId: rep.locationId,
    locationName: rep.locationName,
    allowedLocations: rep.allowedLocations ?? [],
    isActive: rep.isActive !== false,
    hasSignedIn: normalizeBoolean(value.hasSignedIn, Boolean(entraObjectId)),
    mappingStatus:
      value.mappingStatus === "mapped" ||
      value.mapping_status === "mapped" ||
      entraObjectId
        ? "mapped"
        : "pending_first_sign_in",
    createdAt: getText(value, ["createdAt", "created_at"]) || now,
    updatedAt: getText(value, ["updatedAt", "updated_at"]) || now,
  };
}

export function normalizeManagedUsers(values: unknown): ManagedUser[] {
  return (Array.isArray(values) ? values : [])
    .map((value) => normalizeManagedUser(value))
    .filter((value): value is ManagedUser => value !== null);
}

export function normalizeSavedCustomers(values: unknown): SavedCustomer[] {
  return (Array.isArray(values) ? values : [])
    .map((value) => normalizeSavedCustomer(value))
    .filter((value): value is SavedCustomer => value !== null);
}

function getCapabilitiesForRole(role?: RepRole): AppCapability[] {
  if (!role) {
    return [];
  }

  if (role === "admin") {
    return [
      "view_my_queue",
      "view_unassigned",
      "view_all_emails",
      "view_supervisor_queue",
      "view_all_work",
      "manage_customer_ownership",
      "manage_sla_settings",
      "review_override_history",
      "view_diagnostics",
      "create_backup",
      "manage_users",
      "manage_test_queue_data",
    ];
  }

  if (role === "supervisor") {
    return [
      "view_my_queue",
      "view_unassigned",
      "view_all_emails",
      "view_supervisor_queue",
      "manage_customer_ownership",
      "manage_sla_settings",
      "review_override_history",
    ];
  }

  return ["view_my_queue", "view_unassigned", "review_override_history"];
}

function normalizeCapabilities(value: unknown, currentUser: RepProfile | null): AppCapability[] {
  const payloadCapabilities = Array.isArray(value)
    ? value.filter((capability): capability is AppCapability => typeof capability === "string")
    : [];

  return Array.from(
    new Set([...payloadCapabilities, ...getCapabilitiesForRole(currentUser?.role)]),
  );
}

function normalizeThreadPresence(value: unknown): WorkflowState["threadPresence"] {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, records]) => Array.isArray(records))
      .map(([threadId, records]) => [threadId, records]),
  ) as WorkflowState["threadPresence"];
}

function normalizePreferences(value: unknown): WorkflowPreferences {
  const defaults = getDefaultWorkflowState().preferences;

  if (!isRecord(value)) {
    return defaults;
  }

  return {
    queueScopeView:
      value.queueScopeView === "all_emails" ||
      value.queueScopeView === "unassigned" ||
      value.queueScopeView === "my_queue"
        ? value.queueScopeView
        : defaults.queueScopeView,
    queueDisplayMode:
      value.queueDisplayMode === "grouped_by_rep" ? "grouped_by_rep" : "list",
    statusFilter:
      value.statusFilter === "all" ||
      value.statusFilter === "open" ||
      value.statusFilter === "new" ||
      value.statusFilter === "in_progress" ||
      value.statusFilter === "waiting_on_customer" ||
      value.statusFilter === "resolved"
        ? value.statusFilter
        : defaults.statusFilter,
    showSnoozed: value.showSnoozed === true,
  };
}

export function normalizeWorkflowState(
  value: unknown,
  fallbackReps: RepProfile[],
  currentUser: RepProfile | null,
): WorkflowState {
  const defaults = getDefaultWorkflowState();
  const source = isRecord(value) ? value : {};
  const reps = normalizeRepProfiles(source.reps, fallbackReps);
  const currentRepId = safeText(source.currentRepId) || currentUser?.id || "";

  return {
    reps,
    currentRepId,
    threadStates: isRecord(source.threadStates)
      ? (source.threadStates as WorkflowState["threadStates"])
      : {},
    threadPresence: normalizeThreadPresence(source.threadPresence),
    preferences: normalizePreferences(source.preferences ?? defaults.preferences),
  };
}

export function normalizeSharedWorkflowBootstrap<T extends {
  currentUser: RepProfile | null;
  capabilities: AppCapability[];
  reps: RepProfile[];
  customers: SavedCustomer[];
  slaSettings: SlaSettings;
  workflowState: WorkflowState;
}>(payload: T): T {
  const reps = normalizeRepProfiles(payload.reps, []);
  const workflowReps = normalizeRepProfiles(payload.workflowState?.reps, reps);
  const currentUser = normalizeRepProfile(payload.currentUser);
  const normalizedReps = workflowReps.length > 0 ? workflowReps : reps;

  return {
    ...payload,
    currentUser,
    capabilities: normalizeCapabilities(payload.capabilities, currentUser),
    reps: normalizedReps,
    customers: normalizeSavedCustomers(payload.customers),
    slaSettings: normalizeSlaSettings(payload.slaSettings),
    workflowState: normalizeWorkflowState(
      payload.workflowState,
      normalizedReps,
      currentUser,
    ),
  };
}
