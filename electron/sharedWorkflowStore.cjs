const Database = require("better-sqlite3");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { createDatabaseBackup } = require("./backupUtils.cjs");
const {
  buildSessionSummary,
  getCapabilitiesForRole,
  normalizeRole,
  resolveMappedUser,
} = require("./sharedAuthPolicy.cjs");

const THREAD_PRESENCE_TIMEOUT_MS = 3 * 60 * 1000;
const INVALIDATED_SESSION_TTL_MS = 10 * 60 * 1000;
const BLOCKED_PUBLIC_CUSTOMER_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "aol.com",
  "icloud.com",
]);
const DEFAULT_SLA_SETTINGS = {
  firstResponseSlaMinutes: 60,
  resolutionSlaMinutes: 24 * 60,
  warningThresholdPercent: 75,
  warningMinutesBeforeBreach: 15,
};
const ACTION_DESK_LOCATION_IDS = new Set([
  "apexpress-1",
  "apexpress-2",
  "worldpackusa",
]);
const ACTION_DESK_LOCATION_ALIASES = new Map([
  ["apexpress 1", "apexpress-1"],
  ["apexpress irwindale", "apexpress-1"],
  ["ap express irwindale", "apexpress-1"],
  ["irwindale", "apexpress-1"],
  ["apexpress 2", "apexpress-2"],
  ["apexpress corona", "apexpress-2"],
  ["ap express corona", "apexpress-2"],
  ["corona", "apexpress-2"],
  ["worldpackusa", "worldpackusa"],
  ["worldpackusa las vegas", "worldpackusa"],
  ["worldpack usa las vegas", "worldpackusa"],
  ["world pack usa las vegas", "worldpackusa"],
]);
const DEMO_USER_IDS = new Set(["rep-mj", "rep-ar", "rep-lc", "admin-sl"]);
const DEMO_USER_EMAILS = new Set([
  "mia.johnson@actiondesk.local",
  "alex.rivera@actiondesk.local",
  "logan.chen@actiondesk.local",
  "sam.lee@actiondesk.local",
]);
const TEST_QUEUE_DATA_PREFIX = "TEST DATA - ";

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function ensureDirectory(filename) {
  const directory = path.dirname(filename);

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeDomain(value) {
  let normalized = normalizeText(value).toLowerCase();

  if (!normalized) {
    return "";
  }

  if (normalized.includes("://")) {
    try {
      normalized = new URL(normalized).hostname.toLowerCase();
    } catch {
      // Keep the original text and continue with simple normalization.
    }
  }

  if (normalized.includes("@")) {
    const parts = normalized.split("@");
    normalized = parts[parts.length - 1] || "";
  }

  return normalized
    .replace(/^@+/, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/^\.+|\.+$/g, "");
}

function normalizeLocationId(value) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return undefined;
  }

  if (ACTION_DESK_LOCATION_IDS.has(normalized)) {
    return normalized;
  }

  return ACTION_DESK_LOCATION_ALIASES.get(
    normalized.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
  );
}

function isDemoDataEnabled(options = {}) {
  return (
    options.enableDemoData === true ||
    process.env.ACTION_DESK_ENABLE_DEMO_DATA === "true"
  );
}

function buildInitials(name, email) {
  const words = normalizeText(name)
    .split(/\s+/)
    .filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  if (words.length === 1 && words[0].length >= 2) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return normalizeEmail(email).slice(0, 2).toUpperCase() || "RP";
}

function normalizeInitials(value, fallbackName, fallbackEmail) {
  const normalized = normalizeText(value)
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 4)
    .toUpperCase();

  if (normalized) {
    return normalized;
  }

  return buildInitials(fallbackName, fallbackEmail);
}

function normalizeCustomerEmails(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(values.map((value) => normalizeEmail(value)).filter(Boolean)),
  );
}

function normalizeCustomerDomains(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(values.map((value) => normalizeDomain(value)).filter(Boolean)),
  );
}

function normalizeOwnerRepIds(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean)));
}

function normalizeCustomerAssignment(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const repId = normalizeText(value.repId);

  if (!repId) {
    return null;
  }

  const assignmentRole =
    value.assignmentRole === "secondary" || value.assignmentRole === "backup"
      ? value.assignmentRole
      : "primary";
  const locationName = normalizeText(value.locationName);

  return {
    repId,
    assignmentRole,
    locationName: locationName || undefined,
    isActive: value.isActive !== false,
  };
}

function normalizeCustomerAssignments(value, ownerRepId, ownerRepIds) {
  const assignments = Array.isArray(value)
    ? value.map((assignment) => normalizeCustomerAssignment(assignment)).filter(Boolean)
    : [];
  const activeIds = new Set(
    assignments
      .filter((assignment) => assignment.isActive)
      .map((assignment) => assignment.repId),
  );

  for (const repId of Array.from(new Set([ownerRepId, ...ownerRepIds].filter(Boolean)))) {
    if (!activeIds.has(repId)) {
      assignments.push({
        repId,
        assignmentRole: repId === ownerRepId || assignments.length === 0 ? "primary" : "secondary",
        isActive: true,
      });
      activeIds.add(repId);
    }
  }

  const seen = new Set();
  return assignments.filter((assignment) => {
    if (seen.has(assignment.repId)) {
      return false;
    }

    seen.add(assignment.repId);
    return true;
  });
}

function getPrimaryOwnerRepId(assignments, fallbackOwnerRepId, ownerRepIds) {
  const primaryAssignment = assignments.find(
    (assignment) => assignment.isActive && assignment.assignmentRole === "primary",
  );

  return primaryAssignment?.repId || fallbackOwnerRepId || ownerRepIds[0] || undefined;
}

function normalizeCustomerDraft(draft) {
  const ownerRepId = normalizeText(draft?.ownerRepId) || undefined;
  const ownerRepIds = normalizeOwnerRepIds(draft?.ownerRepIds);
  const assignedCSRs = normalizeCustomerAssignments(
    draft?.assignedCSRs,
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
  const primaryOwnerRepId = getPrimaryOwnerRepId(
    assignedCSRs,
    ownerRepId,
    allOwnerRepIds,
  );

  return {
    id: normalizeText(draft?.id) || createId("customer"),
    name: normalizeText(draft?.name),
    emails: normalizeCustomerEmails(draft?.emails),
    domains: normalizeCustomerDomains(draft?.domains),
    ownerRepId: primaryOwnerRepId,
    ownerRepIds: allOwnerRepIds,
    assignedCSRs,
    locationId: normalizeLocationId(draft?.locationId),
  };
}

function parseJsonArray(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizePreferences(preferences) {
  return {
    queueScopeView:
      preferences?.queueScopeView === "all_emails" ||
      preferences?.queueScopeView === "unassigned"
        ? preferences.queueScopeView
        : "my_queue",
    queueDisplayMode:
      preferences?.queueDisplayMode === "grouped_by_rep"
        ? "grouped_by_rep"
        : "list",
    statusFilter:
      preferences?.statusFilter === "all" ||
      preferences?.statusFilter === "new" ||
      preferences?.statusFilter === "in_progress" ||
      preferences?.statusFilter === "waiting_on_customer" ||
      preferences?.statusFilter === "resolved"
        ? preferences.statusFilter
        : "open",
    showSnoozed: preferences?.showSnoozed === true,
  };
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function normalizeClampedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, parsed));
}

function normalizeSlaSettings(settings) {
  const firstResponseSlaMinutes = normalizePositiveInteger(
    settings?.firstResponseSlaMinutes,
    DEFAULT_SLA_SETTINGS.firstResponseSlaMinutes,
  );
  const resolutionSlaMinutes = normalizePositiveInteger(
    settings?.resolutionSlaMinutes,
    DEFAULT_SLA_SETTINGS.resolutionSlaMinutes,
  );

  return {
    firstResponseSlaMinutes,
    resolutionSlaMinutes,
    warningThresholdPercent: normalizeClampedInteger(
      settings?.warningThresholdPercent,
      DEFAULT_SLA_SETTINGS.warningThresholdPercent,
      1,
      99,
    ),
    warningMinutesBeforeBreach: normalizeClampedInteger(
      settings?.warningMinutesBeforeBreach,
      DEFAULT_SLA_SETTINGS.warningMinutesBeforeBreach,
      1,
      Math.max(firstResponseSlaMinutes, resolutionSlaMinutes),
    ),
    locationId: normalizeLocationId(settings?.locationId),
    updatedAt: normalizeText(settings?.updatedAt) || undefined,
    updatedByRepId: normalizeText(settings?.updatedByRepId) || undefined,
    updatedByRepName: normalizeText(settings?.updatedByRepName) || undefined,
  };
}

function normalizeThreadState(threadState) {
  return {
    locationId: normalizeLocationId(threadState?.locationId),
    status: threadState?.status,
    resolvedAt: normalizeText(threadState?.resolvedAt) || undefined,
    manualAssignment: threadState?.manualAssignment,
    assignmentHistory: Array.isArray(threadState?.assignmentHistory)
      ? threadState.assignmentHistory
      : [],
    notes: Array.isArray(threadState?.notes) ? threadState.notes : [],
    replyLog: Array.isArray(threadState?.replyLog) ? threadState.replyLog : [],
    snooze: threadState?.snooze,
    updatedAt: normalizeText(threadState?.updatedAt) || new Date().toISOString(),
    updatedByRepId: normalizeText(threadState?.updatedByRepId) || undefined,
    updatedByRepName: normalizeText(threadState?.updatedByRepName) || undefined,
  };
}

function normalizePresenceType(value) {
  return value === "working" ? "working" : "viewing";
}

function normalizeSessionInvalidationReason(value) {
  if (
    value === "access_changed" ||
    value === "deactivated" ||
    value === "missing_microsoft_context" ||
    value === "missing_app_session" ||
    value === "graph_unauthorized" ||
    value === "microsoft_session_missing" ||
    value === "microsoft_session_expired"
  ) {
    return value;
  }

  return "missing_app_session";
}

function mapPresenceRow(row) {
  return {
    threadId: row.thread_id,
    activeUserId: row.user_id,
    activeUserName: row.user_name,
    activeUserRole: normalizeRole(row.role),
    presenceType: normalizePresenceType(row.presence_type),
    updatedAt: row.updated_at,
  };
}

class SharedWorkflowStore {
  constructor(databasePath, options = {}) {
    const filename =
      normalizeText(databasePath) ||
      path.resolve(process.cwd(), ".local-data", "action-desk-shared.sqlite");
    ensureDirectory(filename);
    this.databasePath = filename;
    this.logger = options.logger;
    this.demoDataEnabled = isDemoDataEnabled(options);

    try {
      this.database = new Database(filename);
      this.database.pragma("journal_mode = WAL");
      this.invalidatedSessions = new Map();
      this.ensureSchema();
      if (this.demoDataEnabled) {
        this.seedDemoUsers();
      } else {
        this.logger?.info("database", "Demo user seed skipped.", {
          enableWith: "ACTION_DESK_ENABLE_DEMO_DATA=true",
        });
      }
      this.logger?.info("database", "Shared workflow database initialized.", {
        databasePath: filename,
      });
    } catch (error) {
      this.logger?.error("database", "Failed to initialize shared workflow database.", {
        databasePath: filename,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  ensureSchema() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS rep_profiles (
        id TEXT PRIMARY KEY,
        entra_object_id TEXT UNIQUE,
        name TEXT NOT NULL,
        initials TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL,
        location_id TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_sessions (
        session_id TEXT PRIMARY KEY,
        rep_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS customer_settings (
        id TEXT PRIMARY KEY,
        owner_rep_id TEXT,
        owner_rep_ids_json TEXT NOT NULL DEFAULT '[]',
        assigned_csrs_json TEXT NOT NULL DEFAULT '[]',
        name TEXT NOT NULL,
        emails_json TEXT NOT NULL,
        domains_json TEXT NOT NULL DEFAULT '[]',
        location_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by_rep_id TEXT
      );

      CREATE TABLE IF NOT EXISTS workflow_preferences (
        rep_id TEXT PRIMARY KEY,
        preferences_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workflow_sla_settings (
        settings_key TEXT PRIMARY KEY,
        location_id TEXT,
        settings_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by_rep_id TEXT
      );

      CREATE TABLE IF NOT EXISTS workflow_threads (
        thread_id TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS thread_presence (
        thread_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        role TEXT NOT NULL,
        presence_type TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (thread_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS email_thread_bindings (
        email_id TEXT PRIMARY KEY,
        conversation_id TEXT,
        fallback_key TEXT,
        workflow_thread_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS test_queue_emails (
        id TEXT PRIMARY KEY,
        location_id TEXT,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by_rep_id TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_customer_settings_owner
        ON customer_settings (owner_rep_id);

      CREATE INDEX IF NOT EXISTS idx_email_thread_bindings_conversation
        ON email_thread_bindings (conversation_id);

      CREATE INDEX IF NOT EXISTS idx_email_thread_bindings_fallback
        ON email_thread_bindings (fallback_key);

      CREATE INDEX IF NOT EXISTS idx_thread_presence_updated_at
        ON thread_presence (updated_at);

      CREATE INDEX IF NOT EXISTS idx_test_queue_emails_location
        ON test_queue_emails (location_id);
    `);

    const repProfileColumns = this.database
      .prepare(`PRAGMA table_info(rep_profiles)`)
      .all()
      .map((row) => row.name);

    if (!repProfileColumns.includes("location_id")) {
      this.database.exec(`ALTER TABLE rep_profiles ADD COLUMN location_id TEXT`);
    }

    const customerSettingsColumns = this.database
      .prepare(`PRAGMA table_info(customer_settings)`)
      .all()
      .map((row) => row.name);

    if (!customerSettingsColumns.includes("domains_json")) {
      this.database.exec(
        `ALTER TABLE customer_settings ADD COLUMN domains_json TEXT NOT NULL DEFAULT '[]'`,
      );
    }

    if (!customerSettingsColumns.includes("location_id")) {
      this.database.exec(`ALTER TABLE customer_settings ADD COLUMN location_id TEXT`);
    }

    if (!customerSettingsColumns.includes("owner_rep_ids_json")) {
      this.database.exec(
        `ALTER TABLE customer_settings ADD COLUMN owner_rep_ids_json TEXT NOT NULL DEFAULT '[]'`,
      );
    }

    if (!customerSettingsColumns.includes("assigned_csrs_json")) {
      this.database.exec(
        `ALTER TABLE customer_settings ADD COLUMN assigned_csrs_json TEXT NOT NULL DEFAULT '[]'`,
      );
    }

    const slaSettingsColumns = this.database
      .prepare(`PRAGMA table_info(workflow_sla_settings)`)
      .all()
      .map((row) => row.name);

    if (!slaSettingsColumns.includes("location_id")) {
      this.database.exec(`ALTER TABLE workflow_sla_settings ADD COLUMN location_id TEXT`);
    }
  }

  seedDemoUsers() {
    const now = new Date().toISOString();
    const reps = [
      {
        id: "rep-mj",
        entra_object_id: null,
        name: "Mia Johnson",
        initials: "MJ",
        email: "mia.johnson@actiondesk.local",
        role: "rep",
        location_id: "apexpress-1",
        is_active: 1,
      },
      {
        id: "rep-ar",
        entra_object_id: null,
        name: "Alex Rivera",
        initials: "AR",
        email: "alex.rivera@actiondesk.local",
        role: "rep",
        location_id: "apexpress-1",
        is_active: 1,
      },
      {
        id: "rep-lc",
        entra_object_id: null,
        name: "Logan Chen",
        initials: "LC",
        email: "logan.chen@actiondesk.local",
        role: "supervisor",
        location_id: "apexpress-1",
        is_active: 1,
      },
      {
        id: "admin-sl",
        entra_object_id: null,
        name: "Sam Lee",
        initials: "SL",
        email: "sam.lee@actiondesk.local",
        role: "admin",
        location_id: null,
        is_active: 1,
      },
    ];
    // Demo users are insert-only. Existing records, including deactivated demo
    // users, must not be reset or reactivated during startup.
    const statement = this.database.prepare(`
      INSERT OR IGNORE INTO rep_profiles (
        id,
        entra_object_id,
        name,
        initials,
        email,
        role,
        location_id,
        is_active,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @entra_object_id,
        @name,
        @initials,
        @email,
        @role,
        @location_id,
        @is_active,
        @created_at,
        @updated_at
      )
    `);

    for (const rep of reps) {
      statement.run({
        ...rep,
        created_at: now,
        updated_at: now,
      });
    }
  }

  mapUserRow(row) {
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      initials: row.initials,
      email: row.email,
      role: normalizeRole(row.role),
      locationId: row.location_id || undefined,
      isActive: row.is_active === 1,
    };
  }

  isDemoUserRow(row) {
    if (!row) {
      return false;
    }

    return (
      DEMO_USER_IDS.has(normalizeText(row.id)) ||
      DEMO_USER_EMAILS.has(normalizeEmail(row.email))
    );
  }

  shouldIncludeUserRow(row) {
    return this.demoDataEnabled || !this.isDemoUserRow(row);
  }

  getUserRecordById(repId) {
    return this.database
      .prepare(`
        SELECT id, entra_object_id, name, initials, email, role, location_id, is_active, created_at, updated_at
        FROM rep_profiles
        WHERE id = ?
      `)
      .get(repId);
  }

  listReps() {
    return this.database
      .prepare(`
        SELECT id, name, initials, email, role, location_id, is_active
        FROM rep_profiles
        WHERE is_active = 1
        ORDER BY
          CASE role
            WHEN 'admin' THEN 0
            WHEN 'supervisor' THEN 1
            ELSE 2
          END,
          name ASC
      `)
      .all()
      .filter((row) => this.shouldIncludeUserRow(row))
      .map((row) => this.mapUserRow(row));
  }

  listVisibleReps(currentUser) {
    const reps = this.listReps();

    if (!currentUser || currentUser.role === "admin") {
      return reps;
    }

    return reps.filter(
      (rep) =>
        !rep.locationId ||
        normalizeLocationId(rep.locationId) === normalizeLocationId(currentUser.locationId),
    );
  }

  listUsers(sessionId) {
    this.requireCapability(sessionId, "manage_users");
    return this.listUsersInternal();
  }

  listUsersInternal() {
    return this.database
      .prepare(`
        SELECT id, entra_object_id, name, initials, email, role, location_id, is_active, created_at, updated_at
        FROM rep_profiles
        ORDER BY name ASC
      `)
      .all()
      .filter((row) => this.shouldIncludeUserRow(row))
      .map((row) => ({
        id: row.id,
        entraObjectId: row.entra_object_id || undefined,
        displayName: row.name,
        initials: row.initials,
        email: row.email,
        role: normalizeRole(row.role),
        locationId: row.location_id || undefined,
        isActive: row.is_active === 1,
        hasSignedIn: Boolean(row.entra_object_id),
        mappingStatus: row.entra_object_id ? "mapped" : "pending_first_sign_in",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
  }

  countActiveAdmins(excludingUserId) {
    const rows = this.database
      .prepare(`
      SELECT id, email
      FROM rep_profiles
      WHERE role = 'admin' AND is_active = 1
    `)
      .all();
    const normalizedExcludingUserId = normalizeText(excludingUserId);

    return rows.filter(
      (row) =>
        row.id !== normalizedExcludingUserId && this.shouldIncludeUserRow(row),
    ).length;
  }

  assertAdminSafety(userId, nextRole, nextIsActive) {
    const existing = this.getUserRecordById(userId);

    if (!existing) {
      throw new Error("User not found.");
    }

    const currentIsAdmin = normalizeRole(existing.role) === "admin";
    const willRemainActiveAdmin = nextRole === "admin" && nextIsActive === true;

    if (currentIsAdmin && !willRemainActiveAdmin && this.countActiveAdmins(userId) === 0) {
      throw new Error("Action Desk must keep at least one active admin.");
    }
  }

  createUser(sessionId, payload) {
    const actingUser = this.requireCapability(sessionId, "manage_users");
    const displayName = normalizeText(payload?.displayName);
    const email = normalizeEmail(payload?.email);
    const role = normalizeRole(payload?.role);
    const isActive = payload?.isActive !== false;
    const initials = normalizeInitials(payload?.initials, displayName, email);
    const locationId = normalizeLocationId(payload?.locationId) || null;

    if (!displayName) {
      throw new Error("Display name is required.");
    }

    if (!email) {
      throw new Error("Email is required.");
    }

    const existingByEmail = this.database
      .prepare(`SELECT id FROM rep_profiles WHERE email = ?`)
      .get(email);

    if (existingByEmail) {
      throw new Error("A user with that email already exists.");
    }

    const now = new Date().toISOString();

    this.database
      .prepare(`
        INSERT INTO rep_profiles (
          id,
          entra_object_id,
          name,
          initials,
          email,
          role,
          location_id,
          is_active,
          created_at,
          updated_at
        )
        VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        createId("rep"),
        displayName,
        initials,
        email,
        role,
        locationId,
        isActive ? 1 : 0,
        now,
        now,
      );

    this.logger?.info("admin", "User created.", {
      actingRepId: actingUser.id,
      email,
      role,
      isActive,
      locationId,
    });

    return this.listUsersInternal();
  }

  updateUser(sessionId, payload) {
    const actingUser = this.requireCapability(sessionId, "manage_users");
    const userId = normalizeText(payload?.userId);

    if (!userId) {
      throw new Error("User id is required.");
    }

    const existing = this.getUserRecordById(userId);

    if (!existing) {
      throw new Error("User not found.");
    }

    const nextRole = payload?.role ? normalizeRole(payload.role) : normalizeRole(existing.role);
    const nextIsActive =
      payload?.isActive === undefined ? existing.is_active === 1 : payload.isActive === true;
    const nextName = normalizeText(payload?.displayName) || existing.name;
    const nextEmail = existing.email;
    const nextInitials = normalizeInitials(payload?.initials, nextName, nextEmail);
    const nextLocationId =
      payload?.locationId === undefined
        ? existing.location_id || null
        : normalizeLocationId(payload.locationId) || null;
    const now = new Date().toISOString();
    const didRoleChange = normalizeRole(existing.role) !== nextRole;
    const didActiveStateChange = (existing.is_active === 1) !== nextIsActive;

    this.assertAdminSafety(userId, nextRole, nextIsActive);

    this.database
      .prepare(`
        UPDATE rep_profiles
        SET name = ?,
            initials = ?,
            email = ?,
            role = ?,
            location_id = ?,
            is_active = ?,
            updated_at = ?
        WHERE id = ?
      `)
      .run(
        nextName,
        nextInitials,
        nextEmail,
        nextRole,
        nextLocationId,
        nextIsActive ? 1 : 0,
        now,
        userId,
      );

    this.logger?.info("admin", "User access updated.", {
      actingRepId: actingUser.id,
      userId,
      role: nextRole,
      isActive: nextIsActive,
      locationId: nextLocationId,
    });

    const users = this.listUsersInternal();

    if (didRoleChange || didActiveStateChange) {
      this.invalidateSessionsForUser(userId, nextIsActive ? "access_changed" : "deactivated");
    }

    return users;
  }

  deactivateUser(sessionId, userId) {
    const normalizedUserId = normalizeText(userId);
    const actingUser = this.requireCapability(sessionId, "manage_users");

    if (!normalizedUserId) {
      throw new Error("User id is required.");
    }

    const existing = this.getUserRecordById(normalizedUserId);

    if (!existing) {
      throw new Error("User not found.");
    }

    const wasActive = existing.is_active === 1;

    this.assertAdminSafety(normalizedUserId, normalizeRole(existing.role), false);

    this.database
      .prepare(`
        UPDATE rep_profiles
        SET is_active = 0,
            updated_at = ?
        WHERE id = ?
      `)
      .run(new Date().toISOString(), normalizedUserId);

    this.logger?.info("admin", "User deactivated.", {
      actingRepId: actingUser.id,
      userId: normalizedUserId,
    });

    const users = this.listUsersInternal();

    if (wasActive) {
      this.invalidateSessionsForUser(normalizedUserId, "deactivated");
    }

    return users;
  }

  getCurrentUser(sessionId) {
    const normalizedSessionId = normalizeText(sessionId);

    if (!normalizedSessionId) {
      return null;
    }

    const row = this.database
      .prepare(`
        SELECT rep_profiles.id, rep_profiles.name, rep_profiles.initials, rep_profiles.email, rep_profiles.role, rep_profiles.location_id, rep_profiles.is_active
        FROM user_sessions
        JOIN rep_profiles ON rep_profiles.id = user_sessions.rep_id
        WHERE user_sessions.session_id = ?
      `)
      .get(normalizedSessionId);

    if (!row || row.is_active !== 1 || !this.shouldIncludeUserRow(row)) {
      return null;
    }

    return this.mapUserRow(row);
  }

  getSessionSummary(sessionId) {
    const currentUser = this.getCurrentUser(sessionId);
    return buildSessionSummary(
      normalizeText(sessionId),
      currentUser,
      this.listVisibleReps(currentUser),
    );
  }

  pruneInvalidatedSessions() {
    const cutoff = Date.now() - INVALIDATED_SESSION_TTL_MS;

    for (const [sessionId, entry] of this.invalidatedSessions.entries()) {
      const invalidatedAt = Date.parse(entry.invalidatedAt);

      if (Number.isNaN(invalidatedAt) || invalidatedAt < cutoff) {
        this.invalidatedSessions.delete(sessionId);
      }
    }
  }

  recordInvalidatedSession(sessionId, reason) {
    const normalizedSessionId = normalizeText(sessionId);

    if (!normalizedSessionId) {
      return;
    }

    this.pruneInvalidatedSessions();
    this.invalidatedSessions.set(normalizedSessionId, {
      invalidatedAt: new Date().toISOString(),
      reason: normalizeSessionInvalidationReason(reason),
    });
  }

  clearInvalidatedSessionState(sessionId) {
    const normalizedSessionId = normalizeText(sessionId);

    if (!normalizedSessionId) {
      return;
    }

    this.invalidatedSessions.delete(normalizedSessionId);
  }

  getInvalidatedSessionState(sessionId) {
    const normalizedSessionId = normalizeText(sessionId);

    if (!normalizedSessionId) {
      return null;
    }

    this.pruneInvalidatedSessions();
    const entry = this.invalidatedSessions.get(normalizedSessionId);

    if (!entry) {
      return null;
    }

    return {
      sessionId: normalizedSessionId,
      code: entry.reason,
      invalidatedAt: entry.invalidatedAt,
    };
  }

  getSessionRecord(sessionId) {
    const normalizedSessionId = normalizeText(sessionId);

    if (!normalizedSessionId) {
      return null;
    }

    return (
      this.database
        .prepare(`
          SELECT session_id, rep_id, created_at, updated_at
          FROM user_sessions
          WHERE session_id = ?
        `)
        .get(normalizedSessionId) ?? null
    );
  }

  listSessionIdsForUser(userId) {
    const normalizedUserId = normalizeText(userId);

    if (!normalizedUserId) {
      return [];
    }

    return this.database
      .prepare(`
        SELECT session_id
        FROM user_sessions
        WHERE rep_id = ?
      `)
      .all(normalizedUserId)
      .map((row) => row.session_id);
  }

  invalidateSession(sessionId, reason) {
    const normalizedSessionId = normalizeText(sessionId);

    if (!normalizedSessionId) {
      return;
    }

    const sessionRecord = this.getSessionRecord(normalizedSessionId);

    if (!sessionRecord) {
      return;
    }

    this.recordInvalidatedSession(normalizedSessionId, reason);
    this.authProvider?.signOutSession?.(normalizedSessionId);
    this.clearThreadPresenceForUser(sessionRecord.rep_id);
    this.database
      .prepare(`DELETE FROM user_sessions WHERE session_id = ?`)
      .run(normalizedSessionId);
    this.logger?.warn("auth", "Cleared stale Action Desk session.", {
      sessionId: normalizedSessionId,
      repId: sessionRecord.rep_id,
      reason: normalizeSessionInvalidationReason(reason),
    });
  }

  invalidateSessionsForUser(userId, reason) {
    const normalizedUserId = normalizeText(userId);

    if (!normalizedUserId) {
      return [];
    }

    const sessionIds = this.listSessionIdsForUser(normalizedUserId);

    if (sessionIds.length === 0) {
      return [];
    }

    this.clearThreadPresenceForUser(normalizedUserId);
    const statement = this.database.prepare(`DELETE FROM user_sessions WHERE session_id = ?`);

    for (const sessionId of sessionIds) {
      this.recordInvalidatedSession(sessionId, reason);
      this.authProvider?.signOutSession?.(sessionId);
      statement.run(sessionId);
    }

    this.logger?.warn("auth", "Cleared Action Desk sessions for affected user.", {
      repId: normalizedUserId,
      sessionCount: sessionIds.length,
      reason: normalizeSessionInvalidationReason(reason),
    });

    return sessionIds;
  }

  startSessionForIdentity(sessionId, identity) {
    const normalizedSessionId = normalizeText(sessionId) || createId("session");
    const entraObjectId = normalizeText(identity?.entraObjectId);
    const email = normalizeEmail(identity?.email);

    if (!entraObjectId || !email) {
      this.logger?.warn("auth", "Sign-in rejected because Entra identity was incomplete.");
      throw new Error("The Microsoft identity response was incomplete.");
    }

    const users = this.database
      .prepare(`
        SELECT id, entra_object_id, name, initials, email, role, is_active
        FROM rep_profiles
      `)
      .all()
      .filter((row) => this.shouldIncludeUserRow(row));
    const user = resolveMappedUser(users, {
      entraObjectId,
      email,
    });

    if (!user || user.is_active !== 1) {
      this.logger?.warn("auth", "Sign-in rejected because no active mapped user was found.", {
        entraObjectId,
        email,
      });
      throw new Error("Your Microsoft account is not authorized for Action Desk.");
    }

    if (!user.entra_object_id) {
      this.database
        .prepare(`
          UPDATE rep_profiles
          SET entra_object_id = ?, updated_at = ?
          WHERE id = ?
        `)
        .run(entraObjectId, new Date().toISOString(), user.id);
    }

    const now = new Date().toISOString();
    this.clearInvalidatedSessionState(normalizedSessionId);
    this.database
      .prepare(`
        INSERT INTO user_sessions (session_id, rep_id, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          rep_id = excluded.rep_id,
          updated_at = excluded.updated_at
      `)
      .run(normalizedSessionId, user.id, now, now);

    const currentUser = this.getCurrentUser(normalizedSessionId);

    this.logger?.info("auth", "Microsoft sign-in mapped to Action Desk user.", {
      repId: currentUser?.id,
      role: currentUser?.role,
      email: currentUser?.email,
    });

    return {
      sessionId: normalizedSessionId,
      currentUser,
      capabilities: currentUser ? getCapabilitiesForRole(currentUser.role) : [],
    };
  }

  logout(sessionId) {
    const sessionRecord = this.getSessionRecord(sessionId);

    if (sessionRecord) {
      this.clearThreadPresenceForUser(sessionRecord.rep_id);
    }

    this.clearInvalidatedSessionState(sessionId);

    this.database
      .prepare(`DELETE FROM user_sessions WHERE session_id = ?`)
      .run(normalizeText(sessionId));

    this.logger?.info("auth", "Action Desk session signed out.", {
      repId: sessionRecord?.rep_id,
      sessionId: normalizeText(sessionId),
    });
  }

  getPreferences(repId) {
    const row = this.database
      .prepare(`SELECT preferences_json FROM workflow_preferences WHERE rep_id = ?`)
      .get(repId);

    if (!row) {
      return normalizePreferences(undefined);
    }

    try {
      return normalizePreferences(JSON.parse(row.preferences_json));
    } catch {
      return normalizePreferences(undefined);
    }
  }

  savePreferences(sessionId, preferences) {
    const currentUser = this.requireCurrentUser(sessionId);
    const nextPreferences = normalizePreferences(preferences);
    const now = new Date().toISOString();

    this.database
      .prepare(`
        INSERT INTO workflow_preferences (rep_id, preferences_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(rep_id) DO UPDATE SET
          preferences_json = excluded.preferences_json,
          updated_at = excluded.updated_at
      `)
      .run(currentUser.id, JSON.stringify(nextPreferences), now);

    return nextPreferences;
  }

  getSlaSettings(locationId) {
    const normalizedLocationId = normalizeLocationId(locationId);
    const settingsKey = normalizedLocationId
      ? `location:${normalizedLocationId}`
      : "default";
    const row = this.database
      .prepare(`
        SELECT settings_json
        FROM workflow_sla_settings
        WHERE settings_key = ?
      `)
      .get(settingsKey);

    if (!row && normalizedLocationId) {
      return this.getSlaSettings();
    }

    if (!row) {
      return normalizeSlaSettings(undefined);
    }

    try {
      return normalizeSlaSettings(JSON.parse(row.settings_json));
    } catch {
      return normalizeSlaSettings(undefined);
    }
  }

  saveSlaSettings(sessionId, settings) {
    const currentUser = this.requireCapability(sessionId, "manage_sla_settings");
    const locationId =
      currentUser.role === "admin"
        ? normalizeLocationId(settings?.locationId) || undefined
        : currentUser.locationId;
    const nextSettings = normalizeSlaSettings({
      ...settings,
      locationId,
      updatedAt: new Date().toISOString(),
      updatedByRepId: currentUser.id,
      updatedByRepName: currentUser.name,
    });
    const settingsKey = nextSettings.locationId
      ? `location:${nextSettings.locationId}`
      : "default";

    this.database
      .prepare(`
        INSERT INTO workflow_sla_settings (
          settings_key,
          location_id,
          settings_json,
          updated_at,
          updated_by_rep_id
        )
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(settings_key) DO UPDATE SET
          location_id = excluded.location_id,
          settings_json = excluded.settings_json,
          updated_at = excluded.updated_at,
          updated_by_rep_id = excluded.updated_by_rep_id
      `)
      .run(
        settingsKey,
        nextSettings.locationId ?? null,
        JSON.stringify(nextSettings),
        nextSettings.updatedAt,
        currentUser.id,
      );

    this.logger?.info("workflow", "SLA settings updated.", {
      updatedBy: currentUser.id,
      locationId: nextSettings.locationId ?? null,
      firstResponseSlaMinutes: nextSettings.firstResponseSlaMinutes,
      resolutionSlaMinutes: nextSettings.resolutionSlaMinutes,
    });

    return nextSettings;
  }

  listCustomers() {
    return this.database
      .prepare(`
        SELECT id, owner_rep_id, owner_rep_ids_json, assigned_csrs_json, name, emails_json, domains_json, location_id, updated_by_rep_id
        FROM customer_settings
        ORDER BY name ASC, id ASC
      `)
      .all()
      .map((row) => {
        const ownerRepId = row.owner_rep_id || undefined;
        const ownerRepIds = Array.from(
          new Set([
            ...(ownerRepId ? [ownerRepId] : []),
            ...normalizeOwnerRepIds(parseJsonArray(row.owner_rep_ids_json)),
          ]),
        );
        const assignedCSRs = normalizeCustomerAssignments(
          parseJsonArray(row.assigned_csrs_json),
          ownerRepId,
          ownerRepIds,
        );
        const allOwnerRepIds = Array.from(
          new Set([
            ...ownerRepIds,
            ...assignedCSRs
              .filter((assignment) => assignment.isActive)
              .map((assignment) => assignment.repId),
          ]),
        );
        const primaryOwnerRepId = getPrimaryOwnerRepId(
          assignedCSRs,
          ownerRepId,
          allOwnerRepIds,
        );

        return {
          id: row.id,
          name: row.name,
          emails: parseJsonArray(row.emails_json),
          domains: normalizeCustomerDomains(parseJsonArray(row.domains_json)),
          ownerRepId: primaryOwnerRepId,
          ownerRepIds: allOwnerRepIds,
          assignedCSRs,
          locationId: row.location_id || undefined,
          updatedBy: row.updated_by_rep_id || undefined,
        };
      });
  }

  listCustomersForUser(currentUser) {
    const customers = this.listCustomers();

    if (!currentUser || currentUser.role === "admin") {
      return customers;
    }

    return customers.filter(
      (customer) =>
        !customer.locationId ||
        normalizeLocationId(customer.locationId) === normalizeLocationId(currentUser.locationId),
    );
  }

  upsertCustomer(sessionId, draft) {
    const currentUser = this.requireCapability(sessionId, "manage_customer_ownership");
    const normalizedDraft = normalizeCustomerDraft(draft);

    if (
      !normalizedDraft.name &&
      normalizedDraft.emails.length === 0 &&
      normalizedDraft.domains.length === 0
    ) {
      this.logger?.warn("customers", "Rejected empty customer save.", {
        repId: currentUser.id,
      });
      throw new Error("Customer name, email, or domain is required.");
    }

    const blockedDomain = normalizedDraft.domains.find((domain) =>
      BLOCKED_PUBLIC_CUSTOMER_DOMAINS.has(domain),
    );

    if (blockedDomain) {
      throw new Error(
        `${blockedDomain} is blocked because public email domains are too broad for customer ownership matching.`,
      );
    }

    const ownerRepRows = normalizedDraft.ownerRepIds.map((repId) =>
      this.database
        .prepare(`SELECT id, location_id FROM rep_profiles WHERE id = ? AND is_active = 1`)
        .get(repId),
    );

    if (ownerRepRows.some((row) => !row)) {
      throw new Error("Customer owners must be active Action Desk users.");
    }

    const primaryOwnerRep = normalizedDraft.ownerRepId
      ? ownerRepRows.find((row) => row?.id === normalizedDraft.ownerRepId)
      : ownerRepRows[0] ?? null;
    const locationId =
      normalizedDraft.locationId ||
      primaryOwnerRep?.location_id ||
      (currentUser.role === "admin" ? undefined : currentUser.locationId);

    if (
      ownerRepRows.some(
        (ownerRep) => ownerRep?.location_id && locationId && ownerRep.location_id !== locationId,
      )
    ) {
      throw new Error("Customer owners must belong to the selected location.");
    }

    if (
      currentUser.role !== "admin" &&
      currentUser.locationId &&
      locationId &&
      currentUser.locationId !== locationId
    ) {
      throw new Error("Customer location must match your Action Desk location.");
    }

    const conflictingCustomer = this.listCustomers().find((customer) => {
      if (customer.id === normalizedDraft.id) {
        return false;
      }

      return customer.domains.some((domain) => normalizedDraft.domains.includes(domain));
    });

    if (conflictingCustomer) {
      const conflictingDomain = conflictingCustomer.domains.find((domain) =>
        normalizedDraft.domains.includes(domain),
      );
      throw new Error(
        `${conflictingDomain} is already assigned to ${conflictingCustomer.name}. Each company domain can belong to only one customer.`,
      );
    }

    const now = new Date().toISOString();
    this.database
      .prepare(`
        INSERT INTO customer_settings (
          id,
          owner_rep_id,
          owner_rep_ids_json,
          assigned_csrs_json,
          name,
          emails_json,
          domains_json,
          location_id,
          created_at,
          updated_at,
          updated_by_rep_id
        )
        VALUES (@id, @owner_rep_id, @owner_rep_ids_json, @assigned_csrs_json, @name, @emails_json, @domains_json, @location_id, @created_at, @updated_at, @updated_by_rep_id)
        ON CONFLICT(id) DO UPDATE SET
          owner_rep_id = excluded.owner_rep_id,
          owner_rep_ids_json = excluded.owner_rep_ids_json,
          assigned_csrs_json = excluded.assigned_csrs_json,
          name = excluded.name,
          emails_json = excluded.emails_json,
          domains_json = excluded.domains_json,
          location_id = excluded.location_id,
          updated_at = excluded.updated_at,
          updated_by_rep_id = excluded.updated_by_rep_id
      `)
      .run({
        id: normalizedDraft.id,
        owner_rep_id: normalizedDraft.ownerRepId ?? null,
        owner_rep_ids_json: JSON.stringify(normalizedDraft.ownerRepIds),
        assigned_csrs_json: JSON.stringify(normalizedDraft.assignedCSRs),
        name:
          normalizedDraft.name ||
          normalizedDraft.emails[0] ||
          normalizedDraft.domains[0],
        emails_json: JSON.stringify(normalizedDraft.emails),
        domains_json: JSON.stringify(normalizedDraft.domains),
        location_id: locationId ?? null,
        created_at: now,
        updated_at: now,
        updated_by_rep_id: currentUser.id,
      });

    this.logger?.info("customers", "Customer ownership updated.", {
      customerId: normalizedDraft.id,
      ownerRepId: normalizedDraft.ownerRepId ?? null,
      locationId: locationId ?? null,
      updatedBy: currentUser.id,
    });

    return this.listCustomersForUser(currentUser);
  }

  deleteCustomer(sessionId, customerId) {
    const currentUser = this.requireCapability(sessionId, "manage_customer_ownership");
    const normalizedCustomerId = normalizeText(customerId);

    if (currentUser.role === "admin") {
      this.database
        .prepare(`DELETE FROM customer_settings WHERE id = ?`)
        .run(normalizedCustomerId);
    } else {
      this.database
        .prepare(
          `DELETE FROM customer_settings WHERE id = ? AND (location_id IS NULL OR location_id = ?)`,
        )
        .run(normalizedCustomerId, currentUser.locationId ?? null);
    }

    this.logger?.info("customers", "Customer deleted.", {
      customerId: normalizedCustomerId,
      updatedBy: currentUser.id,
    });

    return this.listCustomersForUser(currentUser);
  }

  clearCustomers(sessionId) {
    const currentUser = this.requireCapability(sessionId, "manage_customer_ownership");

    if (currentUser.role === "admin") {
      this.database.prepare(`DELETE FROM customer_settings`).run();
    } else {
      this.database
        .prepare(`DELETE FROM customer_settings WHERE location_id = ?`)
        .run(currentUser.locationId ?? null);
    }

    this.logger?.info("customers", "All customers cleared.", {
      updatedBy: currentUser.id,
    });

    return this.listCustomersForUser(currentUser);
  }

  listThreadStates(currentUser) {
    return Object.fromEntries(
      this.database
        .prepare(`SELECT thread_id, state_json FROM workflow_threads`)
        .all()
        .map((row) => {
          try {
            return [row.thread_id, normalizeThreadState(JSON.parse(row.state_json))];
          } catch {
            return [row.thread_id, normalizeThreadState(undefined)];
          }
        })
        .filter(([, state]) => {
          if (!currentUser || currentUser.role === "admin") {
            return true;
          }

          return !state.locationId || state.locationId === currentUser.locationId;
        }),
    );
  }

  pruneExpiredThreadPresence(now = new Date()) {
    const expiresBefore = new Date(now.getTime() - THREAD_PRESENCE_TIMEOUT_MS).toISOString();

    this.database
      .prepare(`DELETE FROM thread_presence WHERE updated_at < ?`)
      .run(expiresBefore);
  }

  listThreadPresence(now = new Date()) {
    this.pruneExpiredThreadPresence(now);

    const records = this.database
      .prepare(
        `
          SELECT thread_id, user_id, user_name, role, presence_type, updated_at
          FROM thread_presence
          ORDER BY updated_at DESC
        `,
      )
      .all()
      .map((row) => mapPresenceRow(row));

    return records.reduce((presenceByThread, record) => {
      presenceByThread[record.threadId] = [
        ...(presenceByThread[record.threadId] ?? []),
        record,
      ];
      return presenceByThread;
    }, {});
  }

  upsertThreadPresence(sessionId, threadId, presenceType) {
    const currentUser = this.requireCurrentUser(sessionId);
    const normalizedThreadId = normalizeText(threadId);

    if (!normalizedThreadId) {
      throw new Error("Thread id is required.");
    }

    const now = new Date().toISOString();

    this.database
      .prepare(
        `
          INSERT INTO thread_presence (
            thread_id,
            user_id,
            user_name,
            role,
            presence_type,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(thread_id, user_id) DO UPDATE SET
            user_name = excluded.user_name,
            role = excluded.role,
            presence_type = excluded.presence_type,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        normalizedThreadId,
        currentUser.id,
        currentUser.name,
        currentUser.role,
        normalizePresenceType(presenceType),
        now,
      );

    return this.listThreadPresence();
  }

  clearThreadPresence(sessionId, threadId) {
    const currentUser = this.requireCurrentUser(sessionId);
    const normalizedThreadId = normalizeText(threadId);

    if (normalizedThreadId) {
      this.database
        .prepare(`DELETE FROM thread_presence WHERE thread_id = ? AND user_id = ?`)
        .run(normalizedThreadId, currentUser.id);
    } else {
      this.clearThreadPresenceForUser(currentUser.id);
    }

    return this.listThreadPresence();
  }

  clearThreadPresenceForUser(userId) {
    const normalizedUserId = normalizeText(userId);

    if (!normalizedUserId) {
      return;
    }

    this.database
      .prepare(`DELETE FROM thread_presence WHERE user_id = ?`)
      .run(normalizedUserId);
  }

  saveThreadState(sessionId, threadId, threadState) {
    const currentUser = this.requireCurrentUser(sessionId);
    const normalizedThreadId = normalizeText(threadId);

    if (!normalizedThreadId) {
      this.logger?.warn("workflow", "Rejected workflow thread save without thread id.", {
        repId: currentUser.id,
      });
      throw new Error("Thread id is required.");
    }

    const nextState = normalizeThreadState({
      ...threadState,
      locationId:
        threadState?.locationId ||
        (currentUser.role === "admin" ? undefined : currentUser.locationId),
      updatedByRepId: currentUser.id,
      updatedByRepName: currentUser.name,
    });

    if (
      currentUser.role !== "admin" &&
      currentUser.locationId &&
      nextState.locationId &&
      currentUser.locationId !== nextState.locationId
    ) {
      throw new Error("This workflow thread belongs to another Action Desk location.");
    }
    const now = new Date().toISOString();

    this.database
      .prepare(`
        INSERT INTO workflow_threads (thread_id, state_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(thread_id) DO UPDATE SET
          state_json = excluded.state_json,
          updated_at = excluded.updated_at
      `)
      .run(normalizedThreadId, JSON.stringify(nextState), now);

    if (nextState.manualAssignment) {
      this.logger?.info("workflow", "Manual override saved.", {
        threadId: normalizedThreadId,
        assignedRepId: nextState.manualAssignment.assignedRepId,
        reason: nextState.manualAssignment.reason,
        updatedBy: currentUser.id,
      });
    }

    return nextState;
  }

  syncThreadBindings(sessionId, entries) {
    this.requireCurrentUser(sessionId);

    const selectByEmail = this.database.prepare(
      `SELECT workflow_thread_id FROM email_thread_bindings WHERE email_id = ?`,
    );
    const selectByConversation = this.database.prepare(
      `SELECT workflow_thread_id FROM email_thread_bindings WHERE conversation_id = ? LIMIT 1`,
    );
    const selectByFallback = this.database.prepare(
      `SELECT workflow_thread_id FROM email_thread_bindings WHERE fallback_key = ? LIMIT 1`,
    );
    const upsert = this.database.prepare(`
      INSERT INTO email_thread_bindings (
        email_id,
        conversation_id,
        fallback_key,
        workflow_thread_id,
        created_at,
        updated_at
      )
      VALUES (@email_id, @conversation_id, @fallback_key, @workflow_thread_id, @created_at, @updated_at)
      ON CONFLICT(email_id) DO UPDATE SET
        conversation_id = excluded.conversation_id,
        fallback_key = excluded.fallback_key,
        workflow_thread_id = excluded.workflow_thread_id,
        updated_at = excluded.updated_at
    `);

    const bindings = {};

    for (const entry of Array.isArray(entries) ? entries : []) {
      const emailId = normalizeText(entry?.emailId);

      if (!emailId) {
        continue;
      }

      const conversationId = normalizeText(entry?.conversationId) || null;
      const fallbackKey = normalizeText(entry?.fallbackKey) || null;

      const existingByEmail = selectByEmail.get(emailId);
      const existingByConversation =
        !existingByEmail && conversationId
          ? selectByConversation.get(conversationId)
          : null;
      const existingByFallback =
        !existingByEmail && !existingByConversation && fallbackKey
          ? selectByFallback.get(fallbackKey)
          : null;

      const workflowThreadId =
        existingByEmail?.workflow_thread_id ||
        existingByConversation?.workflow_thread_id ||
        existingByFallback?.workflow_thread_id ||
        conversationId ||
        createId("thread");
      const now = new Date().toISOString();

      upsert.run({
        email_id: emailId,
        conversation_id: conversationId,
        fallback_key: fallbackKey,
        workflow_thread_id: workflowThreadId,
        created_at: now,
        updated_at: now,
      });

      bindings[emailId] = workflowThreadId;
    }

    return bindings;
  }

  buildTestQueueEmails(currentUser) {
    const now = Date.now();
    const locations = ["apexpress-1", "apexpress-2", "worldpackusa"];
    const scenarios = [
      {
        key: "where-order",
        locationId: locations[0],
        fromName: "Jordan Hayes",
        fromEmail: "jordan.hayes@northstarfixtures.com",
        subject: "Where is my order ORD-7401?",
        bodyText:
          "TEST DATA\n\nCan you confirm where order ORD-7401 is? The tracking link has not updated since yesterday.",
        minutesAgo: 35,
      },
      {
        key: "delivered-not-received",
        locationId: locations[0],
        fromName: "Priya Shah",
        fromEmail: "priya.shah@luma-retail.com",
        subject: "Delivered but not received",
        bodyText:
          "TEST DATA\n\nTracking says our shipment delivered this morning, but our dock team cannot locate it. Please investigate.",
        minutesAgo: 95,
      },
      {
        key: "damaged",
        locationId: locations[1],
        fromName: "Marcus Reed",
        fromEmail: "mreed@harborhomegoods.com",
        subject: "Damaged shipment photos attached",
        bodyText:
          "TEST DATA\n\nSeveral cartons arrived crushed and two units are damaged. What do you need from us to file the claim?",
        minutesAgo: 155,
      },
      {
        key: "cancel",
        locationId: locations[1],
        fromName: "Elena Torres",
        fromEmail: "elena@canyonmarket.com",
        subject: "Cancel this order",
        bodyText:
          "TEST DATA\n\nPlease cancel ORD-7520 if it has not shipped yet. The customer no longer needs it.",
        minutesAgo: 20,
      },
      {
        key: "billing",
        locationId: locations[2],
        fromName: "Drew Collins",
        fromEmail: "ap@seabrightmedical.com",
        subject: "Billing question on invoice INV-4482",
        bodyText:
          "TEST DATA\n\nCan you review the freight charge on invoice INV-4482? It does not match our quote.",
        minutesAgo: 300,
      },
      {
        key: "unknown",
        locationId: locations[2],
        fromName: "Unknown Customer",
        fromEmail: "buyer@unknown-customer.example",
        subject: "Need help with a shipment",
        bodyText:
          "TEST DATA\n\nI need help finding a shipment, but I am not sure who our account rep is.",
        minutesAgo: 70,
      },
    ];

    return scenarios.map((scenario) => {
      const id = `test-${scenario.key}`;

      return {
        id,
        externalId: id,
        provider: "test_data",
        threadId: `test-thread-${scenario.key}`,
        locationId: scenario.locationId,
        subject: `${TEST_QUEUE_DATA_PREFIX}${scenario.subject}`,
        fromName: scenario.fromName,
        fromEmail: scenario.fromEmail,
        receivedAt: new Date(now - scenario.minutesAgo * 60_000).toISOString(),
        bodyText: scenario.bodyText,
        previewText: scenario.bodyText.replace(/\s+/g, " ").trim(),
        toRecipients: [currentUser.email],
      };
    });
  }

  createTestQueueData(sessionId) {
    if (!this.demoDataEnabled) {
      throw new Error(
        "Demo queue data is disabled. Set ACTION_DESK_ENABLE_DEMO_DATA=true to create test queue data.",
      );
    }

    const currentUser = this.requireCapability(sessionId, "manage_test_queue_data");
    const emails = this.buildTestQueueEmails(currentUser);
    const now = new Date().toISOString();
    const upsert = this.database.prepare(`
      INSERT INTO test_queue_emails (
        id,
        location_id,
        raw_json,
        created_at,
        created_by_rep_id
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        location_id = excluded.location_id,
        raw_json = excluded.raw_json,
        created_at = excluded.created_at,
        created_by_rep_id = excluded.created_by_rep_id
    `);

    for (const email of emails) {
      upsert.run(
        email.id,
        email.locationId ?? null,
        JSON.stringify(email),
        now,
        currentUser.id,
      );
    }

    this.logger?.info("admin", "Test queue data created.", {
      createdBy: currentUser.id,
      count: emails.length,
    });

    return { createdCount: emails.length };
  }

  removeTestQueueData(sessionId) {
    const currentUser = this.requireCapability(sessionId, "manage_test_queue_data");
    const result = this.database.prepare(`DELETE FROM test_queue_emails`).run();

    this.logger?.info("admin", "Test queue data removed.", {
      removedBy: currentUser.id,
      count: result.changes,
    });

    return { removedCount: result.changes };
  }

  listTestQueueEmails(sessionId) {
    if (!this.demoDataEnabled) {
      return [];
    }

    const currentUser = this.getCurrentUser(sessionId);
    const canSeeAll = currentUser?.role === "admin" || !currentUser?.locationId;
    const statement = this.database.prepare(
      canSeeAll
        ? `SELECT raw_json FROM test_queue_emails ORDER BY created_at DESC, id ASC`
        : `SELECT raw_json FROM test_queue_emails WHERE location_id = ? ORDER BY created_at DESC, id ASC`,
    );
    const rows = canSeeAll ? statement.all() : statement.all(currentUser.locationId);

    return rows
      .map((row) => {
        try {
          return JSON.parse(row.raw_json);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  getBootstrap(sessionId) {
    const session = this.getSessionSummary(sessionId);

    return {
      currentUser: session.currentUser,
      capabilities: session.capabilities,
      reps: session.reps,
      customers: this.listCustomersForUser(session.currentUser),
      slaSettings: this.getSlaSettings(session.currentUser?.locationId),
      workflowState: {
        reps: session.reps,
        currentRepId: session.currentUser?.id || "",
        threadStates: this.listThreadStates(session.currentUser),
        threadPresence: this.listThreadPresence(),
        preferences: session.currentUser
          ? this.getPreferences(session.currentUser.id)
          : normalizePreferences(undefined),
      },
    };
  }

  getHealth(sessionId) {
    let databaseReady = false;
    let repCount = 0;
    let threadCount = 0;
    let customerCount = 0;

    try {
      this.database.prepare("SELECT 1 AS ok").get();
      databaseReady = true;
      repCount = this.database
        .prepare("SELECT id, email FROM rep_profiles")
        .all()
        .filter((row) => this.shouldIncludeUserRow(row)).length;
      threadCount = this.database
        .prepare("SELECT COUNT(*) AS count FROM workflow_threads")
        .get().count;
      customerCount = this.database
        .prepare("SELECT COUNT(*) AS count FROM customer_settings")
        .get().count;
    } catch (error) {
      this.logger?.error("database", "Database health check failed.", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      ok: databaseReady,
      databaseReady,
      databasePath: this.databasePath,
      currentUser: this.getCurrentUser(sessionId),
      repCount,
      threadCount,
      customerCount,
      serverTime: new Date().toISOString(),
    };
  }

  async createBackup(sessionId) {
    const currentUser = this.requireCapability(sessionId, "create_backup");

    return createDatabaseBackup({
      database: this.database,
      databasePath: this.databasePath,
      logger: this.logger,
      currentUser,
    });
  }

  requireCurrentUser(sessionId) {
    const currentUser = this.getCurrentUser(sessionId);

    if (!currentUser) {
      this.logger?.warn("auth", "Rejected request without an active session.", {
        sessionId: normalizeText(sessionId) || undefined,
      });
      throw new Error("You must sign in before using the shared workflow.");
    }

    if (currentUser.isActive === false) {
      throw new Error("Your Action Desk account is inactive.");
    }

    return currentUser;
  }

  requireCapability(sessionId, capability) {
    const currentUser = this.requireCurrentUser(sessionId);
    const capabilities = getCapabilitiesForRole(currentUser.role);

    if (!capabilities.includes(capability)) {
      this.logger?.warn("auth", "Unauthorized access attempt.", {
        repId: currentUser.id,
        role: currentUser.role,
        capability,
      });
      throw new Error("You are not allowed to perform this action.");
    }

    return currentUser;
  }
}

module.exports = {
  SharedWorkflowStore,
  getCapabilitiesForRole,
};
