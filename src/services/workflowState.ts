import type {
  AssignmentRecord,
  AssignmentReason,
  EmailInternalNote,
  QueueDisplayMode,
  QueueScopeView,
  RepProfile,
  ThreadPresenceRecord,
  ThreadPresenceType,
  ReplyLogEntry,
  SnoozeState,
  ThreadWorkflowState,
  WorkflowPreferences,
  WorkflowState,
  WorkflowStatus,
  WorkflowStatusFilter,
} from "../types/actionDesk";
import {
  clearThreadPresenceForUser,
  createThreadPresenceRecord,
  upsertThreadPresence,
} from "./threadPresence";
import { normalizeLocationId } from "./locations";

const WORKFLOW_STATE_STORAGE_KEY = "action-desk.workflow-state";

const DEFAULT_REPS: RepProfile[] = [
  {
    id: "rep-mj",
    name: "Mia Johnson",
    initials: "MJ",
    email: "mia.johnson@actiondesk.local",
    role: "rep",
    locationId: "apexpress_irwindale",
  },
  {
    id: "rep-ar",
    name: "Alex Rivera",
    initials: "AR",
    email: "alex.rivera@actiondesk.local",
    role: "rep",
    locationId: "apexpress_irwindale",
  },
  {
    id: "rep-lc",
    name: "Logan Chen",
    initials: "LC",
    email: "logan.chen@actiondesk.local",
    role: "supervisor",
    locationId: "apexpress_irwindale",
  },
  {
    id: "admin-sl",
    name: "Sam Lee",
    initials: "SL",
    email: "sam.lee@actiondesk.local",
    role: "admin",
  },
];

const DEFAULT_PREFERENCES: WorkflowPreferences = {
  queueScopeView: "my_queue",
  queueDisplayMode: "list",
  statusFilter: "open",
  showSnoozed: false,
};

function safeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeRepRole(value: unknown): RepProfile["role"] {
  if (value === "admin" || value === "supervisor") {
    return value;
  }

  return "rep";
}

function safeQueueScopeView(value: unknown): QueueScopeView {
  if (
    value === "all_emails" ||
    value === "unassigned" ||
    value === "my_queue"
  ) {
    return value;
  }

  return DEFAULT_PREFERENCES.queueScopeView;
}

function safeQueueDisplayMode(value: unknown): QueueDisplayMode {
  if (value === "grouped_by_rep" || value === "list") {
    return value;
  }

  return DEFAULT_PREFERENCES.queueDisplayMode;
}

function safeWorkflowStatus(value: unknown): WorkflowStatus | undefined {
  if (
    value === "new" ||
    value === "in_progress" ||
    value === "waiting_on_customer" ||
    value === "resolved"
  ) {
    return value;
  }

  return undefined;
}

function safeWorkflowStatusFilter(value: unknown): WorkflowStatusFilter {
  if (
    value === "all" ||
    value === "open" ||
    value === "new" ||
    value === "in_progress" ||
    value === "waiting_on_customer" ||
    value === "resolved"
  ) {
    return value;
  }

  return DEFAULT_PREFERENCES.statusFilter;
}

function normalizeRepProfile(value: unknown): RepProfile | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rep = value as Partial<RepProfile>;
  const id = safeText(rep.id).trim();
  const name = safeText(rep.name).trim();
  const initials = safeText(rep.initials).trim();
  const email = safeText((rep as Partial<RepProfile> & { email?: string }).email).trim();

  if (!id || !name || !initials || !email) {
    return null;
  }

  return {
    id,
    name,
    initials,
    email,
    role: safeRepRole(rep.role),
    locationId: normalizeLocationId(rep.locationId),
  };
}

function normalizeAssignmentReason(value: unknown): AssignmentReason | undefined {
  if (
    value === "Covering for colleague" ||
    value === "Unassigned" ||
    value === "Unassigned customer" ||
    value === "Overflow"
  ) {
    return value === "Unassigned customer" ? "Unassigned" : value;
  }

  return undefined;
}

function normalizeNote(value: unknown): EmailInternalNote | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const note = value as Partial<EmailInternalNote>;
  const id = safeText(note.id).trim();
  const authorRepId = safeText(note.authorRepId).trim();
  const authorName = safeText(note.authorName).trim();
  const createdAt = safeText(note.createdAt).trim();
  const body = safeText(note.body).trim();

  if (!id || !authorRepId || !authorName || !createdAt || !body) {
    return null;
  }

  return {
    id,
    authorRepId,
    authorName,
    createdAt,
    body,
  };
}

function normalizeReplyLogEntry(value: unknown): ReplyLogEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entry = value as Partial<ReplyLogEntry>;
  const id = safeText(entry.id).trim();
  const repId = safeText(entry.repId).trim();
  const repName = safeText(entry.repName).trim();
  const createdAt = safeText(entry.createdAt).trim();

  if (!id || !repId || !repName || !createdAt) {
    return null;
  }

  return {
    id,
    repId,
    repName,
    createdAt,
  };
}

function normalizeSnoozeState(value: unknown): SnoozeState | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const snooze = value as Partial<SnoozeState>;
  const until = safeText(snooze.until).trim();
  const snoozedByRepId = safeText(snooze.snoozedByRepId).trim();
  const snoozedByRepName = safeText(snooze.snoozedByRepName).trim();
  const createdAt = safeText(snooze.createdAt).trim();

  if (!until || !snoozedByRepId || !snoozedByRepName || !createdAt) {
    return undefined;
  }

  return {
    until,
    snoozedByRepId,
    snoozedByRepName,
    createdAt,
  };
}

function normalizeAssignmentRecord(
  value: unknown,
): ThreadWorkflowState["assignmentHistory"][number] | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<ThreadWorkflowState["assignmentHistory"][number]>;
  const type = record.type === "manual" ? "manual" : record.type === "auto" ? "auto" : undefined;
  const assignedRepId = safeText(record.assignedRepId).trim();
  const assignedRepName = safeText(record.assignedRepName).trim();
  const assignedAt = safeText(record.assignedAt).trim();

  if (!type || !assignedRepId || !assignedRepName || !assignedAt) {
    return null;
  }

  return {
    type,
    assignedRepId,
    assignedRepName,
    assignedAt,
    reason: normalizeAssignmentReason(record.reason),
    assignedByRepId: safeText(record.assignedByRepId).trim() || undefined,
  };
}

function normalizeThreadWorkflowState(value: unknown): ThreadWorkflowState {
  if (!value || typeof value !== "object") {
    return {
      locationId: undefined,
      assignmentHistory: [],
      notes: [],
      replyLog: [],
    };
  }

  const state = value as Partial<ThreadWorkflowState>;

  return {
    status: safeWorkflowStatus(state.status),
    locationId: normalizeLocationId(state.locationId),
    resolvedAt: safeText(state.resolvedAt).trim() || undefined,
    manualAssignment: normalizeAssignmentRecord(state.manualAssignment) ?? undefined,
    autoAssignment: normalizeAssignmentRecord(state.autoAssignment) ?? undefined,
    assignmentHistory: Array.isArray(state.assignmentHistory)
      ? state.assignmentHistory
          .map((entry) => normalizeAssignmentRecord(entry))
          .filter(
            (entry): entry is ThreadWorkflowState["assignmentHistory"][number] =>
              entry !== null,
          )
      : [],
    notes: Array.isArray(state.notes)
      ? state.notes
          .map((note) => normalizeNote(note))
          .filter((note): note is EmailInternalNote => note !== null)
      : [],
    replyLog: Array.isArray(state.replyLog)
      ? state.replyLog
          .map((entry) => normalizeReplyLogEntry(entry))
          .filter((entry): entry is ReplyLogEntry => entry !== null)
      : [],
    snooze: normalizeSnoozeState(state.snooze),
    updatedAt: safeText(state.updatedAt).trim() || undefined,
    updatedByRepId: safeText(state.updatedByRepId).trim() || undefined,
    updatedByRepName: safeText(state.updatedByRepName).trim() || undefined,
  };
}

function safePresenceType(value: unknown): ThreadPresenceType | undefined {
  return value === "viewing" || value === "working" ? value : undefined;
}

function normalizeThreadPresenceRecord(value: unknown): ThreadPresenceRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const presence = value as Partial<ThreadPresenceRecord>;
  const threadId = safeText(presence.threadId).trim();
  const activeUserId = safeText(presence.activeUserId).trim();
  const activeUserName = safeText(presence.activeUserName).trim();
  const presenceType = safePresenceType(presence.presenceType);
  const updatedAt = safeText(presence.updatedAt).trim();

  if (!threadId || !activeUserId || !activeUserName || !presenceType || !updatedAt) {
    return null;
  }

  return {
    threadId,
    activeUserId,
    activeUserName,
    activeUserRole: safeRepRole(presence.activeUserRole),
    presenceType,
    updatedAt,
  };
}

function normalizeThreadPresence(
  value: unknown,
): Record<string, ThreadPresenceRecord[]> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([threadId, records]) => [
      threadId,
      Array.isArray(records)
        ? records
            .map((record) => normalizeThreadPresenceRecord(record))
            .filter((record): record is ThreadPresenceRecord => record !== null)
        : [],
    ]).filter(([, records]) => records.length > 0),
  );
}

function normalizePreferences(value: unknown): WorkflowPreferences {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_PREFERENCES };
  }

  const preferences = value as Partial<WorkflowPreferences>;

  return {
    queueScopeView: safeQueueScopeView(preferences.queueScopeView),
    queueDisplayMode: safeQueueDisplayMode(preferences.queueDisplayMode),
    statusFilter: safeWorkflowStatusFilter(preferences.statusFilter),
    showSnoozed: preferences.showSnoozed === true,
  };
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

export function getDefaultRepProfiles(): RepProfile[] {
  return DEFAULT_REPS.map((rep) => ({ ...rep }));
}

export function getDefaultWorkflowState(): WorkflowState {
  return {
    reps: getDefaultRepProfiles(),
    currentRepId: DEFAULT_REPS[0].id,
    threadStates: {},
    threadPresence: {},
    preferences: { ...DEFAULT_PREFERENCES },
  };
}

export function loadWorkflowState(): WorkflowState {
  if (typeof window === "undefined" || !window.localStorage) {
    return getDefaultWorkflowState();
  }

  try {
    const rawValue = window.localStorage.getItem(WORKFLOW_STATE_STORAGE_KEY);

    if (!rawValue) {
      return getDefaultWorkflowState();
    }

    const parsedValue = JSON.parse(rawValue) as Partial<WorkflowState>;
    const reps = Array.isArray(parsedValue.reps)
      ? parsedValue.reps
          .map((rep) => normalizeRepProfile(rep))
          .filter((rep): rep is RepProfile => rep !== null)
      : [];
    const nextReps = reps.length > 0 ? reps : getDefaultRepProfiles();
    const currentRepId = nextReps.some((rep) => rep.id === parsedValue.currentRepId)
      ? safeText(parsedValue.currentRepId).trim()
      : nextReps[0].id;
    const threadStates =
      parsedValue.threadStates && typeof parsedValue.threadStates === "object"
        ? Object.fromEntries(
            Object.entries(parsedValue.threadStates).map(([threadId, threadState]) => [
              threadId,
              normalizeThreadWorkflowState(threadState),
            ]),
          )
        : {};

    return {
      reps: nextReps,
      currentRepId,
      threadStates,
      threadPresence: normalizeThreadPresence(parsedValue.threadPresence),
      preferences: normalizePreferences(parsedValue.preferences),
    };
  } catch {
    return getDefaultWorkflowState();
  }
}

export function saveWorkflowState(state: WorkflowState) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  window.localStorage.setItem(
    WORKFLOW_STATE_STORAGE_KEY,
    JSON.stringify(state),
  );
}

function ensureThreadState(
  state: WorkflowState,
  threadId: string,
): ThreadWorkflowState {
  return (
    state.threadStates[threadId] ?? {
      assignmentHistory: [],
      notes: [],
      replyLog: [],
    }
  );
}

function updateThreadState(
  state: WorkflowState,
  threadId: string,
  updater: (current: ThreadWorkflowState) => ThreadWorkflowState,
  actor?: RepProfile,
): WorkflowState {
  const nextThreadState = updater(ensureThreadState(state, threadId));

  return {
    ...state,
    threadStates: {
      ...state.threadStates,
      [threadId]: {
        ...nextThreadState,
        updatedAt: new Date().toISOString(),
        updatedByRepId: actor?.id ?? nextThreadState.updatedByRepId,
        updatedByRepName: actor?.name ?? nextThreadState.updatedByRepName,
      },
    },
  };
}

export function setCurrentRep(
  state: WorkflowState,
  repId: string,
): WorkflowState {
  if (!state.reps.some((rep) => rep.id === repId)) {
    return state;
  }

  return {
    ...state,
    currentRepId: repId,
  };
}

export function setQueueScopeView(
  state: WorkflowState,
  queueScopeView: QueueScopeView,
): WorkflowState {
  return {
    ...state,
    preferences: {
      ...state.preferences,
      queueScopeView,
    },
  };
}

export function setQueueDisplayMode(
  state: WorkflowState,
  queueDisplayMode: QueueDisplayMode,
): WorkflowState {
  return {
    ...state,
    preferences: {
      ...state.preferences,
      queueDisplayMode,
    },
  };
}

export function setWorkflowStatusFilter(
  state: WorkflowState,
  statusFilter: WorkflowStatusFilter,
): WorkflowState {
  return {
    ...state,
    preferences: {
      ...state.preferences,
      statusFilter,
    },
  };
}

export function setShowSnoozed(
  state: WorkflowState,
  showSnoozed: boolean,
): WorkflowState {
  return {
    ...state,
    preferences: {
      ...state.preferences,
      showSnoozed,
    },
  };
}

export function setWorkflowThreadPresence(
  state: WorkflowState,
  threadPresence: Record<string, ThreadPresenceRecord[]>,
): WorkflowState {
  return {
    ...state,
    threadPresence,
  };
}

export function recordThreadPresence(
  state: WorkflowState,
  threadId: string,
  rep: RepProfile,
  presenceType: ThreadPresenceType,
  updatedAt?: string,
): WorkflowState {
  const record = createThreadPresenceRecord({
    threadId,
    user: rep,
    presenceType,
    updatedAt,
  });

  return {
    ...state,
    threadPresence: upsertThreadPresence(state.threadPresence, record),
  };
}

export function clearWorkflowThreadPresence(
  state: WorkflowState,
  userId: string,
  threadId?: string,
): WorkflowState {
  return {
    ...state,
    threadPresence: clearThreadPresenceForUser(
      state.threadPresence,
      userId,
      threadId,
    ),
  };
}

export function setThreadWorkflowStatus(
  state: WorkflowState,
  threadId: string,
  status: WorkflowStatus,
  actor?: RepProfile,
): WorkflowState {
  return updateThreadState(state, threadId, (current) => ({
    ...current,
    status,
    resolvedAt:
      status === "resolved"
        ? current.resolvedAt ?? new Date().toISOString()
        : undefined,
    snooze: status === "resolved" ? undefined : current.snooze,
  }), actor);
}

export function takeThreadAssignment(
  state: WorkflowState,
  threadId: string,
  rep: RepProfile,
  reason: AssignmentReason,
  assignedByRepId?: string,
): WorkflowState {
  const assignmentRecord = {
    type: "manual" as const,
    assignedRepId: rep.id,
    assignedRepName: rep.name,
    assignedAt: new Date().toISOString(),
    reason,
    assignedByRepId,
  };

  return updateThreadState(state, threadId, (current) => ({
    ...current,
    manualAssignment: assignmentRecord,
    assignmentHistory: [...current.assignmentHistory, assignmentRecord],
    status:
      current.status && current.status !== "resolved"
        ? current.status
        : "in_progress",
  }), rep);
}

export function setThreadAutoAssignment(
  state: WorkflowState,
  threadId: string,
  autoAssignment: AssignmentRecord | undefined,
  locationId?: string,
): WorkflowState {
  const currentState = ensureThreadState(state, threadId);

  if (currentState.manualAssignment) {
    return state;
  }

  const currentAutoAssignment = currentState.autoAssignment;
  const normalizedLocationId = normalizeLocationId(locationId);
  const currentLocationId = currentState.locationId;
  const hasSameAssignment =
    currentAutoAssignment?.assignedRepId === autoAssignment?.assignedRepId &&
    currentAutoAssignment?.assignedRepName === autoAssignment?.assignedRepName &&
    currentAutoAssignment?.assignedAt === autoAssignment?.assignedAt &&
    currentAutoAssignment?.type === autoAssignment?.type;
  const hasSameLocation =
    !normalizedLocationId || currentLocationId === normalizedLocationId;

  if (hasSameAssignment && hasSameLocation) {
    return state;
  }

  return updateThreadState(state, threadId, (current) => ({
    ...current,
    autoAssignment,
    locationId: current.locationId ?? normalizedLocationId,
  }));
}

export function addInternalNote(
  state: WorkflowState,
  threadId: string,
  rep: RepProfile,
  body: string,
): WorkflowState {
  const trimmedBody = body.trim();

  if (!trimmedBody) {
    return state;
  }

  const note: EmailInternalNote = {
    id: createId("note"),
    authorRepId: rep.id,
    authorName: rep.name,
    createdAt: new Date().toISOString(),
    body: trimmedBody,
  };

  return updateThreadState(state, threadId, (current) => ({
    ...current,
    notes: [...current.notes, note],
  }), rep);
}

export function logReplyForThread(
  state: WorkflowState,
  threadId: string,
  rep: RepProfile,
): WorkflowState {
  const entry: ReplyLogEntry = {
    id: createId("reply-log"),
    repId: rep.id,
    repName: rep.name,
    createdAt: new Date().toISOString(),
  };

  return updateThreadState(state, threadId, (current) => ({
    ...current,
    replyLog: [...current.replyLog, entry],
    status: current.status === "resolved" ? "resolved" : "waiting_on_customer",
  }), rep);
}

export function setThreadSnooze(
  state: WorkflowState,
  threadId: string,
  rep: RepProfile,
  until: string,
): WorkflowState {
  return updateThreadState(state, threadId, (current) => ({
    ...current,
    snooze: {
      until,
      snoozedByRepId: rep.id,
      snoozedByRepName: rep.name,
      createdAt: new Date().toISOString(),
    },
  }), rep);
}

export function clearThreadSnooze(
  state: WorkflowState,
  threadId: string,
  actor?: RepProfile,
): WorkflowState {
  return updateThreadState(state, threadId, (current) => ({
    ...current,
    snooze: undefined,
  }), actor);
}

export function getRepById(
  reps: RepProfile[],
  repId?: string,
): RepProfile | undefined {
  if (!repId) {
    return undefined;
  }

  return reps.find((rep) => rep.id === repId);
}
