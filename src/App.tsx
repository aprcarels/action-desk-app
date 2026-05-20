import { useEffect, useRef, useState } from "react";
import { QueueApplicationService } from "./app/queueApplicationService";
import {
  runPersistedMarkDone,
  runPersistedRecomputePriority,
  runPersistedUpdateWorkStatus,
} from "./app/persistedQueueActions";
import {
  runPersistedInitialLoad,
  runPersistedLoadMore,
} from "./app/persistedQueueLoadHelpers";
import {
  applyCustomerPriority,
  createFailedProcessedEmail,
  createPendingProcessedEmail,
  createProcessedEmail,
  type CustomerPriorityFilter,
  filterProcessedEmails,
  getIntentOptions,
  processEmailsProgressively,
  replaceProcessedEmail,
  rematchLoadedQueueItems,
  refreshProcessedEmailReplyDraft,
} from "./app/processEmails";
import { runActionDesk } from "./app/runActionDesk";
import { AuthPanel } from "./components/AuthPanel";
import { SyncStatusBanner } from "./components/SyncStatusBanner";
import { EmailDetail } from "./components/EmailDetail";
import { InboxQueue } from "./components/InboxQueue";
import { MetricsBar } from "./components/MetricsBar";
import { RepWorkloadPanel } from "./components/RepWorkloadPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { SupervisorQuickFilters } from "./components/SupervisorQuickFilters";
import { WorkflowToolbar } from "./components/WorkflowToolbar";
import {
  deriveIssueType,
  getIssueTypeLabel,
  type IssueType,
} from "./domain/issueType";
import { buildAnalysisInput } from "./services/analysisInput";
import {
  formatCaseForReview,
  formatRawCaseJson,
} from "./services/caseReviewCopy";
import { syncAutoAssignmentsToWorkflowState } from "./services/autoAssignmentSync";
import { shouldShowInCustomerServiceQueue } from "./services/customerServiceMail";
import { getCustomerOwnerRepIds } from "./services/customerSettings";
import {
  generateReply,
  getReplyUnavailableReason,
  type ReplyGenerationContext,
  type ReplyUnavailableReason,
} from "./services/generateReply";
import { loadInboxQueue } from "./services/loadInboxQueue";
import {
  applyBuiltInMacro,
  getBuiltInMacros,
  type MacroId,
} from "./services/macros";
import {
  PILOT_ORDER_DATA_MESSAGE,
  isPilotModeEnabled,
} from "./services/pilotMode";
import {
  getPilotQueueItemState,
  loadPilotQueueStateMap,
  savePilotQueueStateMap,
  setPilotUsefulnessFeedback,
  setPilotWorkflowStatus,
  shouldShowPilotQueueItemInView,
  snoozePilotQueueItemUntilTomorrow,
  type PilotQueueStateMap,
} from "./services/pilotQueueState";
import { getQueueAgeInfo } from "./services/queueAging";
import { isSuppressibleSystemReportMissingBodyFailure } from "./services/systemReportEmail";
import {
  getCachedProcessedEmail,
  setCachedProcessedEmail,
  updateProcessedEmailCache,
} from "./services/processedEmailCache";
import { isPersistedQueueEnabled } from "./services/persistedQueueFeature";
import {
  buildWorkflowThreads,
  applySupervisorQuickFilter,
  calculateWorkflowMetrics,
  calculateRepWorkloadSummaries,
  calculateSupervisorSummaryMetrics,
  canViewSupervisorVisibility,
  flattenRepGroupedQueueSections,
  filterWorkflowThreads,
  groupWorkflowThreadsByAssignedRep,
  getWorkflowThreadNavigation,
  getWorkloadVisibleReps,
  getVisibleWorkflowThreads,
  sanitizeQueueScopeView,
} from "./services/workflowSelectors";
import {
  clearStoredSharedWorkflowSession,
  clearSharedCustomers,
  createOutlookReplyDraft,
  createSharedTestQueueData,
  createSharedUser,
  createSharedWorkflowBackup,
  deactivateSharedUser,
  deleteSharedCustomer,
  getSharedWorkflowErrorMessage,
  getSharedSessionExpiredEventName,
  isStaleSharedWorkflowSessionError,
  loadAuthSession,
  loadSharedThreadPresence,
  loadSharedUsers,
  loadSharedWorkflowBootstrap,
  loadSharedWorkflowHealth,
  removeSharedTestQueueData,
  saveSharedSlaSettings,
  saveSharedThreadState,
  saveSharedWorkflowPreferences,
  setBackendApiOrigin,
  setSharedApiOrigin,
  signInSharedWorkflow,
  signOutSharedWorkflow,
  syncSharedThreadBindings,
  updateSharedUserAccess,
  upsertSharedCustomer,
  getExpiredMicrosoftSessionMessage,
  upsertSharedThreadPresence,
  clearSharedThreadPresence,
} from "./services/sharedWorkflowApi";
import {
  getOutlookReplyDraftText,
  hasOutlookReplyDraftText,
} from "./services/outlookDraftContent";
import {
  getActiveThreadPresence,
  getPresenceConflictWarning,
} from "./services/threadPresence";
import { getDefaultSlaSettings } from "./services/sla";
import {
  normalizeManagedUsers,
  normalizeRepProfiles,
  normalizeSavedCustomers,
} from "./services/sharedWorkflowDataNormalization";
import {
  ACTION_DESK_LOCATIONS,
  canAccessLocation,
  getLocationLabel,
} from "./services/locations";
import { getEnv } from "./utils/env";
import {
  getDefaultRepProfiles,
  addInternalNote,
  clearWorkflowThreadPresence,
  clearThreadSnooze,
  logReplyForThread,
  getDefaultWorkflowState,
  recordThreadPresence,
  setQueueDisplayMode,
  setQueueScopeView,
  setShowSnoozed,
  setThreadSnooze,
  setThreadWorkflowStatus,
  setWorkflowThreadPresence,
  setWorkflowStatusFilter,
  takeThreadAssignment,
} from "./services/workflowState";
import type {
  AssignmentReason,
  AuthSession,
  EmailItem,
  IntentCode,
  ManagedUser,
  ManagedUserDraft,
  PilotQueueItemState,
  PilotQueueView,
  PilotUsefulnessFeedback,
  ProcessedEmail,
  QueueScopeView,
  RepProfile,
  SavedCustomer,
  SavedCustomerDraft,
  SlaSettings,
  SupervisorQuickFilter,
  ThreadWorkflowState,
  WorkflowThread,
  WorkflowState,
  WorkflowStatus,
  WorkflowStatusFilter,
} from "./types/actionDesk";

const SIGN_IN_REQUIRED_MESSAGE = "Sign in to Microsoft to load your live inbox.";
const BUILT_IN_MACROS = getBuiltInMacros();

type TopIssue = {
  code: IssueType;
  label: string;
  count: number;
};

type SharedWorkflowBootstrap = Awaited<
  ReturnType<typeof loadSharedWorkflowBootstrap>
>;

type SettingsMutationRefreshOptions = {
  returnedCustomers?: SavedCustomer[];
  returnedUsers?: ManagedUser[];
  savedCustomerId?: string;
  removedCustomerId?: string;
  clearCustomers?: boolean;
};

type InboxReloadReason = "initial" | "manual_refresh";

const QUEUE_PROCESSING_FLUSH_INTERVAL_MS = 200;
const QUEUE_PROCESSING_FLUSH_BATCH_SIZE = 5;

type BootstrapValidationReason =
  | "missingCurrentUser"
  | "invalidBootstrapShape"
  | "missingCapabilities"
  | "invalidWorkflowState";

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const merged = new Map<string, T>();

  for (const item of current) {
    if (item.id) {
      merged.set(item.id, item);
    }
  }

  for (const item of incoming) {
    if (item.id) {
      merged.set(item.id, item);
    }
  }

  return Array.from(merged.values());
}

function normalizeTextForMatch(value?: string): string {
  return (value ?? "").trim().toLowerCase();
}

function containsEveryTextValue(values: string[], expectedValues: string[]): boolean {
  const normalizedValues = new Set(values.map(normalizeTextForMatch));

  return expectedValues
    .map(normalizeTextForMatch)
    .filter(Boolean)
    .every((value) => normalizedValues.has(value));
}

function findSavedCustomerIdFromDraft(
  draft: SavedCustomerDraft,
  customers: SavedCustomer[],
): string | undefined {
  if (draft.id?.trim()) {
    return draft.id.trim();
  }

  const normalizedDraftName = normalizeTextForMatch(draft.name);
  const matchingCustomer = customers.find((customer) => {
    const nameMatches =
      normalizedDraftName.length === 0 ||
      normalizeTextForMatch(customer.name) === normalizedDraftName;

    return (
      nameMatches &&
      containsEveryTextValue(customer.emails ?? [], draft.emails ?? []) &&
      containsEveryTextValue(customer.domains ?? [], draft.domains ?? [])
    );
  });

  return matchingCustomer?.id;
}

function mapManagedUsersToRepProfiles(users: ManagedUser[]): RepProfile[] {
  return normalizeManagedUsers(users)
    .filter((user) => user.isActive)
    .map((user) => ({
      id: user.id,
      name: user.displayName,
      displayName: user.displayName,
      initials: user.initials,
      email: user.email,
      role: user.role,
      locationId: user.locationId,
      isActive: user.isActive,
    }));
}

function getErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallbackMessage;
}

function buildReplyGenerationContext(
  item: ProcessedEmail,
  thread?: WorkflowThread,
): ReplyGenerationContext {
  return {
    subject: item.email.subject,
    senderName: item.email.senderName,
    senderEmail: item.email.senderEmail,
    body: item.email.body,
    bodyPreview: item.email.previewText || item.previewText,
    summary: item.result?.analysis.summary,
    customerName: item.customerMatch?.customerName || thread?.customerName,
    threadItemCount: thread?.itemCount ?? 1,
  };
}

function getReplyUnavailableMessage(
  reason: ReplyUnavailableReason | null,
): string {
  switch (reason) {
    case "internal_alert":
      return "A reply draft is not available because this message is classified as an internal or automated alert.";
    case "non_customer_work":
      return "A reply draft is not available because this message is not classified as customer support work.";
    case "reply_not_needed":
      return "A reply draft is not available because Action Desk marked this message as not needing a customer response.";
    case "not_action_required":
      return "Action Desk marked this message as review-only, so it could not safely create a customer reply.";
    case "unclear_request":
      return "Action Desk could not find enough customer request detail to draft a reply.";
    case null:
    default:
      return "The reply generator did not return a draft. Review the case context and try again.";
  }
}

function getReplyRegenerationLogContext(
  item: ProcessedEmail,
  context: ReplyGenerationContext,
) {
  return {
    emailId: maskIdentifier(item.email.id),
    queueItemId: maskIdentifier(item.queueItemId),
    status: item.status,
    analysisSource: item.result?.analysisSource,
    intent: item.result?.analysis.intent,
    urgency: item.result?.analysis.urgency,
    replyNeeded: item.result?.analysis.replyNeeded,
    actionability: item.result?.analysis.actionability,
    workType: item.result?.analysis.workType,
    hasSubject: hasLoggableText(context.subject),
    hasBody: hasLoggableText(context.body),
    hasBodyPreview: hasLoggableText(context.bodyPreview),
    hasSummary: hasLoggableText(context.summary),
    hasOrderContext: Boolean(item.result?.orderContext),
    hasCustomerContext: hasLoggableText(context.customerName),
    threadItemCount: context.threadItemCount ?? 1,
  };
}

function hasLoggableText(value?: string): boolean {
  return Boolean(value?.trim());
}

function maskIdentifier(value?: string): string | undefined {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return undefined;
  }

  if (trimmedValue.length <= 8) {
    return `${trimmedValue.slice(0, 2)}...`;
  }

  return `${trimmedValue.slice(0, 4)}...${trimmedValue.slice(-4)}`;
}

function getCustomerDiagnosticName(customer: SavedCustomer): string {
  return (
    customer.name?.trim() ||
    customer.emails?.[0] ||
    customer.domains?.[0] ||
    customer.id
  );
}

function logSharedWorkflowDataDiagnostics(input: {
  context: string;
  currentUser: RepProfile | null;
  customers: SavedCustomer[];
  reps: RepProfile[];
  source?: "backend_api" | "sharedWorkflowStore" | "signed_out";
}) {
  if (!import.meta.env.DEV) {
    return;
  }

  const activeCsrs = input.reps.filter(
    (rep) => rep.role === "rep" && rep.isActive !== false,
  );
  const assignmentCount = input.customers.reduce(
    (count, customer) =>
      count +
      (customer.assignedCSRs?.filter((assignment) => assignment.isActive).length ??
        getCustomerOwnerRepIds(customer).length),
    0,
  );

  console.info("[Action Desk diagnostics] shared workflow data", {
    context: input.context,
    source: input.source ?? "backend_api",
    loadedLocationsCount: ACTION_DESK_LOCATIONS.length,
    loadedLocationIds: ACTION_DESK_LOCATIONS.map((location) => location.id),
    currentUserRole: input.currentUser?.role ?? null,
    currentUserLocationId: input.currentUser?.locationId ?? null,
    currentUserLocationLabel: input.currentUser?.locationId
      ? getLocationLabel(input.currentUser.locationId)
      : null,
    backendCustomerCount: input.customers.length,
    backendCsrCount: activeCsrs.length,
    backendAssignmentCount: assignmentCount,
    firstFiveCustomerNames: input.customers
      .slice(0, 5)
      .map((customer) => getCustomerDiagnosticName(customer)),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getBootstrapValidationReason(
  bootstrap: unknown,
): BootstrapValidationReason | null {
  if (!isRecord(bootstrap)) {
    return "invalidBootstrapShape";
  }

  if (!bootstrap.currentUser) {
    return "missingCurrentUser";
  }

  if (!Array.isArray(bootstrap.capabilities)) {
    return "missingCapabilities";
  }

  if (
    !Array.isArray(bootstrap.reps) ||
    !Array.isArray(bootstrap.customers) ||
    !isRecord(bootstrap.slaSettings)
  ) {
    return "invalidBootstrapShape";
  }

  if (!isRecord(bootstrap.workflowState)) {
    return "invalidWorkflowState";
  }

  const workflowState = bootstrap.workflowState;

  if (
    !Array.isArray(workflowState.reps) ||
    typeof workflowState.currentRepId !== "string" ||
    !isRecord(workflowState.threadStates) ||
    !isRecord(workflowState.threadPresence) ||
    !isRecord(workflowState.preferences)
  ) {
    return "invalidWorkflowState";
  }

  return null;
}

function logSharedWorkflowBootstrapValidation(input: {
  context: string;
  bootstrap: unknown;
  reason: BootstrapValidationReason | "validBootstrap";
}) {
  const bootstrap = isRecord(input.bootstrap) ? input.bootstrap : {};
  const workflowState = isRecord(bootstrap.workflowState)
    ? bootstrap.workflowState
    : {};
  const metadata = {
    context: input.context,
    reason: input.reason,
    currentUserExists: Boolean(bootstrap.currentUser),
    capabilitiesCount: Array.isArray(bootstrap.capabilities)
      ? bootstrap.capabilities.length
      : 0,
    repsCount: Array.isArray(bootstrap.reps) ? bootstrap.reps.length : 0,
    workflowRepsCount: Array.isArray(workflowState.reps)
      ? workflowState.reps.length
      : 0,
    customersCount: Array.isArray(bootstrap.customers)
      ? bootstrap.customers.length
      : 0,
    hasSlaSettings: isRecord(bootstrap.slaSettings),
    hasThreadStates: isRecord(workflowState.threadStates),
    hasThreadPresence: isRecord(workflowState.threadPresence),
    hasPreferences: isRecord(workflowState.preferences),
  };

  if (input.reason === "validBootstrap") {
    console.info("[Action Desk session] bootstrap validation passed", metadata);
    return;
  }

  console.warn("[Action Desk session] bootstrap validation failed", metadata);
}

function createBootstrapValidationError(reason: BootstrapValidationReason): Error {
  const error = new Error(
    "The shared workflow bootstrap response was missing required session data.",
  );
  error.name = "frontendValidationFailure";
  Object.assign(error, {
    code: "frontendValidationFailure",
    reason,
    retryable: true,
  });
  return error;
}

function validateSharedWorkflowBootstrap(
  context: string,
  bootstrap: SharedWorkflowBootstrap,
) {
  const reason = getBootstrapValidationReason(bootstrap);

  logSharedWorkflowBootstrapValidation({
    context,
    bootstrap,
    reason: reason ?? "validBootstrap",
  });

  if (reason) {
    throw createBootstrapValidationError(reason);
  }
}

function logSessionCleanup(input: {
  context: string;
  reason:
    | "missingCurrentUser"
    | "bootstrapException"
    | "frontendValidationFailure"
    | "userRequestedSignOut";
  message?: string;
}) {
  console.warn("[Action Desk session] session cleanup requested", {
    context: input.context,
    reason: input.reason,
    hasMessage: Boolean(input.message?.trim()),
  });
}

function getBootstrapExceptionReason(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    String((error as { code?: unknown }).code) === "frontendValidationFailure"
  ) {
    return "frontendValidationFailure" as const;
  }

  return "bootstrapException" as const;
}

function getSafeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function getAutoAssignmentSyncKey(
  threads: WorkflowThread[],
  workflowState: WorkflowState,
): string {
  return threads
    .map((thread) => {
      const state = workflowState.threadStates[thread.id];
      const desiredAutoAssignment =
        thread.currentAssignment?.type === "auto"
          ? thread.currentAssignment
          : undefined;
      const persistedAutoAssignment = state?.autoAssignment;

      return [
        thread.id,
        thread.locationId ?? "",
        desiredAutoAssignment?.assignedRepId ?? "",
        desiredAutoAssignment?.assignedRepName ?? "",
        desiredAutoAssignment?.assignedAt ?? "",
        persistedAutoAssignment?.assignedRepId ?? "",
        persistedAutoAssignment?.assignedRepName ?? "",
        persistedAutoAssignment?.assignedAt ?? "",
        state?.manualAssignment?.assignedRepId ?? "",
        state?.locationId ?? "",
      ].join(":");
    })
    .join("|");
}

function getWorkflowThreadPersistenceKey(
  threads: WorkflowThread[],
  workflowState: WorkflowState,
): string {
  return threads
    .map((thread) => {
      const state = workflowState.threadStates[thread.id];

      return [
        thread.id,
        thread.items.length,
        state ? "persisted" : "missing",
        state?.manualAssignment?.assignedRepId ?? "",
        state?.autoAssignment?.assignedRepId ?? "",
        state?.status ?? "",
        thread.locationId ?? "",
        thread.items
          .map((item) =>
            [
              item.email.id,
              item.email.workflowThreadId ? "bound" : "unbound",
            ].join(":"),
          )
          .join(","),
      ].join(":");
    })
    .join("|");
}

function createInitialWorkflowThreadState(
  thread: WorkflowThread,
): ThreadWorkflowState {
  const autoAssignment =
    thread.currentAssignment?.type === "auto"
      ? thread.currentAssignment
      : undefined;

  return {
    status: thread.status === "resolved" ? "resolved" : undefined,
    locationId: thread.locationId,
    autoAssignment,
    assignmentHistory: [],
    notes: [],
    replyLog: [],
  };
}

function getWorkflowThreadDiagnosticStatus(
  thread: WorkflowThread,
): "open" | "assigned" | "snoozed" | "resolved" {
  if (thread.status === "resolved") {
    return "resolved";
  }

  if (thread.isSnoozed || String(thread.status) === "snoozed") {
    return "snoozed";
  }

  if (thread.assignmentResolution.assignmentStatus === "assigned") {
    return "assigned";
  }

  return "open";
}

function getThreadRecordCount(workflowState: WorkflowState): number {
  return Object.keys(workflowState.threadStates).length;
}

function getIssueCode(item: ProcessedEmail): IssueType | null {
  if (item.status !== "processed" || !item.result) {
    return null;
  }

  return deriveIssueType(item.result.analysis, item.result.orderContext);
}

function getPilotItemStateForEmail(
  pilotItemStates: PilotQueueStateMap,
  emailId: string,
): PilotQueueItemState {
  return getPilotQueueItemState(pilotItemStates, emailId);
}

function sortVisibleQueueItemsByAge(
  items: ProcessedEmail[],
  pilotItemStates: PilotQueueStateMap,
  pilotMode: boolean,
  now = new Date(),
): ProcessedEmail[] {
  return [...items].sort((left, right) => {
    if (left.status !== "processed" || right.status !== "processed") {
      return 0;
    }

    if (Boolean(left.isCustomerPriority) !== Boolean(right.isCustomerPriority)) {
      return left.isCustomerPriority ? -1 : 1;
    }

    const leftPriority = left.result?.priorityScore ?? 0;
    const rightPriority = right.result?.priorityScore ?? 0;

    if (Math.abs(leftPriority - rightPriority) >= 15) {
      return 0;
    }

    const leftAge = getQueueAgeInfo({
      receivedAt: left.email.receivedAt,
      pilotItemState: pilotMode
        ? getPilotItemStateForEmail(pilotItemStates, left.email.id)
        : undefined,
      now,
    });
    const rightAge = getQueueAgeInfo({
      receivedAt: right.email.receivedAt,
      pilotItemState: pilotMode
        ? getPilotItemStateForEmail(pilotItemStates, right.email.id)
        : undefined,
      now,
    });

    if (rightAge.sortWeight !== leftAge.sortWeight) {
      return rightAge.sortWeight - leftAge.sortWeight;
    }

    return 0;
  });
}

function getOutlookReplyDraftMessageId(item?: ProcessedEmail): string {
  if (!item) {
    return "";
  }

  const isOutlookGraphMessage =
    item.email.source === "outlook_graph" ||
    item.email.provider === "outlook_graph";

  if (!isOutlookGraphMessage) {
    return "";
  }

  return (item.email.providerMessageId ?? item.email.id).trim();
}

export default function App() {
  const pilotMode = isPilotModeEnabled();
  const persistedQueueEnabled = isPersistedQueueEnabled();
  const initialWorkflowState = getDefaultWorkflowState();
  const [authSession, setAuthSession] = useState<AuthSession>({
    sessionId: "",
    currentUser: null,
    capabilities: [],
  });
  const [authLoading, setAuthLoading] = useState(true);
  const [workflowState, setWorkflowState] = useState<WorkflowState>(
    initialWorkflowState,
  );
  const [queueItems, setQueueItems] = useState<ProcessedEmail[]>([]);
  const [queueView, setQueueView] = useState<"customer_service" | "all_inbox">(
    "customer_service",
  );
  const [savedCustomers, setSavedCustomers] = useState<SavedCustomer[]>([]);
  const [slaSettings, setSlaSettings] = useState<SlaSettings>(() =>
    getDefaultSlaSettings(),
  );
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showDetailView, setShowDetailView] = useState(false);
  const [pilotItemStates, setPilotItemStates] = useState<PilotQueueStateMap>(
    () => (pilotMode ? loadPilotQueueStateMap() : {}),
  );
  const [pilotQueueView, setPilotQueueView] =
    useState<PilotQueueView>("active");
  const [selectedEmailId, setSelectedEmailId] = useState<string | undefined>(
    undefined,
  );
  const [loading, setLoading] = useState(false);
  const [isLoadingInbox, setIsLoadingInbox] = useState(false);
  const [isRefreshingInbox, setIsRefreshingInbox] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inboxLoadError, setInboxLoadError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | undefined>(
    undefined,
  );
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [replyActionError, setReplyActionError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [caseCopyFeedback, setCaseCopyFeedback] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [rawCaseCopyFeedback, setRawCaseCopyFeedback] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [regeneratingReply, setRegeneratingReply] = useState(false);
  const [outlookDraftCreationStatus, setOutlookDraftCreationStatus] =
    useState<"idle" | "creating" | "success" | "error">("idle");
  const [retryingEmailId, setRetryingEmailId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState<
    "all" | "high" | "medium" | "low"
  >("all");
  const [intentFilter, setIntentFilter] = useState<IntentCode | "all">("all");
  const [customerPriorityFilter, setCustomerPriorityFilter] =
    useState<CustomerPriorityFilter>("all");
  const [supervisorQuickFilter, setSupervisorQuickFilter] =
    useState<SupervisorQuickFilter>("all");
  const [showProblemsOnly, setShowProblemsOnly] = useState(false);
  const [activeIssueFilter, setActiveIssueFilter] =
    useState<TopIssue["code"] | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [hasAttemptedInboxLoad, setHasAttemptedInboxLoad] = useState(false);
  const [desktopRuntimeInfo, setDesktopRuntimeInfo] = useState<{
    isElectron: boolean;
    isDev: boolean;
    userDataPath: string;
    recommendedRepositoryBackend: "sqlite" | "api";
    actionDeskApiUrl?: string | null;
    runtimeConfigPath?: string | null;
    inboxSource?: string;
    appOrigin?: string | null;
    apiOrigin?: string | null;
    logFilePath?: string | null;
  } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [syncStatus, setSyncStatus] = useState<"idle" | "ok" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [lastSuccessfulSyncAt, setLastSuccessfulSyncAt] = useState<string | null>(null);
  const [adminUsers, setAdminUsers] = useState<ManagedUser[]>([]);
  const [sharedHealth, setSharedHealth] = useState<{
    ok: boolean;
    databaseReady: boolean;
    databasePath: string;
    currentUser: AuthSession["currentUser"];
    repCount: number;
    threadCount: number;
    customerCount: number;
    assignmentCount?: number;
    serverTime: string;
  } | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [lastBackupPath, setLastBackupPath] = useState<string | null>(null);
  const [testQueueDataLoading, setTestQueueDataLoading] = useState(false);

  const copyFeedbackTimeoutRef = useRef<number | null>(null);
  const caseCopyFeedbackTimeoutRef = useRef<number | null>(null);
  const rawCaseCopyFeedbackTimeoutRef = useRef<number | null>(null);
  const processingStatusTimeoutRef = useRef<number | null>(null);
  const syncMessageTimeoutRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const savedCustomersRef = useRef(savedCustomers);
  const adminUsersRef = useRef(adminUsers);
  const workflowStateRef = useRef(workflowState);
  const inboxReloadReasonRef = useRef<InboxReloadReason>("initial");
  const activePresenceThreadIdRef = useRef<string | null>(null);
  const inboxActionInFlightRef = useRef<"refresh" | "load_more" | null>(null);
  const nextInboxLoadInteractiveRef = useRef(false);
  const queueApplicationServiceRef = useRef<QueueApplicationService | null>(
    null,
  );

  function getQueueApplicationService(): QueueApplicationService {
    if (!queueApplicationServiceRef.current) {
      queueApplicationServiceRef.current = new QueueApplicationService();
    }

    return queueApplicationServiceRef.current;
  }

  function decorateQueueItems(items: ProcessedEmail[]): ProcessedEmail[] {
    return rematchLoadedQueueItems(items, savedCustomersRef.current);
  }

  function saveCustomers(nextCustomers: SavedCustomer[]) {
    const normalizedCustomers = normalizeSavedCustomers(nextCustomers);
    savedCustomersRef.current = normalizedCustomers;
    setSavedCustomers(normalizedCustomers);
    updateProcessedEmailCache((item) =>
      applyCustomerPriority([item], normalizedCustomers)[0],
    );
    setQueueItems((currentItems) =>
      rematchLoadedQueueItems(currentItems, normalizedCustomers),
    );
  }

  function applyAdminUsers(nextUsers: ManagedUser[]) {
    const normalizedUsers = normalizeManagedUsers(nextUsers);
    adminUsersRef.current = normalizedUsers;
    setAdminUsers(normalizedUsers);
    const nextReps = mapManagedUsersToRepProfiles(normalizedUsers);

    setWorkflowState((current) => ({
      ...current,
      reps: nextReps.length > 0 ? nextReps : current.reps,
      currentRepId:
        current.currentRepId &&
        nextReps.some((rep) => rep.id === current.currentRepId)
          ? current.currentRepId
          : authSession.currentUser?.id ?? nextReps[0]?.id ?? current.currentRepId,
    }));
  }

  function applyReturnedCustomers(
    returnedCustomers?: SavedCustomer[],
    savedCustomerId?: string,
  ) {
    if (!returnedCustomers) {
      return null;
    }

    const normalizedReturnedCustomers = normalizeSavedCustomers(returnedCustomers);
    const savedCustomer = savedCustomerId
      ? normalizedReturnedCustomers.find((customer) => customer.id === savedCustomerId)
      : undefined;
    const nextCustomers = savedCustomer
      ? [
          savedCustomer,
          ...normalizedReturnedCustomers.filter(
            (customer) => customer.id !== savedCustomer.id,
          ),
        ]
      : normalizedReturnedCustomers;

    saveCustomers(nextCustomers);

    return nextCustomers;
  }

  function mergeReturnedAdminUsers(returnedUsers?: ManagedUser[]) {
    const normalizedReturnedUsers = normalizeManagedUsers(returnedUsers ?? []);

    if (normalizedReturnedUsers.length === 0) {
      return;
    }

    applyAdminUsers(
      mergeById(adminUsersRef.current, normalizedReturnedUsers),
    );
  }

  function applySettingsMutationReturnedData(
    context: string,
    options?: SettingsMutationRefreshOptions,
    phase: "mutation_response" | "post_bootstrap" = "mutation_response",
  ) {
    if (!options) {
      return;
    }

    let appliedCustomers: SavedCustomer[] | null = null;

    if (options.clearCustomers) {
      saveCustomers([]);
      appliedCustomers = [];
    } else if (options.returnedCustomers) {
      appliedCustomers = applyReturnedCustomers(
        options.returnedCustomers,
        options.savedCustomerId,
      );
    } else if (options.removedCustomerId) {
      const nextCustomers = savedCustomersRef.current.filter(
        (customer) => customer.id !== options.removedCustomerId,
      );
      saveCustomers(nextCustomers);
      appliedCustomers = nextCustomers;
    }

    mergeReturnedAdminUsers(options.returnedUsers);

    if (appliedCustomers) {
      console.info("[Action Desk settings] settingsStateApplied", {
        context,
        phase,
        customersCount: appliedCustomers.length,
        savedCustomerId: options.savedCustomerId,
      });
    }
  }

  function logSettingsDataRefreshed(
    context: string,
    options?: SettingsMutationRefreshOptions,
  ) {
    const assignmentsCount = savedCustomersRef.current.reduce(
      (count, customer) =>
        count +
        (customer.assignedCSRs?.filter((assignment) => assignment.isActive !== false)
          .length ??
          customer.ownerRepIds?.length ??
          (customer.ownerRepId ? 1 : 0)),
      0,
    );

    console.info("[Action Desk settings] settingsDataRefreshed", {
      context,
      customersCount: savedCustomersRef.current.length,
      usersCount: adminUsersRef.current.length,
      assignmentsCount,
      returnedCustomersCount: options?.returnedCustomers?.length ?? 0,
      returnedUsersCount: options?.returnedUsers?.length ?? 0,
    });
  }

  async function refreshAdminUsers() {
    const usersResponse = await loadSharedUsers();
    applyAdminUsers(usersResponse.users);
  }

  function applySharedWorkflowBootstrap(
    bootstrap: SharedWorkflowBootstrap,
    context: string,
  ) {
    setAuthSession((current) => ({
      sessionId: current.sessionId,
      currentUser: bootstrap.currentUser,
      capabilities: bootstrap.capabilities,
    }));
    setWorkflowState({
      ...bootstrap.workflowState,
      reps: normalizeRepProfiles(bootstrap.workflowState.reps, bootstrap.reps),
    });
    saveCustomers(bootstrap.customers);
    setSlaSettings(bootstrap.slaSettings);
    logSharedWorkflowDataDiagnostics({
      context,
      currentUser: bootstrap.currentUser,
      customers: bootstrap.customers,
      reps: bootstrap.workflowState.reps,
      source: "backend_api",
    });
  }

  async function reloadSharedWorkflowBootstrapAfterMutation(
    context: string,
    options?: SettingsMutationRefreshOptions,
  ) {
    applySettingsMutationReturnedData(context, options, "mutation_response");

    const bootstrap = await loadSharedWorkflowBootstrap();
    validateSharedWorkflowBootstrap(context, bootstrap);
    applySharedWorkflowBootstrap(bootstrap, context);

    if (
      bootstrap.currentUser?.role === "admin" ||
      bootstrap.capabilities.includes("manage_users")
    ) {
      await refreshAdminUsers();
    } else {
      setAdminUsers([]);
    }

    applySettingsMutationReturnedData(context, options, "post_bootstrap");
    logSettingsDataRefreshed(context, options);
  }

  function applyWorkflowState(nextState: WorkflowState) {
    setWorkflowState(nextState);
  }

  function applyWorkflowThreadBindings(
    items: ProcessedEmail[],
    bindings: Record<string, string>,
  ): ProcessedEmail[] {
    return items.map((item) => {
      const workflowThreadId = bindings[item.email.id];

      if (!workflowThreadId || item.email.workflowThreadId === workflowThreadId) {
        return item;
      }

      return {
        ...item,
        email: {
          ...item.email,
          workflowThreadId,
        },
      };
    });
  }

  function resetFeedbackWithDelay(
    setFeedback: React.Dispatch<
      React.SetStateAction<"idle" | "success" | "error">
    >,
    timeoutRef: React.MutableRefObject<number | null>,
    nextState: "success" | "error",
  ) {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    setFeedback(nextState);
    timeoutRef.current = window.setTimeout(() => {
      setFeedback("idle");
      timeoutRef.current = null;
    }, 2500);
  }

  function showTemporaryProcessingStatus(message: string) {
    if (processingStatusTimeoutRef.current !== null) {
      window.clearTimeout(processingStatusTimeoutRef.current);
    }

    setProcessingStatus(message);
    processingStatusTimeoutRef.current = window.setTimeout(() => {
      setProcessingStatus(null);
      processingStatusTimeoutRef.current = null;
    }, 2500);
  }

  function resetDetailFeedback() {
    setCopyFeedback("idle");
    setCaseCopyFeedback("idle");
    setRawCaseCopyFeedback("idle");
    setOutlookDraftCreationStatus("idle");
    setReplyActionError(null);
  }

  function openThreadDetail(emailId: string) {
    setSelectedEmailId(emailId);
    setShowDetailView(true);
    resetDetailFeedback();
  }

  function showSyncBanner(status: "ok" | "error", message: string) {
    if (syncMessageTimeoutRef.current !== null) {
      window.clearTimeout(syncMessageTimeoutRef.current);
    }

    setSyncStatus(status);
    setSyncMessage(message);
    syncMessageTimeoutRef.current = window.setTimeout(() => {
      setSyncStatus("idle");
      setSyncMessage(null);
      syncMessageTimeoutRef.current = null;
    }, status === "error" ? 6000 : 3000);
  }

  function markSyncSuccess(message?: string) {
    const timestamp = new Date().toISOString();
    setLastSuccessfulSyncAt(timestamp);
    setBackupError(null);
    setSharedHealth((current) =>
      current
        ? {
            ...current,
            ok: true,
            databaseReady: true,
            serverTime: timestamp,
          }
        : current,
    );

    if (message) {
      showSyncBanner("ok", message);
    }
  }

  function markSyncFailure(error: unknown, fallbackMessage: string) {
    const message = getSharedWorkflowErrorMessage(error, fallbackMessage);
    setSharedHealth((current) =>
      current
        ? {
            ...current,
            ok: false,
          }
        : current,
    );
    showSyncBanner("error", message);
    return message;
  }

  async function refreshSharedHealth(options?: { silent?: boolean }) {
    try {
      const nextHealth = await loadSharedWorkflowHealth();
      setSharedHealth(nextHealth);

      if (!options?.silent) {
        markSyncSuccess("Shared workflow connection is healthy.");
      }
    } catch (error) {
      markSyncFailure(error, "The shared workflow service is unavailable right now.");
    }
  }

  useEffect(() => {
    savedCustomersRef.current = savedCustomers;
    updateProcessedEmailCache((item) =>
      applyCustomerPriority([item], savedCustomersRef.current)[0],
    );
    setQueueItems((currentItems) => decorateQueueItems(currentItems));
  }, [savedCustomers]);

  useEffect(() => {
    adminUsersRef.current = adminUsers;
  }, [adminUsers]);

  useEffect(() => {
    workflowStateRef.current = workflowState;
  }, [workflowState]);

  useEffect(() => {
    return () => {
      if (syncMessageTimeoutRef.current !== null) {
        window.clearTimeout(syncMessageTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function handleResize() {
      setViewportWidth(window.innerWidth);
    }

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function syncThreadBindings() {
      if (!authSession.currentUser || queueItems.length === 0) {
        return;
      }

      const itemsNeedingBindings = queueItems.filter(
        (item) => !item.email.workflowThreadId,
      );

      if (itemsNeedingBindings.length === 0) {
        return;
      }

      try {
        const bindings = await syncSharedThreadBindings(queueItems);

        if (cancelled) {
          return;
        }

        const boundThreadIds = Array.from(
          new Set(Object.values(bindings).filter(Boolean)),
        );
        const missingBindingCount = itemsNeedingBindings.filter(
          (item) => !bindings[item.email.id],
        ).length;
        console.info("[Action Desk diagnostics] workflow thread bindings", {
          totalEmailsProcessed: queueItems.length,
          threadCreated: boundThreadIds.length,
          threadSkipped: missingBindingCount,
          skipReason: missingBindingCount > 0 ? "missingBindingResponse" : undefined,
          persistedThreadCount: getThreadRecordCount(workflowStateRef.current),
          boundEmailCount: Object.keys(bindings).length,
          unboundEmailCount: itemsNeedingBindings.length,
        });

        setQueueItems((currentItems) =>
          applyWorkflowThreadBindings(currentItems, bindings),
        );
      } catch (error) {
        console.warn("[Action Desk diagnostics] workflow thread bindings", {
          threadCreated: false,
          threadSkipped: true,
          skipReason: "threadBindingSyncFailed",
          errorName: getSafeErrorName(error),
          persistedThreadCount: getThreadRecordCount(workflowStateRef.current),
        });
        // Keep the queue usable even if the shared thread binding sync is unavailable.
      }
    }

    void syncThreadBindings();

    return () => {
      cancelled = true;
    };
  }, [authSession.currentUser, queueItems]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapSharedWorkflow() {
      setAuthLoading(true);

      try {
        const session = await loadAuthSession();

        if (cancelled) {
          return;
        }

        setAuthSession({
          sessionId: session.sessionId,
          currentUser: session.currentUser,
          capabilities: session.capabilities,
        });
        if ("authMessage" in session && session.authMessage && !session.currentUser) {
          setLoadError(session.authMessage);
        }
        void refreshSharedHealth({ silent: true });

        if (!session.currentUser) {
          logSessionCleanup({
            context: "initial_auth_session",
            reason: "missingCurrentUser",
            message: session.authMessage,
          });
          setWorkflowState((current) => ({
            ...current,
            reps:
              normalizeRepProfiles(session.reps).length > 0
                ? normalizeRepProfiles(session.reps)
                : getDefaultRepProfiles(),
            currentRepId: "",
          }));
          setSavedCustomers([]);
          setSlaSettings(getDefaultSlaSettings());
          setAdminUsers([]);
          logSharedWorkflowDataDiagnostics({
            context: "signed_out_bootstrap",
            currentUser: null,
            customers: [],
            reps: session.reps,
            source: "signed_out",
          });
          return;
        }

        const bootstrap = await loadSharedWorkflowBootstrap();
        validateSharedWorkflowBootstrap("initial_bootstrap", bootstrap);

        if (cancelled) {
          return;
        }

        setAuthSession({
          sessionId: session.sessionId,
          currentUser: bootstrap.currentUser,
          capabilities: bootstrap.capabilities,
        });
        setWorkflowState({
          ...bootstrap.workflowState,
          reps: normalizeRepProfiles(bootstrap.workflowState.reps, bootstrap.reps),
        });
        saveCustomers(bootstrap.customers);
        setSlaSettings(bootstrap.slaSettings);
        logSharedWorkflowDataDiagnostics({
          context: "initial_bootstrap",
          currentUser: bootstrap.currentUser,
          customers: bootstrap.customers,
          reps: bootstrap.workflowState.reps,
          source: "backend_api",
        });
        if (
          bootstrap.currentUser?.role !== "admin" &&
          !bootstrap.capabilities.includes("manage_users")
        ) {
          setAdminUsers([]);
        } else {
          try {
            if (!cancelled) {
              await refreshAdminUsers();
            }
          } catch {
            if (!cancelled) {
              setAdminUsers([]);
            }
          }
        }
        void refreshSharedHealth({ silent: true });
      } catch (error) {
        if (!cancelled) {
          console.warn("[Action Desk session] bootstrap failed", {
            context: "initial_bootstrap",
            reason: getBootstrapExceptionReason(error),
            errorName: getSafeErrorName(error),
          });
          setLoadError(
            getSharedWorkflowErrorMessage(
              error,
              "The shared workflow could not be loaded right now.",
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    }

    void bootstrapSharedWorkflow();

    return () => {
      cancelled = true;
    };
  }, []);

  const currentRep = authSession.currentUser;
  const showDebugUi = getEnv("VITE_SHOW_DEBUG_UI") === "true";
  const demoDataEnabled = getEnv("ACTION_DESK_ENABLE_DEMO_DATA") === "true";
  const canManageUsers =
    authSession.currentUser?.role === "admin" ||
    authSession.capabilities.includes("manage_users");
  const diagnosticsProps = currentRep?.role === "admin"
    ? {
        apiAvailable: sharedHealth?.ok ?? false,
        databaseReady: sharedHealth?.databaseReady,
        currentUserLabel: sharedHealth?.currentUser
          ? `${sharedHealth.currentUser.name} (${sharedHealth.currentUser.role === "admin" ? "Admin" : sharedHealth.currentUser.role === "supervisor" ? "Supervisor" : "Rep"})`
          : undefined,
        lastSyncAt: lastSuccessfulSyncAt,
        lastBackupPath,
        databasePath: sharedHealth?.databasePath ?? desktopRuntimeInfo?.userDataPath ?? null,
        logFilePath: desktopRuntimeInfo?.logFilePath ?? null,
        backupLoading,
        backupError,
        canCreateBackup:
          authSession.capabilities.includes("create_backup"),
        onRefreshHealth: () => {
          void refreshSharedHealth();
        },
        onCreateBackup:
          authSession.capabilities.includes("create_backup")
            ? () => {
                void handleCreateBackup();
              }
            : undefined,
      }
    : undefined;

  useEffect(() => {
    if (!currentRep) {
      return;
    }

    void refreshSharedHealth({ silent: true });
    const intervalId = window.setInterval(() => {
      void refreshSharedHealth({ silent: true });
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentRep]);

  useEffect(() => {
    if (!currentRep) {
      return;
    }

    void refreshThreadPresence({ silent: true });
    const intervalId = window.setInterval(() => {
      void refreshThreadPresence({ silent: true });
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentRep]);

  async function handleSharedSignIn() {
    try {
      const session = await signInSharedWorkflow();
      const bootstrap = await loadSharedWorkflowBootstrap();
      validateSharedWorkflowBootstrap("sign_in_bootstrap", bootstrap);

      setAuthSession({
        sessionId: session.sessionId,
        currentUser: bootstrap.currentUser,
        capabilities: bootstrap.capabilities,
      });
      setWorkflowState({
        ...bootstrap.workflowState,
        reps: normalizeRepProfiles(bootstrap.workflowState.reps, bootstrap.reps),
      });
      saveCustomers(bootstrap.customers);
      setSlaSettings(bootstrap.slaSettings);
      logSharedWorkflowDataDiagnostics({
        context: "sign_in_bootstrap",
        currentUser: bootstrap.currentUser,
        customers: bootstrap.customers,
        reps: bootstrap.workflowState.reps,
        source: "backend_api",
      });
      if (
        bootstrap.currentUser?.role !== "admin" &&
        !bootstrap.capabilities.includes("manage_users")
      ) {
        setAdminUsers([]);
      } else {
        try {
          await refreshAdminUsers();
        } catch {
          setAdminUsers([]);
        }
      }
      markSyncSuccess("Signed in to the shared workflow.");
      void refreshSharedHealth({ silent: true });
    } catch (error) {
      console.warn("[Action Desk session] bootstrap failed", {
        context: "sign_in_bootstrap",
        reason: getBootstrapExceptionReason(error),
        errorName: getSafeErrorName(error),
      });
      markSyncFailure(error, "Sign-in failed. Please try again.");
      throw error;
    }
  }

  async function handleSharedSignOut() {
    try {
      logSessionCleanup({
        context: "handleSharedSignOut",
        reason: "userRequestedSignOut",
      });
      await clearCurrentUserPresence();
      await signOutSharedWorkflow();
      const session = await loadAuthSession();

      setAuthSession({
        sessionId: session.sessionId,
        currentUser: null,
        capabilities: [],
      });
      setWorkflowState((current) => ({
        ...current,
        reps:
          normalizeRepProfiles(session.reps).length > 0
            ? normalizeRepProfiles(session.reps)
            : getDefaultRepProfiles(),
        currentRepId: "",
        threadStates: {},
        threadPresence: {},
      }));
      setSavedCustomers([]);
      setSlaSettings(getDefaultSlaSettings());
      setAdminUsers([]);
      inboxActionInFlightRef.current = null;
      setIsRefreshingInbox(false);
      setQueueItems([]);
      setSelectedEmailId(undefined);
      setShowSettingsPanel(false);
      setSharedHealth(null);
      markSyncSuccess("Signed out of the shared workflow.");
    } catch (error) {
      markSyncFailure(error, "Sign-out failed. Please try again.");
    }
  }

  async function resetToSignedOutState(message?: string) {
    logSessionCleanup({
      context: "resetToSignedOutState",
      reason: "bootstrapException",
      message,
    });
    clearStoredSharedWorkflowSession();
    const session = await loadAuthSession().catch(() => ({
      sessionId: "",
      currentUser: null,
      capabilities: [],
      reps: getDefaultRepProfiles(),
    }));

    setAuthSession({
      sessionId: session.sessionId,
      currentUser: null,
      capabilities: [],
    });
    setWorkflowState((current) => ({
      ...current,
      reps:
        normalizeRepProfiles(session.reps).length > 0
          ? normalizeRepProfiles(session.reps)
          : getDefaultRepProfiles(),
      currentRepId: "",
      threadStates: {},
      threadPresence: {},
    }));
    setSavedCustomers([]);
    setSlaSettings(getDefaultSlaSettings());
    setAdminUsers([]);
    inboxActionInFlightRef.current = null;
    setIsRefreshingInbox(false);
    setQueueItems([]);
    setSelectedEmailId(undefined);
    setShowSettingsPanel(false);
    setShowDetailView(false);
    setSharedHealth(null);
    setHasAttemptedInboxLoad(false);
    if (message) {
      setLoadError(message);
      setInboxLoadError(message);
      showSyncBanner("error", message);
    } else {
      setLoadError(null);
      setInboxLoadError(null);
    }
  }

  useEffect(() => {
    const handleSharedSessionExpired = (event: Event) => {
      const detail =
        event instanceof CustomEvent && event.detail && typeof event.detail === "object"
          ? (event.detail as { message?: unknown })
          : undefined;
      const message =
        typeof detail?.message === "string" && detail.message.trim().length > 0
          ? detail.message
          : getExpiredMicrosoftSessionMessage();

      void resetToSignedOutState(message);
    };

    window.addEventListener(
      getSharedSessionExpiredEventName(),
      handleSharedSessionExpired,
    );

    return () => {
      window.removeEventListener(
        getSharedSessionExpiredEventName(),
        handleSharedSessionExpired,
      );
    };
  }, []);

  async function persistWorkflowPreferencesOptimistically(
    nextState: WorkflowState,
    successMessage: string,
    failureMessage: string,
  ) {
    const previousState = workflowStateRef.current;
    applyWorkflowState(nextState);

    try {
      const preferences = await saveSharedWorkflowPreferences(nextState.preferences);
      applyWorkflowState({ ...nextState, preferences });
      markSyncSuccess(successMessage);
      return true;
    } catch (error) {
      applyWorkflowState(previousState);
      markSyncFailure(error, failureMessage);
      return false;
    }
  }

  async function persistThreadStateOptimistically(
    threadId: string,
    nextState: WorkflowState,
    successMessage: string,
    failureMessage: string,
  ) {
    const previousState = workflowStateRef.current;
    applyWorkflowState(nextState);

    try {
      const threadLocationId = buildWorkflowThreads({
        items: queueItems,
        workflowState: nextState,
        customers: savedCustomersRef.current,
        slaSettings,
        now,
      }).find((thread) => thread.id === threadId)?.locationId;
      const nextThreadState = {
        ...nextState.threadStates[threadId],
        locationId:
          nextState.threadStates[threadId]?.locationId ??
          threadLocationId ??
          currentRep?.locationId,
      };
      const threadState = await saveSharedThreadState(
        threadId,
        nextThreadState,
      );
      applyWorkflowState({
        ...nextState,
        threadStates: {
          ...nextState.threadStates,
          [threadId]: threadState,
        },
      });
      markSyncSuccess(successMessage);
      return true;
    } catch (error) {
      applyWorkflowState(previousState);
      markSyncFailure(error, failureMessage);
      return false;
    }
  }

  async function refreshThreadPresence(options?: { silent?: boolean }) {
    if (!authSession.currentUser) {
      return;
    }

    try {
      const threadPresence = await loadSharedThreadPresence();
      applyWorkflowState(
        setWorkflowThreadPresence(workflowStateRef.current, threadPresence),
      );
    } catch (error) {
      if (!options?.silent) {
        markSyncFailure(error, "Thread presence could not be refreshed right now.");
      }
    }
  }

  async function updateThreadPresence(
    threadId: string,
    presenceType: "viewing" | "working",
  ) {
    if (!currentRep) {
      return;
    }

    const nextState = recordThreadPresence(
      workflowStateRef.current,
      threadId,
      currentRep,
      presenceType,
    );
    applyWorkflowState(nextState);

    try {
      const threadPresence = await upsertSharedThreadPresence(threadId, presenceType);
      applyWorkflowState(
        setWorkflowThreadPresence(workflowStateRef.current, threadPresence),
      );
    } catch {
      // Presence is advisory; keep the workflow usable if the heartbeat misses.
    }
  }

  async function clearCurrentUserPresence(threadId?: string) {
    if (!currentRep) {
      return;
    }

    applyWorkflowState(
      clearWorkflowThreadPresence(workflowStateRef.current, currentRep.id, threadId),
    );

    try {
      const threadPresence = await clearSharedThreadPresence(threadId);
      applyWorkflowState(
        setWorkflowThreadPresence(workflowStateRef.current, threadPresence),
      );
    } catch {
      // Timeout expiry handles stale presence if clearing fails.
    }
  }

  function showPresenceConflictWarning(threadId: string) {
    if (!currentRep) {
      return;
    }

    const activePresence = getActiveThreadPresence(
      workflowStateRef.current.threadPresence[threadId],
      { currentUserId: currentRep.id },
    );
    const warning = getPresenceConflictWarning(activePresence);

    if (warning) {
      setReplyActionError(warning);
      showSyncBanner("error", warning);
    }
  }

  async function handleCreateBackup() {
    if (!currentRep || !authSession.capabilities.includes("create_backup")) {
      return;
    }

    setBackupLoading(true);
    setBackupError(null);

    try {
      const response = await createSharedWorkflowBackup();
      setLastBackupPath(response.backupPath);
      markSyncSuccess("Backup created successfully.");
      void refreshSharedHealth({ silent: true });
    } catch (error) {
      const message = markSyncFailure(
        error,
        "The shared workflow backup could not be created right now.",
      );
      setBackupError(message);
    } finally {
      setBackupLoading(false);
    }
  }

  async function handleCreateTestQueueData() {
    if (currentRep?.role !== "admin") {
      return;
    }

    setTestQueueDataLoading(true);

    try {
      const response = await createSharedTestQueueData();
      markSyncSuccess(`${response.createdCount} test queue emails were created.`);
      handleRefreshInbox();
    } catch (error) {
      markSyncFailure(error, "Test queue data could not be created right now.");
    } finally {
      setTestQueueDataLoading(false);
    }
  }

  async function handleRemoveTestQueueData() {
    if (currentRep?.role !== "admin") {
      return;
    }

    setTestQueueDataLoading(true);

    try {
      const response = await removeSharedTestQueueData();
      setQueueItems((currentItems) =>
        currentItems.filter((item) => item.email.provider !== "test_data"),
      );
      markSyncSuccess(`${response.removedCount} test queue emails were removed.`);
    } catch (error) {
      markSyncFailure(error, "Test queue data could not be removed right now.");
    } finally {
      setTestQueueDataLoading(false);
    }
  }

  async function handleCreateUserAccess(draft: ManagedUserDraft) {
    try {
      const response = await createSharedUser(draft);
      await reloadSharedWorkflowBootstrapAfterMutation("create_user_access", {
        returnedUsers: response.users,
      });
      markSyncSuccess("User access was added.");
    } catch (error) {
      markSyncFailure(error, "The user could not be added right now.");
    }
  }

  async function handleUpdateUserAccess(payload: {
    userId: string;
    displayName?: string;
    initials?: string;
    role?: "rep" | "supervisor" | "admin";
    locationId?: string;
    isActive?: boolean;
  }) {
    try {
      const response = await updateSharedUserAccess(payload);
      await reloadSharedWorkflowBootstrapAfterMutation("update_user_access", {
        returnedUsers: response.users,
      });
      markSyncSuccess("User access was updated.");
    } catch (error) {
      markSyncFailure(error, "User access could not be updated right now.");
    }
  }

  async function handleDeactivateUserAccess(userId: string) {
    try {
      const response = await deactivateSharedUser(userId);
      await reloadSharedWorkflowBootstrapAfterMutation("deactivate_user_access", {
        returnedUsers: response.users,
      });
      markSyncSuccess("User access was updated.");
    } catch (error) {
      markSyncFailure(error, "User access could not be updated right now.");
    }
  }

  async function processInboxEmailBatch(
    inboxEmails: EmailItem[],
    options?: { append?: boolean; statusPrefix?: string },
  ) {
    if (inboxEmails.length === 0) {
      return { processedCount: 0, failedCount: 0 };
    }

    let settledCount = 0;
    let cachedProcessedCount = 0;
    const processedIds = new Set<string>();
    const uncachedEmails: EmailItem[] = [];
    const queuedProcessedItems: ProcessedEmail[] = [];
    let queuedProcessingStatus: string | undefined;
    let queueFlushTimerId: number | null = null;

    function clearQueueFlushTimer() {
      if (queueFlushTimerId === null) {
        return;
      }

      window.clearTimeout(queueFlushTimerId);
      queueFlushTimerId = null;
    }

    function flushQueuedProcessedItems() {
      clearQueueFlushTimer();

      const itemsToFlush = queuedProcessedItems.splice(
        0,
        queuedProcessedItems.length,
      );
      const processingStatusToApply = queuedProcessingStatus;
      queuedProcessingStatus = undefined;

      if (!isMountedRef.current) {
        return;
      }

      if (itemsToFlush.length > 0) {
        const flushedItemIds = new Set(
          itemsToFlush.map((item) => item.email.id),
        );

        setQueueItems((currentItems) => {
          const withoutDuplicates = currentItems.filter(
            (item) => !flushedItemIds.has(item.email.id),
          );

          return decorateQueueItems([...withoutDuplicates, ...itemsToFlush]);
        });

        if (!options?.append) {
          const firstFlushedItemId = itemsToFlush[0]?.email.id;

          if (firstFlushedItemId) {
            setSelectedEmailId(
              (currentSelectedEmailId) =>
                currentSelectedEmailId ?? firstFlushedItemId,
            );
          }
        }
      }

      if (processingStatusToApply) {
        setProcessingStatus(processingStatusToApply);
      }
    }

    function queueProcessedItemForFlush(item: ProcessedEmail) {
      queuedProcessedItems.push(item);
      queuedProcessingStatus =
        `${options?.statusPrefix ?? "Processing inbox emails"}: ${settledCount} of ${inboxEmails.length} completed.`;

      if (queuedProcessedItems.length >= QUEUE_PROCESSING_FLUSH_BATCH_SIZE) {
        flushQueuedProcessedItems();
        return;
      }

      if (queueFlushTimerId === null) {
        queueFlushTimerId = window.setTimeout(() => {
          queueFlushTimerId = null;
          flushQueuedProcessedItems();
        }, QUEUE_PROCESSING_FLUSH_INTERVAL_MS);
      }
    }

    for (const inboxEmail of inboxEmails) {
      const cachedItem = getCachedProcessedEmail(inboxEmail.id);

      if (!cachedItem) {
        uncachedEmails.push(inboxEmail);
        continue;
      }

      const prioritizedCachedItem = decorateQueueItems([cachedItem])[0];

      if (
        !isMountedRef.current ||
        processedIds.has(prioritizedCachedItem.email.id)
      ) {
        continue;
      }

      settledCount += 1;
      cachedProcessedCount += 1;
      processedIds.add(prioritizedCachedItem.email.id);
      queueProcessedItemForFlush(prioritizedCachedItem);
    }

    if (uncachedEmails.length === 0) {
      flushQueuedProcessedItems();

      return {
        processedCount: cachedProcessedCount,
        failedCount: 0,
      };
    }

    const result = await (async () => {
      try {
        return await processEmailsProgressively(uncachedEmails, {
          customers: savedCustomersRef.current,
          onItemProcessed: (processedItem) => {
            if (
              !isMountedRef.current ||
              processedIds.has(processedItem.email.id)
            ) {
              return;
            }

            settledCount += 1;
            processedIds.add(processedItem.email.id);
            const prioritizedProcessedItem =
              decorateQueueItems([processedItem])[0];

            if (prioritizedProcessedItem.status === "processed") {
              setCachedProcessedEmail(prioritizedProcessedItem);
            }
            queueProcessedItemForFlush(prioritizedProcessedItem);
          },
        });
      } finally {
        flushQueuedProcessedItems();
      }
    })();

    return {
      processedCount: cachedProcessedCount + result.processedCount,
      failedCount: result.failedCount,
    };
  }

      useEffect(() => {
      if (!hasAttemptedInboxLoad) {
        isMountedRef.current = true;

        return () => {
          isMountedRef.current = false;
        };
      }

      isMountedRef.current = true;
      let isMounted = true;
      const reloadReason = inboxReloadReasonRef.current;
      const shouldPreserveQueueDuringLoad =
        reloadReason === "manual_refresh";
      inboxReloadReasonRef.current = "initial";

      async function loadQueue() {
        const shouldUseInteractiveAuth =
          nextInboxLoadInteractiveRef.current ||
          Boolean(window.actionDeskDesktop?.isElectron);

        nextInboxLoadInteractiveRef.current = false;

        setLoading(true);
        setIsLoadingInbox(true);
        setIsRefreshingInbox(shouldPreserveQueueDuringLoad);
        setLoadError(null);
        setInboxLoadError(null);
        setLoadMoreError(null);
        if (!shouldPreserveQueueDuringLoad) {
          setNextCursor(undefined);
        }
        setProcessingStatus(
          shouldPreserveQueueDuringLoad
            ? "Refreshing inbox emails."
            : "Loading inbox emails.",
        );
        if (!shouldPreserveQueueDuringLoad) {
          setQueueItems([]);
          setSelectedEmailId(undefined);
        }

        try {
          if (persistedQueueEnabled) {
            const loadResult = await runPersistedInitialLoad({
              service: getQueueApplicationService(),
              interactiveAuth: shouldUseInteractiveAuth,
              setQueueItems: (items) => setQueueItems(decorateQueueItems(items)),
              setNextCursor,
              setLastLoadedAt,
              setSelectedEmailId,
              setProcessingStatus,
              setIsLoadingInbox,
              setLoading,
              isMounted,
              useHeadStart: !shouldPreserveQueueDuringLoad,
              selectFirstItem: !shouldPreserveQueueDuringLoad,
            });

            if (!loadResult) {
              return;
            }

            return;
          }

          const inboxResult = await loadInboxQueue({
            interactiveAuth: shouldUseInteractiveAuth,
          });

          if (!isMounted) {
            return;
          }

          const inboxEmails = Array.isArray((inboxResult as any)?.items)
            ? (inboxResult as any).items
            : Array.isArray(inboxResult)
              ? inboxResult
              : [];

          setLastLoadedAt(
            new Date().toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            }),
          );
          setNextCursor((inboxResult as any)?.nextCursor);
          setIsLoadingInbox(false);

          if (inboxEmails.length === 0) {
            setProcessingStatus(null);
            return;
          }

          setProcessingStatus("Processing inbox emails and preparing triage.");

          const { processedCount, failedCount } = await processInboxEmailBatch(
            inboxEmails,
          );

          if (!isMounted) {
            return;
          }

          if (failedCount > 0) {
            setProcessingStatus(
              `Processed ${processedCount} of ${inboxEmails.length} emails. ${failedCount} could not be analyzed.`,
            );
          } else {
            setProcessingStatus(null);
          }
        } catch (error) {
          if (isMounted) {
            if (isStaleSharedWorkflowSessionError(error)) {
              await resetToSignedOutState(
                "Your Microsoft session expired. Please sign in again.",
              );
              setProcessingStatus(null);
              setIsLoadingInbox(false);
              return;
            }

            console.error("Load queue error:", error);
            if (!shouldPreserveQueueDuringLoad) {
              setQueueItems([]);
              setSelectedEmailId(undefined);
            }
            setInboxLoadError(
              getErrorMessage(
                error,
                "We couldn't load the inbox right now. Please try again.",
              ),
            );
            setProcessingStatus(null);
            setIsLoadingInbox(false);
          }
        } finally {
          if (isMounted) {
            setLoading(false);
            setIsRefreshingInbox(false);
            if (inboxActionInFlightRef.current === "refresh") {
              inboxActionInFlightRef.current = null;
            }
          }
        }
      }

      void loadQueue();

      return () => {
        isMounted = false;
        isMountedRef.current = false;
      };
    }, [reloadToken, persistedQueueEnabled, hasAttemptedInboxLoad]); useEffect(() => {
      let cancelled = false;

      async function loadDesktopRuntimeInfo() {
        if (!window.actionDeskDesktop?.getDesktopRuntimeInfo) {
          return;
        }

        try {
          const info = await window.actionDeskDesktop.getDesktopRuntimeInfo();

          if (!cancelled) {
            setDesktopRuntimeInfo(info);
            setBackendApiOrigin(info.actionDeskApiUrl ?? undefined);
            setSharedApiOrigin(info.apiOrigin ?? undefined);
          }
        } catch (error) {
          console.warn("Desktop runtime info unavailable:", error);
        }
      }

      void loadDesktopRuntimeInfo();

      return () => {
        cancelled = true;
      };
    }, []);

    useEffect(() => {
      const copyFeedbackTimeout = copyFeedbackTimeoutRef.current;
      const caseCopyFeedbackTimeout = caseCopyFeedbackTimeoutRef.current;
      const rawCaseCopyFeedbackTimeout = rawCaseCopyFeedbackTimeoutRef.current;
      const processingStatusTimeout = processingStatusTimeoutRef.current;

      return () => {
        if (copyFeedbackTimeout !== null) {
          window.clearTimeout(copyFeedbackTimeout);
        }

        if (caseCopyFeedbackTimeout !== null) {
          window.clearTimeout(caseCopyFeedbackTimeout);
        }

        if (rawCaseCopyFeedbackTimeout !== null) {
          window.clearTimeout(rawCaseCopyFeedbackTimeout);
        }

        if (processingStatusTimeout !== null) {
          window.clearTimeout(processingStatusTimeout);
        }
      };
    }, []);

    useEffect(() => {
      const intervalId = window.setInterval(() => {
        setNow(new Date());
      }, 60_000);

      return () => {
        window.clearInterval(intervalId);
      };
    }, []);

    useEffect(() => {
      if (!pilotMode) {
        return;
      }

      savePilotQueueStateMap(pilotItemStates);
    }, [pilotItemStates, pilotMode]);

    function updatePilotQueueState(
      updater: (current: PilotQueueStateMap) => PilotQueueStateMap,
    ) {
      if (!pilotMode) {
        return;
      }

      setPilotItemStates((current) => updater(current));
    }

    function handleSetPilotWorkflowStatus(
      emailId: string,
      workflowStatus: PilotQueueItemState["workflowStatus"],
    ) {
      updatePilotQueueState((current) =>
        setPilotWorkflowStatus(current, emailId, workflowStatus),
      );
    }

    function handleSnoozeUntilTomorrow(emailId: string) {
      updatePilotQueueState((current) =>
        snoozePilotQueueItemUntilTomorrow(current, emailId),
      );
    }

    function handleSetPilotUsefulness(
      emailId: string,
      usefulness: PilotUsefulnessFeedback,
    ) {
      updatePilotQueueState((current) =>
        setPilotUsefulnessFeedback(current, emailId, usefulness),
      );
    }

    async function handleCopyReply(): Promise<boolean> {
      if (!selectedItem || selectedItem.status !== "processed" || !hasReplyDraft) {
        return false;
      }

      setReplyActionError(null);

      if (!navigator.clipboard?.writeText) {
        resetFeedbackWithDelay(setCopyFeedback, copyFeedbackTimeoutRef, "error");
        return false;
      }

      try {
        await navigator.clipboard.writeText(selectedReplyDraft);
        resetFeedbackWithDelay(
          setCopyFeedback,
          copyFeedbackTimeoutRef,
          "success",
        );
        return true;
      } catch {
        resetFeedbackWithDelay(setCopyFeedback, copyFeedbackTimeoutRef, "error");
        return false;
      }
    }

    async function handleCreateOutlookDraft() {
      if (
        !selectedItem ||
        selectedItem.status !== "processed" ||
        !hasReplyDraft ||
        !selectedOutlookDraftMessageId
      ) {
        setReplyActionError(
          "A live Outlook message and reply draft are required before Action Desk can create an Outlook draft.",
        );
        return;
      }

      if (outlookDraftCreationStatus === "creating") {
        return;
      }

      setReplyActionError(null);
      setOutlookDraftCreationStatus("creating");

      try {
        const draft = await createOutlookReplyDraft({
          messageId: selectedOutlookDraftMessageId,
          replyText: selectedReplyDraft,
        });

        setOutlookDraftCreationStatus("success");
        showTemporaryProcessingStatus("Outlook reply draft created.");

        if (draft.webLink) {
          window.open(draft.webLink, "_blank", "noopener,noreferrer");
        }
      } catch (error) {
        setOutlookDraftCreationStatus("error");
        setReplyActionError(
          `${getSharedWorkflowErrorMessage(
            error,
            "Outlook reply draft could not be created.",
          )} Your Action Desk reply is still below. Use Copy & Open Outlook instead.`,
        );
      }
    }

    async function handleCopyCaseForReview() {
      if (!selectedItem) {
        return;
      }

      if (!navigator.clipboard?.writeText) {
        resetFeedbackWithDelay(
          setCaseCopyFeedback,
          caseCopyFeedbackTimeoutRef,
          "error",
        );
        return;
      }

      try {
        await navigator.clipboard.writeText(
          formatCaseForReview({
            item: selectedItem,
            pilotItemState: selectedPilotState,
            orderDataMessage: pilotMode ? PILOT_ORDER_DATA_MESSAGE : undefined,
          }),
        );
        resetFeedbackWithDelay(
          setCaseCopyFeedback,
          caseCopyFeedbackTimeoutRef,
          "success",
        );
      } catch {
        resetFeedbackWithDelay(
          setCaseCopyFeedback,
          caseCopyFeedbackTimeoutRef,
          "error",
        );
      }
    }

    async function handleCopyRawCaseJson() {
      if (!selectedItem) {
        return;
      }

      if (!navigator.clipboard?.writeText) {
        resetFeedbackWithDelay(
          setRawCaseCopyFeedback,
          rawCaseCopyFeedbackTimeoutRef,
          "error",
        );
        return;
      }

      try {
        await navigator.clipboard.writeText(
          formatRawCaseJson({
            item: selectedItem,
            pilotItemState: selectedPilotState,
            orderDataMessage: pilotMode ? PILOT_ORDER_DATA_MESSAGE : undefined,
          }),
        );
        resetFeedbackWithDelay(
          setRawCaseCopyFeedback,
          rawCaseCopyFeedbackTimeoutRef,
          "success",
        );
      } catch {
        resetFeedbackWithDelay(
          setRawCaseCopyFeedback,
          rawCaseCopyFeedbackTimeoutRef,
          "error",
        );
      }
    }

    async function handleRegenerateReply() {
      const selectedItem = queueItems.find(
        (item) => item.email.id === selectedEmailId,
      );

      if (
        !selectedItem ||
        selectedItem.status !== "processed" ||
        !selectedItem.result
      ) {
        setReplyActionError(
          "Select a processed email before regenerating a reply draft.",
        );
        console.warn("Action Desk reply regeneration skipped", {
          hasSelectedEmailId: Boolean(selectedEmailId),
          selectedItemStatus: selectedItem?.status,
        });
        return;
      }

      if (regeneratingReply) {
        return;
      }

      setRegeneratingReply(true);
      setCopyFeedback("idle");
      setOutlookDraftCreationStatus("idle");
      setReplyActionError(null);

      const generationContext = buildReplyGenerationContext(
        selectedItem,
        selectedThread,
      );
      const logContext = getReplyRegenerationLogContext(
        selectedItem,
        generationContext,
      );

      console.info("Action Desk reply regeneration started", logContext);

      try {
        const nextReplyDraft = generateReply(
          selectedItem.result.analysis,
          selectedItem.result.orderContext,
          {
            allowDeterministicFallback: true,
            context: generationContext,
          },
        );
        const trimmedReplyDraft = nextReplyDraft.trim();

        if (!trimmedReplyDraft) {
          const unavailableReason = getReplyUnavailableReason(
            selectedItem.result.analysis,
          );

          console.warn("Action Desk reply regeneration unavailable", {
            ...logContext,
            unavailableReason,
          });
          setReplyActionError(getReplyUnavailableMessage(unavailableReason));
          return;
        }

        setQueueItems((currentItems) => {
          const nextItems = refreshProcessedEmailReplyDraft(
            currentItems,
            selectedItem.email.id,
            trimmedReplyDraft,
          );
          const prioritizedItems = decorateQueueItems(nextItems);
          const nextSelectedItem = prioritizedItems.find(
            (item) => item.email.id === selectedItem.email.id,
          );

          if (nextSelectedItem?.status === "processed") {
            setCachedProcessedEmail(nextSelectedItem);
          }

          return prioritizedItems;
        });

        console.info("Action Desk reply regeneration completed", {
          ...logContext,
          replyDraftLength: trimmedReplyDraft.length,
        });
      } catch (error) {
        console.error("Action Desk reply regeneration failed", {
          ...logContext,
          errorName: getSafeErrorName(error),
        });
        setReplyActionError(getErrorMessage(
          error,
          "The reply could not be regenerated right now. Please try again.",
        ));
      } finally {
        setRegeneratingReply(false);
      }
    }

    function handleRefreshInbox() {
      if (
        loading ||
        isLoadingInbox ||
        isLoadingMore ||
        inboxActionInFlightRef.current !== null
      ) {
        return;
      }

      setInboxLoadError(null);
      setLoadError(null);
      setLoadMoreError(null);
      const reloadReason =
        hasAttemptedInboxLoad && queueItems.length > 0
          ? "manual_refresh"
          : "initial";
      setProcessingStatus(
        reloadReason === "manual_refresh"
          ? "Refreshing inbox emails..."
          : "Loading inbox emails...",
      );
      setLoading(true);
      setIsLoadingInbox(true);
      setIsRefreshingInbox(reloadReason === "manual_refresh");

      inboxActionInFlightRef.current = "refresh";
      nextInboxLoadInteractiveRef.current = true;
      inboxReloadReasonRef.current = reloadReason;
      setHasAttemptedInboxLoad(true);
      setReloadToken((current) => current + 1);
    }

    async function handleLoadMore() {
      if (
        !nextCursor ||
        isLoadingMore ||
        isLoadingInbox ||
        loading ||
        inboxActionInFlightRef.current !== null
      ) {
        return;
      }

      inboxActionInFlightRef.current = "load_more";
      setIsLoadingMore(true);
      setLoadMoreError(null);

      try {
        if (persistedQueueEnabled) {
          await runPersistedLoadMore({
            service: getQueueApplicationService(),
            cursor: nextCursor,
            setQueueItems: (items) => setQueueItems(decorateQueueItems(items)),
            setNextCursor,
            setLastLoadedAt,
            setProcessingStatus,
          });
          return;
        }

        const inboxResult = await loadInboxQueue({
          cursor: nextCursor,
          interactiveAuth: true,
        });
        const existingIds = new Set(queueItems.map((item) => item.email.id));
        const seenNewIds = new Set<string>();
        const newInboxEmails = inboxResult.items.filter((email) => {
          if (existingIds.has(email.id) || seenNewIds.has(email.id)) {
            return false;
          }

          seenNewIds.add(email.id);
          return true;
        });

        setNextCursor(inboxResult.nextCursor);
        setLastLoadedAt(
          new Date().toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          }),
        );

        if (newInboxEmails.length === 0) {
          return;
        }

        const { processedCount, failedCount } = await processInboxEmailBatch(
          newInboxEmails,
          {
            append: true,
            statusPrefix: "Processing additional inbox emails",
          },
        );

        if (failedCount > 0) {
          setProcessingStatus(
            `Processed ${processedCount} of ${newInboxEmails.length} additional emails. ${failedCount} could not be analyzed.`,
          );
        } else {
          setProcessingStatus(null);
        }
      } catch (error) {
        if (isStaleSharedWorkflowSessionError(error)) {
          await resetToSignedOutState(
            "Your Microsoft session expired. Please sign in again.",
          );
          return;
        }

        setLoadMoreError(
          getErrorMessage(
            error,
            "We couldn't load more emails right now. Please try again.",
          ),
        );
      } finally {
        setIsLoadingMore(false);
        if (inboxActionInFlightRef.current === "load_more") {
          inboxActionInFlightRef.current = null;
        }
      }
    }

    async function handleRetryEmail(emailId: string) {
      const failedItem = queueItems.find((item) => item.email.id === emailId);

      if (!failedItem || failedItem.status !== "failed" || retryingEmailId) {
        return;
      }

      setRetryingEmailId(emailId);
      setQueueItems((currentItems) =>
        decorateQueueItems(
          replaceProcessedEmail(
            currentItems,
            emailId,
            createPendingProcessedEmail(failedItem.email),
          ),
        ),
      );

      try {
        const nextResult = await runActionDesk(
          buildAnalysisInput(failedItem.email),
          {
            aiInput: {
              subject: failedItem.email.subject,
              from: [failedItem.email.senderName, failedItem.email.senderEmail]
                .filter(Boolean)
                .join(" "),
              body: failedItem.email.body,
            },
          },
        );
        const nextProcessedItem = createProcessedEmail(
          failedItem.email,
          nextResult,
        );
        const prioritizedProcessedItem = decorateQueueItems([nextProcessedItem])[0];
        setCachedProcessedEmail(prioritizedProcessedItem);
        setQueueItems((currentItems) =>
          decorateQueueItems(
            replaceProcessedEmail(
              currentItems,
              emailId,
              prioritizedProcessedItem,
            ),
          ),
        );
      } catch {
        setQueueItems((currentItems) =>
          decorateQueueItems(
            replaceProcessedEmail(
              currentItems,
              emailId,
              createFailedProcessedEmail(
                failedItem.email,
                "This email could not be analyzed. Try retrying it.",
              ),
            ),
          ),
        );
      } finally {
        setRetryingEmailId(null);
      }
    }

    async function handleSaveCustomer(draft: SavedCustomerDraft) {
      if (!currentRep) {
        return;
      }

      try {
        const customers = await upsertSharedCustomer(draft);
        await reloadSharedWorkflowBootstrapAfterMutation("save_customer", {
          returnedCustomers: customers,
          savedCustomerId: findSavedCustomerIdFromDraft(draft, customers),
        });
        markSyncSuccess("Customer ownership was saved.");
      } catch (error) {
        markSyncFailure(error, "Customer settings could not be saved right now.");
      }
    }

    async function handleSaveSlaSettings(nextSlaSettings: SlaSettings) {
      try {
        const saved = await saveSharedSlaSettings(nextSlaSettings);
        setSlaSettings(saved);
        markSyncSuccess("SLA settings were saved.");
      } catch (error) {
        markSyncFailure(error, "SLA settings could not be saved right now.");
      }
    }

    async function handleDeleteCustomer(customerId: string) {
      try {
        const customers = await deleteSharedCustomer(customerId);
        await reloadSharedWorkflowBootstrapAfterMutation("deactivate_customer", {
          returnedCustomers: customers,
          savedCustomerId: customerId,
          removedCustomerId: customerId,
        });
        markSyncSuccess("Customer ownership was updated.");
      } catch (error) {
        markSyncFailure(error, "Customer settings could not be updated right now.");
      }
    }

    async function handleClearAllCustomers() {
      if (savedCustomersRef.current.length === 0) {
        return;
      }

      if (!window.confirm("Clear all saved customers?")) {
        return;
      }

      try {
        const customers = await clearSharedCustomers();
        await reloadSharedWorkflowBootstrapAfterMutation("clear_customers", {
          returnedCustomers: customers,
          clearCustomers: true,
        });
        markSyncSuccess("Customer ownership was cleared.");
      } catch (error) {
        markSyncFailure(error, "Customers could not be cleared right now.");
      }
    }

    async function handleQueueScopeViewChange(nextView: QueueScopeView) {
      const nextState = setQueueScopeView(workflowStateRef.current, nextView);
      await persistWorkflowPreferencesOptimistically(
        nextState,
        "Queue scope was saved.",
        "Queue scope could not be saved right now.",
      );
    }

    async function handleQueueDisplayModeChange(nextMode: "list" | "grouped_by_rep") {
      const nextState = setQueueDisplayMode(workflowStateRef.current, nextMode);
      await persistWorkflowPreferencesOptimistically(
        nextState,
        "Queue view was saved.",
        "Queue view could not be saved right now.",
      );
    }

    async function handleStatusFilterChange(nextFilter: WorkflowStatusFilter) {
      const nextState = setWorkflowStatusFilter(workflowStateRef.current, nextFilter);
      await persistWorkflowPreferencesOptimistically(
        nextState,
        "Status filter was saved.",
        "Status filter could not be saved right now.",
      );
    }

    async function handleShowSnoozedChange(showSnoozed: boolean) {
      const nextState = setShowSnoozed(workflowStateRef.current, showSnoozed);
      await persistWorkflowPreferencesOptimistically(
        nextState,
        "Snooze visibility was saved.",
        "Snooze visibility could not be saved right now.",
      );
    }

    async function handleTakeThread(
      threadId: string,
      reason: AssignmentReason,
    ) {
      if (!currentRep) {
        return;
      }

      showPresenceConflictWarning(threadId);
      void updateThreadPresence(threadId, "working");
      const nextState = takeThreadAssignment(
        workflowStateRef.current,
        threadId,
        currentRep,
        reason,
        currentRep.id,
      );
      await persistThreadStateOptimistically(
        threadId,
        nextState,
        "Manual assignment was saved.",
        "Manual assignment could not be saved right now. Your change was rolled back.",
      );
    }

    async function handleAssignThread(threadId: string, repId: string) {
      if (!currentRep) {
        return;
      }

      const assignee = workflowStateRef.current.reps.find(
        (rep) => rep.id === repId && rep.role === "rep" && rep.isActive !== false,
      );

      if (!assignee) {
        setReplyActionError("That assigned rep is not available.");
        return;
      }

      const thread = workflowThreads.find((candidate) => candidate.id === threadId);
      const reason: AssignmentReason =
        thread?.assignmentResolution.assignmentStatus === "unassigned"
          ? "Unassigned"
          : "Covering for colleague";

      showPresenceConflictWarning(threadId);
      void updateThreadPresence(threadId, "working");
      const nextState = takeThreadAssignment(
        workflowStateRef.current,
        threadId,
        assignee,
        reason,
        currentRep.id,
      );
      await persistThreadStateOptimistically(
        threadId,
        nextState,
        "Manual assignment was saved.",
        "Manual assignment could not be saved right now. Your change was rolled back.",
      );
    }

    async function handleThreadStatusChange(
      threadId: string,
      status: WorkflowStatus,
    ) {
      showPresenceConflictWarning(threadId);
      void updateThreadPresence(threadId, "working");
      const nextState = setThreadWorkflowStatus(
        workflowStateRef.current,
        threadId,
        status,
        currentRep ?? undefined,
      );
      await persistThreadStateOptimistically(
        threadId,
        nextState,
        "Status was saved.",
        "Status could not be saved right now. Your change was rolled back.",
      );
    }

    async function handleAddInternalNote(threadId: string, body: string) {
      if (!currentRep) {
        return;
      }

      showPresenceConflictWarning(threadId);
      void updateThreadPresence(threadId, "working");
      const nextState = addInternalNote(workflowStateRef.current, threadId, currentRep, body);
      await persistThreadStateOptimistically(
        threadId,
        nextState,
        "Internal note was saved.",
        "Internal note could not be saved right now. Your change was rolled back.",
      );
    }

    async function handleLogReply(threadId: string) {
      if (!currentRep) {
        return;
      }

      showPresenceConflictWarning(threadId);
      void updateThreadPresence(threadId, "working");
      const nextState = logReplyForThread(workflowStateRef.current, threadId, currentRep);
      await persistThreadStateOptimistically(
        threadId,
        nextState,
        "Reply log was saved.",
        "Reply log could not be saved right now. Your change was rolled back.",
      );
    }

    async function handleSnoozeThread(
      threadId: string,
      mode: "1h" | "4h" | "tomorrow" | "custom",
      customValue?: string,
    ) {
      if (!currentRep) {
        return;
      }

      showPresenceConflictWarning(threadId);
      void updateThreadPresence(threadId, "working");
      const nextUntil = (() => {
        const base = new Date();

        if (mode === "1h") {
          return new Date(base.getTime() + 60 * 60_000).toISOString();
        }

        if (mode === "4h") {
          return new Date(base.getTime() + 4 * 60 * 60_000).toISOString();
        }

        if (mode === "tomorrow") {
          const tomorrow = new Date(base);
          tomorrow.setDate(base.getDate() + 1);
          tomorrow.setHours(9, 0, 0, 0);
          return tomorrow.toISOString();
        }

        const customDate = customValue ? new Date(customValue) : undefined;

        return customDate && !Number.isNaN(customDate.getTime())
          ? customDate.toISOString()
          : undefined;
      })();

      if (!nextUntil) {
        return;
      }

      const nextState = setThreadSnooze(
        workflowStateRef.current,
        threadId,
        currentRep,
        nextUntil,
      );
      await persistThreadStateOptimistically(
        threadId,
        nextState,
        "Snooze was saved.",
        "Snooze could not be saved right now. Your change was rolled back.",
      );
    }

    async function handleUnsnoozeThread(threadId: string) {
      showPresenceConflictWarning(threadId);
      void updateThreadPresence(threadId, "working");
      const nextState = clearThreadSnooze(
        workflowStateRef.current,
        threadId,
        currentRep ?? undefined,
      );
      await persistThreadStateOptimistically(
        threadId,
        nextState,
        "Snooze was removed.",
        "Snooze removal could not be saved right now. Your change was rolled back.",
      );
    }

    async function handleApplyMacro(threadId: string, macroId: MacroId) {
      if (!currentRep) {
        return;
      }

      const thread = visibleThreads.find((candidate) => candidate.id === threadId);
      const targetItem =
        thread?.items.find((item) => item.email.id === selectedEmailId) ??
        thread?.representativeItem;

      if (!thread || !targetItem) {
        return;
      }

      const result = applyBuiltInMacro(targetItem, macroId);

      if (!result) {
        return;
      }

      setReplyActionError(null);
      showPresenceConflictWarning(threadId);
      void updateThreadPresence(threadId, "working");

      if (result.replyDraft !== undefined && targetItem.status === "processed") {
        setQueueItems((currentItems) => {
          const nextItems = refreshProcessedEmailReplyDraft(
            currentItems,
            targetItem.email.id,
            result.replyDraft ?? "",
          );
          const prioritizedItems = decorateQueueItems(nextItems);
          const nextSelectedItem = prioritizedItems.find(
            (item) => item.email.id === targetItem.email.id,
          );

          if (nextSelectedItem?.status === "processed") {
            setCachedProcessedEmail(nextSelectedItem);
          }

          return prioritizedItems;
        });
      }

      let statusSaved = true;

      if (result.status) {
        const nextState = setThreadWorkflowStatus(
          workflowStateRef.current,
          threadId,
          result.status,
          currentRep,
        );
        statusSaved = await persistThreadStateOptimistically(
          threadId,
          nextState,
          `${result.macro.label} macro was applied.`,
          `${result.macro.label} macro could not be fully saved right now. Your workflow change was rolled back.`,
        );
      }

      if (statusSaved && !result.status) {
        showTemporaryProcessingStatus(`${result.macro.label} macro was applied.`);
      }
    }

    const intentOptions = getIntentOptions(queueItems);
    const filteredQueueItems = filterProcessedEmails(queueItems, {
      searchQuery,
      urgency: urgencyFilter,
      intent: intentFilter,
      customerPriority: customerPriorityFilter,
      queueView,
    });
    const activePilotQueueItems = pilotMode
      ? queueItems.filter((item) =>
        shouldShowPilotQueueItemInView(
          getPilotItemStateForEmail(pilotItemStates, item.email.id),
          "active",
        ),
      )
      : queueItems;
    const queueScopeItems =
      queueView === "customer_service"
        ? activePilotQueueItems.filter((item) =>
          shouldShowInCustomerServiceQueue(item) &&
          !isSuppressibleSystemReportMissingBodyFailure(item),
        )
        : activePilotQueueItems;
    const queueViewFilteredItems = pilotMode
      ? filteredQueueItems.filter((item) =>
        shouldShowPilotQueueItemInView(
          getPilotItemStateForEmail(pilotItemStates, item.email.id),
          pilotQueueView,
        ),
      )
      : filteredQueueItems;
    const issueFilteredQueueItems = sortVisibleQueueItemsByAge(
      queueViewFilteredItems.filter((item) => {
        if (
          showProblemsOnly &&
          (item.status !== "processed" || (item.result?.priorityScore ?? 0) < 70)
        ) {
          return false;
        }

        if (activeIssueFilter && getIssueCode(item) !== activeIssueFilter) {
          return false;
        }

        return true;
      }),
      pilotItemStates,
      pilotMode,
    );
    const safeQueueScopeView = currentRep
      ? sanitizeQueueScopeView(
          workflowState.preferences.queueScopeView,
          currentRep,
        )
      : workflowState.preferences.queueScopeView;
    const bypassAssignmentScope = queueView === "all_inbox";
    // TODO: Backend ticket ingestion exists, but this visible feed still builds
    // from inbox/mock/persisted queue items plus shared workflow settings. Add a
    // ticket-feed adapter at this boundary before switching cards to backend tickets.
    const assignmentSyncThreads = buildWorkflowThreads({
      items: queueItems,
      workflowState,
      customers: savedCustomers,
      slaSettings,
      now,
    });
    const workflowThreads = buildWorkflowThreads({
      items: issueFilteredQueueItems,
      workflowState,
      customers: savedCustomers,
      slaSettings,
      now,
    });
    const autoAssignmentSyncKey = getAutoAssignmentSyncKey(
      assignmentSyncThreads,
      workflowState,
    );
    const workflowThreadPersistenceKey = getWorkflowThreadPersistenceKey(
      assignmentSyncThreads,
      workflowState,
    );
    const supervisorVisibilityEnabled = canViewSupervisorVisibility(currentRep);
    const locationScopedReps = currentRep
      ? workflowState.reps.filter((rep) =>
          currentRep.role === "admin" || canAccessLocation(currentRep, rep.locationId),
        )
      : workflowState.reps;
    const safeQueueDisplayMode = supervisorVisibilityEnabled
      ? workflowState.preferences.queueDisplayMode
      : "list";
    const workloadVisibleReps = currentRep
      ? getWorkloadVisibleReps(workflowState.reps, currentRep)
      : [];
    const roleScopedWorkflowThreads = currentRep
      ? filterWorkflowThreads({
          threads: workflowThreads,
          currentRep,
          queueScopeView: safeQueueScopeView,
          statusFilter: "all",
          searchQuery: "",
          bypassAssignmentScope,
        })
      : workflowThreads;
    const statusScopedWorkflowThreads = currentRep
      ? filterWorkflowThreads({
          threads: workflowThreads,
          currentRep,
          queueScopeView: safeQueueScopeView,
          statusFilter: workflowState.preferences.statusFilter,
          searchQuery: "",
          bypassAssignmentScope,
        })
      : workflowThreads;
    const scopedWorkflowThreads = supervisorVisibilityEnabled
      ? applySupervisorQuickFilter({
          threads: statusScopedWorkflowThreads,
          quickFilter: supervisorQuickFilter,
          now,
        })
      : statusScopedWorkflowThreads;
    const visibleThreads = getVisibleWorkflowThreads(
      scopedWorkflowThreads,
      workflowState.preferences.showSnoozed,
    );
    const groupedRepSections = supervisorVisibilityEnabled
      ? groupWorkflowThreadsByAssignedRep({
          threads: visibleThreads,
          reps: locationScopedReps,
          now,
        })
      : [];
    const displayThreads =
      safeQueueDisplayMode === "grouped_by_rep"
        ? flattenRepGroupedQueueSections(groupedRepSections)
        : visibleThreads;
    const workflowMetrics = supervisorVisibilityEnabled
      ? calculateSupervisorSummaryMetrics({
          visibleThreads,
          scopedThreads: roleScopedWorkflowThreads,
          statusFilter: workflowState.preferences.statusFilter,
          now,
        })
      : calculateWorkflowMetrics({
          visibleThreads,
          scopedThreads: scopedWorkflowThreads,
          now,
        });
    const repWorkloads = calculateRepWorkloadSummaries({
      threads: roleScopedWorkflowThreads,
      reps: workloadVisibleReps,
      now,
    });
    const queueSummary = {
      totalLoaded: queueScopeItems.length,
      highPriority: queueScopeItems.filter(
        (item) => item.status === "processed" && (item.result?.priorityScore ?? 0) >= 70,
      ).length,
      failed: queueScopeItems.filter(
        (item) =>
          item.status === "failed" &&
          !isSuppressibleSystemReportMissingBodyFailure(item),
      ).length,
      processing: queueScopeItems.filter((item) => item.status === "pending").length,
    };

    const totalLoadedEmails = queueItems.length;
    const analyzedCount = queueItems.filter(
      (item) => item.status === "processed",
    ).length;
    const persistedThreadCount = getThreadRecordCount(workflowState);
    const visibleEmailCount = visibleThreads.length;
    const hiddenEmailCount = Math.max(0, workflowThreads.length - visibleEmailCount);
    const topIssues = Array.from(
      queueScopeItems.reduce((counts, item) => {
        const issueCode = getIssueCode(item);

        if (
          !issueCode ||
          item.status !== "processed" ||
          !item.result ||
          item.result.priorityScore < 70
        ) {
          return counts;
        }

        counts.set(issueCode, (counts.get(issueCode) ?? 0) + 1);
        return counts;
      }, new Map<TopIssue["code"], number>()),
    )
      .map(([code, count]) => ({
        code,
        label: getIssueTypeLabel(code),
        count,
      }))
      .sort(
        (left, right) =>
          right.count - left.count || left.label.localeCompare(right.label),
      )
      .slice(0, 3);
    const selectedThread = visibleThreads.find((thread) =>
      thread.items.some((item) => item.email.id === selectedEmailId),
    ) ?? displayThreads.find((thread) =>
      thread.items.some((item) => item.email.id === selectedEmailId),
    );
    const selectedItem =
      selectedThread?.items.find((item) => item.email.id === selectedEmailId) ??
      selectedThread?.representativeItem;
    const selectedPilotState = selectedItem
      ? getPilotItemStateForEmail(pilotItemStates, selectedItem.email.id)
      : undefined;
    const selectedReplyDraft = getOutlookReplyDraftText(selectedItem);
    const hasReplyDraft = hasOutlookReplyDraftText(selectedReplyDraft);
    const selectedOutlookDraftMessageId = getOutlookReplyDraftMessageId(selectedItem);
    const canCreateOutlookDraft = Boolean(
      desktopRuntimeInfo?.isElectron &&
        selectedOutlookDraftMessageId &&
        hasReplyDraft,
    );
    const threadNavigation = getWorkflowThreadNavigation(
      displayThreads,
      selectedEmailId,
    );
    const workflowVisibilityDiagnosticsKey = [
      totalLoadedEmails,
      analyzedCount,
      assignmentSyncThreads.length,
      workflowThreads.length,
      scopedWorkflowThreads.length,
      visibleThreads.length,
      persistedThreadCount,
      queueView,
      safeQueueScopeView,
      bypassAssignmentScope ? "bypass_assignment" : "scoped_assignment",
      workflowState.preferences.statusFilter,
      workflowState.preferences.showSnoozed ? "show_snoozed" : "hide_snoozed",
      supervisorQuickFilter,
      currentRep?.id ?? "no_rep",
      currentRep?.role ?? "no_role",
      currentRep?.locationId ?? "no_location",
    ].join("|");
    const isSinglePaneWorkspace = viewportWidth < 980;
    const isCompactWorkspace = viewportWidth < 1320;
    const detailPaneVisible = !isSinglePaneWorkspace || showDetailView;
    function markSelectedThreadWorking() {
      if (!selectedThread) {
        return;
      }

      showPresenceConflictWarning(selectedThread.id);
      void updateThreadPresence(selectedThread.id, "working");
    }
    const hasActiveFilters =
      searchQuery.trim().length > 0 ||
      urgencyFilter !== "all" ||
      customerPriorityFilter !== "all" ||
      intentFilter !== "all" ||
      showProblemsOnly ||
      activeIssueFilter !== null ||
      queueView !== "customer_service" ||
      (pilotMode && pilotQueueView !== "active") ||
      (supervisorVisibilityEnabled && supervisorQuickFilter !== "all");
    const pilotEmptyStateMessage =
      pilotMode && import.meta.env.VITE_INBOX_SOURCE !== "api"
        ? "Pilot mode shows live inbox data only. Set VITE_INBOX_SOURCE=api to view live emails."
        : pilotMode
          ? "No live inbox emails are available right now. Seeded demo emails are hidden in pilot mode."
          : undefined;
    const needsMicrosoftSignIn = inboxLoadError === SIGN_IN_REQUIRED_MESSAGE;

    useEffect(() => {
      if (!import.meta.env.DEV || !currentRep) {
        return;
      }

      console.info("[Action Desk diagnostics] workload CSR load", {
        source: "backend_users",
        currentUserRole: currentRep.role,
        currentUserLocationId: currentRep.locationId ?? null,
        totalRepProfilesLoaded: workflowState.reps.length,
        activeCsrCountLoaded: workflowState.reps.filter(
          (rep) => rep.role === "rep" && rep.isActive !== false,
        ).length,
        workloadCsrCount: workloadVisibleReps.length,
      });
    }, [
      currentRep?.id,
      currentRep?.locationId,
      currentRep?.role,
      workloadVisibleReps.length,
      workflowState.reps,
    ]);

    useEffect(() => {
      if (!import.meta.env.DEV || !selectedThread) {
        return;
      }

      const assignmentResolution = selectedThread.assignmentResolution;
      const selectedCustomerMatch = selectedThread.representativeItem.customerMatch;

      console.info("[Action Desk diagnostics] selected card assignment", {
        threadId: selectedThread.id,
        emailId: selectedThread.representativeItem.email.id,
        senderEmail: selectedThread.representativeItem.email.senderEmail,
        customerMatch: selectedCustomerMatch
          ? {
              customerId: selectedCustomerMatch.customerId,
              customerName: selectedCustomerMatch.customerName,
              matchedOn: selectedCustomerMatch.matchedOn,
            }
          : null,
        assignmentStatus: assignmentResolution.assignmentStatus,
        assignmentSource: assignmentResolution.assignmentSource,
        customerSource:
          assignmentResolution.customerId || selectedCustomerMatch?.customerId
            ? "backend_customers"
            : "none",
        csrSource:
          assignmentResolution.assignedRepIds.length > 0
            ? "backend_customer_csr_assignments"
            : "none",
        matchType: assignmentResolution.matchType,
        customerId: assignmentResolution.customerId,
        customerName: assignmentResolution.customerName,
        primaryRepId: assignmentResolution.primaryRepId,
        primaryRepName: assignmentResolution.primaryRepName,
        assignedRepIds: assignmentResolution.assignedRepIds,
        currentUserRole: currentRep?.role ?? null,
        currentUserLocationId: currentRep?.locationId ?? null,
        loadedCustomersCount: savedCustomers.length,
      });
    }, [
      currentRep?.locationId,
      currentRep?.role,
      savedCustomers.length,
      selectedThread?.assignmentResolution.assignmentSource,
      selectedThread?.assignmentResolution.assignmentStatus,
      selectedThread?.assignmentResolution.customerId,
      selectedThread?.assignmentResolution.customerName,
      selectedThread?.assignmentResolution.matchType,
      selectedThread?.assignmentResolution.primaryRepId,
      selectedThread?.id,
      selectedThread?.representativeItem.customerMatch?.customerId,
      selectedThread?.representativeItem.customerMatch?.matchedOn,
      selectedThread?.representativeItem.email.id,
    ]);

    useEffect(() => {
      if (!currentRep || assignmentSyncThreads.length === 0) {
        return;
      }

      let cancelled = false;

      async function persistMissingWorkflowThreadRecords() {
        const savedEntries: Array<{
          threadId: string;
          threadState: ThreadWorkflowState;
        }> = [];
        const skipCounts = new Map<string, number>();

        function recordSkip(skipReason: string) {
          skipCounts.set(skipReason, (skipCounts.get(skipReason) ?? 0) + 1);
        }

        for (const thread of assignmentSyncThreads) {
          const missingBindingEmailIds = thread.items
            .filter((item) => !item.email.workflowThreadId)
            .map((item) => item.email.id);

          if (!thread.id) {
            recordSkip("missingThreadId");
            console.info("[Action Desk diagnostics] workflow thread", {
              threadCreated: false,
              threadSkipped: true,
              skipReason: "missingThreadId",
              persistedThreadCount: getThreadRecordCount(workflowStateRef.current),
              visibleThreadCount: visibleThreads.length,
            });
            continue;
          }

          if (missingBindingEmailIds.length > 0) {
            recordSkip("missingWorkflowThreadBinding");
            console.info("[Action Desk diagnostics] workflow thread", {
              threadCreated: false,
              threadSkipped: true,
              skipReason: "missingWorkflowThreadBinding",
              threadId: thread.id,
              missingBindingEmailIds,
              persistedThreadCount: getThreadRecordCount(workflowStateRef.current),
              visibleThreadCount: visibleThreads.length,
            });
            continue;
          }

          if (workflowStateRef.current.threadStates[thread.id]) {
            recordSkip("alreadyPersisted");
            continue;
          }

          const threadState = createInitialWorkflowThreadState(thread);

          try {
            const savedThreadState = await saveSharedThreadState(
              thread.id,
              threadState,
            );

            if (cancelled) {
              return;
            }

            savedEntries.push({
              threadId: thread.id,
              threadState: savedThreadState,
            });
            console.info("[Action Desk diagnostics] workflow thread", {
              threadCreated: true,
              threadSkipped: false,
              threadId: thread.id,
              effectiveStatus: getWorkflowThreadDiagnosticStatus(thread),
              assignmentStatus: thread.assignmentResolution.assignmentStatus,
              assignedRepIds: thread.assignmentResolution.assignedRepIds,
              persistedThreadCount:
                getThreadRecordCount(workflowStateRef.current) +
                savedEntries.length,
              visibleThreadCount: visibleThreads.length,
            });
          } catch (error) {
            recordSkip("persistenceFailed");
            console.warn("[Action Desk diagnostics] workflow thread", {
              threadCreated: false,
              threadSkipped: true,
              skipReason: "persistenceFailed",
              threadId: thread.id,
              errorName: getSafeErrorName(error),
              persistedThreadCount: getThreadRecordCount(workflowStateRef.current),
              visibleThreadCount: visibleThreads.length,
            });
          }
        }

        if (cancelled) {
          return;
        }

        if (savedEntries.length > 0) {
          applyWorkflowState({
            ...workflowStateRef.current,
            threadStates: {
              ...workflowStateRef.current.threadStates,
              ...Object.fromEntries(
                savedEntries
                  .filter(
                    (entry) =>
                      !workflowStateRef.current.threadStates[entry.threadId]
                        ?.manualAssignment,
                  )
                  .map((entry) => [entry.threadId, entry.threadState]),
              ),
            },
          });
        }

        console.info("[Action Desk diagnostics] workflow thread persistence", {
          totalEmailsProcessed: queueItems.length,
          analyzedCount,
          threadCreated: savedEntries.length,
          threadSkipped: Array.from(skipCounts.values()).reduce(
            (total, count) => total + count,
            0,
          ),
          skipReason: Object.fromEntries(skipCounts.entries()),
          threadsPersisted:
            getThreadRecordCount(workflowStateRef.current) + savedEntries.length,
          threadsVisible: visibleThreads.length,
          persistedThreadCount:
            getThreadRecordCount(workflowStateRef.current) + savedEntries.length,
          visibleThreadCount: visibleThreads.length,
        });
      }

      void persistMissingWorkflowThreadRecords();

      return () => {
        cancelled = true;
      };
    }, [currentRep, workflowThreadPersistenceKey]);

    useEffect(() => {
      if (totalLoadedEmails === 0) {
        return;
      }

      console.info("[Action Desk diagnostics] workflow queue visibility", {
        totalEmailsProcessed: totalLoadedEmails,
        analyzedCount,
        threadsCreated: workflowThreads.length,
        threadsPersisted: persistedThreadCount,
        threadsVisible: visibleThreads.length,
        persistedThreadCount,
        visibleThreadCount: visibleThreads.length,
        scopedThreadCount: scopedWorkflowThreads.length,
        roleScopedThreadCount: roleScopedWorkflowThreads.length,
        queueView,
        queueScopeView: safeQueueScopeView,
        assignmentScopeBypassed: bypassAssignmentScope,
        statusFilter: workflowState.preferences.statusFilter,
        showSnoozed: workflowState.preferences.showSnoozed,
        supervisorQuickFilter,
        currentRepId: currentRep?.id,
        currentRepRole: currentRep?.role,
        currentRepLocationId: currentRep?.locationId,
      });
    }, [workflowVisibilityDiagnosticsKey]);

    useEffect(() => {
      if (!currentRep || assignmentSyncThreads.length === 0) {
        return;
      }

      const syncResult = syncAutoAssignmentsToWorkflowState(
        workflowStateRef.current,
        assignmentSyncThreads,
      );

      if (syncResult.updates.length === 0) {
        return;
      }

      applyWorkflowState(syncResult.workflowState);

      void (async () => {
        try {
          const savedUpdates = await Promise.all(
            syncResult.updates.map(async (update) => {
              if (
                workflowStateRef.current.threadStates[update.threadId]
                  ?.manualAssignment
              ) {
                return null;
              }

              const threadState = await saveSharedThreadState(
                update.threadId,
                update.threadState,
              );

              return {
                threadId: update.threadId,
                threadState,
              };
            }),
          );
          const savedEntries = savedUpdates.filter(
            (
              update,
            ): update is {
              threadId: string;
              threadState: WorkflowState["threadStates"][string];
            } => update !== null,
          );

          if (savedEntries.length === 0) {
            return;
          }

          applyWorkflowState({
            ...workflowStateRef.current,
            threadStates: {
              ...workflowStateRef.current.threadStates,
              ...Object.fromEntries(
                savedEntries
                  .filter(
                    (entry) =>
                      !workflowStateRef.current.threadStates[entry.threadId]
                        ?.manualAssignment,
                  )
                  .map((entry) => [entry.threadId, entry.threadState]),
              ),
            },
          });
        } catch (error) {
          console.warn("Action Desk auto assignment sync failed", {
            errorName: getSafeErrorName(error),
            attemptedThreadCount: syncResult.updates.length,
          });
          markSyncFailure(
            error,
            "Assignment routing could not be saved right now.",
          );
        }
      })();
    }, [currentRep, autoAssignmentSyncKey]);

    useEffect(() => {
      if (!import.meta.env.DEV || !showDebugUi || assignmentSyncThreads.length === 0) {
        return;
      }

      console.info(
        "Action Desk assignment resolution",
        assignmentSyncThreads.map((thread) => ({
          threadId: thread.id,
          senderEmail: thread.representativeItem.email.senderEmail,
          matchedCustomer:
            thread.assignmentResolution.customerName ??
            thread.representativeItem.customerMatch?.customerName ??
            null,
          matchType: thread.assignmentResolution.matchType,
          assignmentSource: thread.assignmentResolution.assignmentSource,
          assignmentStatus: thread.assignmentResolution.assignmentStatus,
          resolvedRepIds: thread.assignmentResolution.assignedRepIds,
        })),
      );
    }, [autoAssignmentSyncKey, showDebugUi]);

    useEffect(() => {
      if (!currentRep || !selectedThread || !detailPaneVisible) {
        if (activePresenceThreadIdRef.current) {
          const previousThreadId = activePresenceThreadIdRef.current;
          activePresenceThreadIdRef.current = null;
          void clearCurrentUserPresence(previousThreadId);
        }

        return;
      }

      const previousThreadId = activePresenceThreadIdRef.current;

      if (previousThreadId && previousThreadId !== selectedThread.id) {
        void clearCurrentUserPresence(previousThreadId);
      }

      activePresenceThreadIdRef.current = selectedThread.id;
      void updateThreadPresence(selectedThread.id, "viewing");

      const intervalId = window.setInterval(() => {
        const currentRecords =
          workflowStateRef.current.threadPresence[selectedThread.id] ?? [];
        const currentPresence = currentRecords.find(
          (presence) => presence.activeUserId === currentRep.id,
        );

        void updateThreadPresence(
          selectedThread.id,
          currentPresence?.presenceType ?? "viewing",
        );
      }, 60_000);

      return () => {
        window.clearInterval(intervalId);
      };
    }, [currentRep, detailPaneVisible, selectedThread?.id]);

    useEffect(() => {
      if (!currentRep) {
        return;
      }

      if (safeQueueScopeView !== workflowState.preferences.queueScopeView) {
        applyWorkflowState(
          setQueueScopeView(workflowStateRef.current, safeQueueScopeView),
        );
      }
    }, [currentRep, safeQueueScopeView, workflowState.preferences.queueScopeView]);

    useEffect(() => {
      if (!currentRep || safeQueueDisplayMode === workflowState.preferences.queueDisplayMode) {
        return;
      }

      applyWorkflowState(
        setQueueDisplayMode(workflowStateRef.current, safeQueueDisplayMode),
      );
    }, [currentRep, safeQueueDisplayMode, workflowState.preferences.queueDisplayMode]);

    useEffect(() => {
      if (displayThreads.length === 0) {
        setSelectedEmailId(undefined);
        setShowDetailView(false);
        return;
      }

      const hasSelectedVisible = displayThreads.some((thread) =>
        thread.items.some((item) => item.email.id === selectedEmailId),
      );

      if (!hasSelectedVisible) {
        setSelectedEmailId(displayThreads[0].representativeItem.email.id);
        setCopyFeedback("idle");
        setCaseCopyFeedback("idle");
        setRawCaseCopyFeedback("idle");
        setOutlookDraftCreationStatus("idle");
        setReplyActionError(null);
      }
    }, [displayThreads, selectedEmailId]);

    const pageStyle: React.CSSProperties = {
      minHeight: "100vh",
      margin: 0,
      backgroundColor: "#f3f6fb",
      color: "#1f2937",
      fontFamily: '"Segoe UI", Arial, sans-serif',
    };

    const shellStyle: React.CSSProperties = {
      maxWidth: "1560px",
      margin: "0 auto",
      padding: "32px 20px 40px",
      boxSizing: "border-box",
    };

    const headerStyle: React.CSSProperties = {
      marginBottom: "24px",
    };

    const headerRowStyle: React.CSSProperties = {
      display: "flex",
      justifyContent: "space-between",
      gap: "16px",
      alignItems: "start",
      flexWrap: "wrap",
    };

    const titleStyle: React.CSSProperties = {
      margin: 0,
      fontSize: "32px",
      fontWeight: 700,
      color: "#0f172a",
    };

    const subtitleStyle: React.CSSProperties = {
      margin: "8px 0 0",
      fontSize: "15px",
      color: "#475569",
    };

    const settingsButtonStyle: React.CSSProperties = {
      border: "1px solid #cbd5e1",
      backgroundColor: "#ffffff",
      color: "#0f172a",
      borderRadius: "10px",
      padding: "10px 14px",
      fontSize: "13px",
      fontWeight: 700,
      cursor: "pointer",
    };

    const layoutStyle: React.CSSProperties = {
      display: "grid",
      gap: "20px",
      alignItems: "start",
      gridTemplateColumns:
        !isSinglePaneWorkspace &&
        ((!showDetailView && !selectedItem) || selectedItem)
          ? isCompactWorkspace
            ? "minmax(280px, 320px) minmax(0, 1fr)"
            : "minmax(320px, 360px) minmax(0, 1fr)"
          : "minmax(0, 1fr)",
    };

    const statusCardStyle: React.CSSProperties = {
      backgroundColor: "#ffffff",
      border: "1px solid #d8e1ec",
      borderRadius: "16px",
      padding: "20px",
      boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
    };

    const refreshBannerStyle: React.CSSProperties = {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "12px",
      flexWrap: "wrap",
      backgroundColor: "#eff6ff",
      border: "1px solid #bfdbfe",
      borderRadius: "12px",
      color: "#1e3a8a",
      padding: "12px 14px",
      marginBottom: "20px",
      boxShadow: "0 8px 20px rgba(37, 99, 235, 0.08)",
    };

    const refreshTitleStyle: React.CSSProperties = {
      margin: 0,
      fontSize: "14px",
      fontWeight: 800,
      color: "#1d4ed8",
    };

    const refreshDetailStyle: React.CSSProperties = {
      margin: 0,
      fontSize: "13px",
      color: "#1e40af",
    };

    if (authLoading) {
      return (
        <AuthPanel
          loading={true}
          onSignIn={handleSharedSignIn}
          statusMessage={syncStatus === "error" ? syncMessage : loadError}
        />
      );
    }

    if (!currentRep) {
      return (
        <AuthPanel
          loading={false}
          onSignIn={handleSharedSignIn}
          statusMessage={syncStatus === "error" ? syncMessage : loadError}
        />
      );
    }

    if (!hasAttemptedInboxLoad && queueItems.length === 0) {
      return (
        <div style={pageStyle}>
          <div style={shellStyle}>
            <div style={headerStyle}>
              <div style={headerRowStyle}>
                <div>
                  <h1 style={titleStyle}>Action Desk</h1>
                  <p style={subtitleStyle}>
                    {pilotMode ? "Live Inbox Pilot" : "Inbox Queue MVP"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSettingsPanel(true)}
                  style={settingsButtonStyle}
                >
                  Settings
                </button>
              </div>
            </div>

            <SyncStatusBanner status={syncStatus} message={syncMessage} />

            <div
              style={{
                ...statusCardStyle,
                maxWidth: "560px",
                margin: "0 auto",
                textAlign: "center",
                padding: "32px 28px",
              }}
            >
              <h2
                style={{
                  margin: "0 0 10px",
                  fontSize: "24px",
                  color: "#0f172a",
                }}
              >
                Connect Outlook inbox
              </h2>

              <p
                style={{
                  margin: "0 0 20px",
                  fontSize: "15px",
                  lineHeight: 1.5,
                  color: "#475569",
                }}
              >
                Sign in to load your live Outlook emails into Action Desk.
              </p>

              <button
                type="button"
                onClick={handleRefreshInbox}
                style={{
                  border: "1px solid #1d4ed8",
                  backgroundColor: "#2563eb",
                  color: "#ffffff",
                  borderRadius: "10px",
                  padding: "12px 18px",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: "pointer",
                  minWidth: "200px",
                }}
              >
                Sign in to Outlook
              </button>

              <p
                style={{
                  margin: "16px 0 0",
                  fontSize: "12px",
                  color: "#64748b",
                }}
              >
                You only need to sign in to connect your live inbox.
              </p>
            </div>
          </div>
          <SettingsPanel
            isOpen={showSettingsPanel}
            currentUser={currentRep}
            reps={workflowState.reps}
            capabilities={authSession.capabilities}
            customers={savedCustomers}
            slaSettings={slaSettings}
            adminUsers={canManageUsers ? adminUsers : undefined}
            onCreateUserAccess={canManageUsers ? handleCreateUserAccess : undefined}
            onUpdateUserAccess={canManageUsers ? handleUpdateUserAccess : undefined}
            onDeactivateUserAccess={canManageUsers ? handleDeactivateUserAccess : undefined}
            onCreateTestQueueData={currentRep.role === "admin" && demoDataEnabled ? handleCreateTestQueueData : undefined}
            onRemoveTestQueueData={currentRep.role === "admin" && demoDataEnabled ? handleRemoveTestQueueData : undefined}
            testQueueDataLoading={testQueueDataLoading}
            diagnostics={diagnosticsProps}
            onClose={() => setShowSettingsPanel(false)}
            onSaveCustomer={handleSaveCustomer}
            onSaveSlaSettings={handleSaveSlaSettings}
            onDeleteCustomer={handleDeleteCustomer}
            onClearAllCustomers={handleClearAllCustomers}
          />
        </div>
      );
    }

    if (inboxLoadError && queueItems.length === 0) {
      return (
        <div style={pageStyle}>
          <div style={shellStyle}>
            <div style={headerStyle}>
              <div style={headerRowStyle}>
                <div>
                  <h1 style={titleStyle}>Action Desk</h1>
                  <p style={subtitleStyle}>
                    {pilotMode ? "Live Inbox Pilot" : "Inbox Queue MVP"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSettingsPanel(true)}
                  style={settingsButtonStyle}
                >
                  Settings
                </button>
              </div>
            </div>

            <div
              style={{
                ...statusCardStyle,
                maxWidth: "560px",
                margin: "0 auto",
                textAlign: "center",
                padding: "32px 28px",
              }}
            >
              <h2
                style={{
                  margin: "0 0 10px",
                  fontSize: "24px",
                  color: "#0f172a",
                }}
              >
                Connect Outlook inbox
              </h2>

              <p
                style={{
                  margin: "0 0 20px",
                  fontSize: "15px",
                  lineHeight: 1.5,
                  color: "#475569",
                }}
              >
                Sign in to load your live Outlook emails into Action Desk.
              </p>

              {!needsMicrosoftSignIn && (
                <p
                  style={{
                    margin: "0 0 20px",
                    fontSize: "14px",
                    lineHeight: 1.5,
                    color: "#b45309",
                    backgroundColor: "#fff7ed",
                    border: "1px solid #fdba74",
                    borderRadius: "10px",
                    padding: "12px 14px",
                  }}
                >
                  {inboxLoadError}
                </p>
              )}

              <button
                type="button"
                onClick={handleRefreshInbox}
                disabled={isLoadingInbox}
                style={{
                  border: "1px solid #1d4ed8",
                  backgroundColor: isLoadingInbox ? "#93c5fd" : "#2563eb",
                  color: "#ffffff",
                  borderRadius: "10px",
                  padding: "12px 18px",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: isLoadingInbox ? "not-allowed" : "pointer",
                  minWidth: "200px",
                }}
              >
                {isLoadingInbox ? "Signing in..." : "Sign in to Outlook"}
              </button>

              <p
                style={{
                  margin: "16px 0 0",
                  fontSize: "12px",
                  color: "#64748b",
                }}
              >
                You only need to sign in to connect your live inbox.
              </p>
            </div>
          </div>
          <SettingsPanel
            isOpen={showSettingsPanel}
            currentUser={currentRep}
            reps={workflowState.reps}
            capabilities={authSession.capabilities}
            customers={savedCustomers}
            slaSettings={slaSettings}
            adminUsers={canManageUsers ? adminUsers : undefined}
            onCreateUserAccess={canManageUsers ? handleCreateUserAccess : undefined}
            onUpdateUserAccess={canManageUsers ? handleUpdateUserAccess : undefined}
            onDeactivateUserAccess={canManageUsers ? handleDeactivateUserAccess : undefined}
            onCreateTestQueueData={currentRep.role === "admin" && demoDataEnabled ? handleCreateTestQueueData : undefined}
            onRemoveTestQueueData={currentRep.role === "admin" && demoDataEnabled ? handleRemoveTestQueueData : undefined}
            testQueueDataLoading={testQueueDataLoading}
            diagnostics={diagnosticsProps}
            onClose={() => setShowSettingsPanel(false)}
            onSaveCustomer={handleSaveCustomer}
            onSaveSlaSettings={handleSaveSlaSettings}
            onDeleteCustomer={handleDeleteCustomer}
            onClearAllCustomers={handleClearAllCustomers}
          />
        </div>
      );
    }

    if (loadError) {
      return (
        <div style={pageStyle}>
          <div style={shellStyle}>
            <div style={headerStyle}>
              <div style={headerRowStyle}>
                <div>
                  <h1 style={titleStyle}>Action Desk</h1>
                  <p style={subtitleStyle}>
                    {pilotMode ? "Live Inbox Pilot" : "Inbox Queue MVP"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSettingsPanel(true)}
                  style={settingsButtonStyle}
                >
                  Settings
                </button>
              </div>
            </div>

            <SyncStatusBanner status={syncStatus} message={syncMessage} />

            <div style={statusCardStyle}>{loadError}</div>
          </div>
          <SettingsPanel
            isOpen={showSettingsPanel}
            currentUser={currentRep}
            reps={workflowState.reps}
            capabilities={authSession.capabilities}
            customers={savedCustomers}
            slaSettings={slaSettings}
            adminUsers={canManageUsers ? adminUsers : undefined}
            onCreateUserAccess={canManageUsers ? handleCreateUserAccess : undefined}
            onUpdateUserAccess={canManageUsers ? handleUpdateUserAccess : undefined}
            onDeactivateUserAccess={canManageUsers ? handleDeactivateUserAccess : undefined}
            onCreateTestQueueData={currentRep.role === "admin" && demoDataEnabled ? handleCreateTestQueueData : undefined}
            onRemoveTestQueueData={currentRep.role === "admin" && demoDataEnabled ? handleRemoveTestQueueData : undefined}
            testQueueDataLoading={testQueueDataLoading}
            diagnostics={diagnosticsProps}
            onClose={() => setShowSettingsPanel(false)}
            onSaveCustomer={handleSaveCustomer}
            onSaveSlaSettings={handleSaveSlaSettings}
            onDeleteCustomer={handleDeleteCustomer}
            onClearAllCustomers={handleClearAllCustomers}
          />
        </div>
      );
    }

    return (
      <div style={pageStyle}>
        <div style={shellStyle}>
          <div style={headerStyle}>
            <div style={headerRowStyle}>
              <div>
                <h1 style={titleStyle}>Action Desk</h1>
                <p style={subtitleStyle}>
                  {pilotMode
                    ? "Live inbox pilot for customer support triage, suggested next action, and reply drafting"
                    : "Inbox Queue MVP for customer support triage, analysis, and reply drafting"}
                </p>
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "end", flexWrap: "wrap" }}>
                <div
                  style={{
                    display: "grid",
                    gap: "4px",
                    minWidth: "220px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#475569",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    Signed In
                  </span>
                  <div
                    style={{
                      border: "1px solid #cbd5e1",
                      backgroundColor: "#ffffff",
                      color: "#0f172a",
                      borderRadius: "10px",
                      padding: "10px 12px",
                      fontSize: "13px",
                      fontWeight: 700,
                    }}
                  >
                    {currentRep.name} ({currentRep.role === "admin" ? "Admin" : currentRep.role === "supervisor" ? "Supervisor" : "Rep"})
                    {currentRep.locationId ? ` | ${getLocationLabel(currentRep.locationId)}` : ""}
                  </div>
                </div>
                <div
                  style={{
                    display: "grid",
                    gap: "4px",
                    minWidth: "180px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#475569",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    Shared Sync
                  </span>
                  <div
                    style={{
                      border: `1px solid ${(sharedHealth?.ok ?? false) ? "#86efac" : "#fca5a5"}`,
                      backgroundColor: (sharedHealth?.ok ?? false) ? "#f0fdf4" : "#fef2f2",
                      color: (sharedHealth?.ok ?? false) ? "#166534" : "#991b1b",
                      borderRadius: "10px",
                      padding: "10px 12px",
                      fontSize: "13px",
                      fontWeight: 700,
                    }}
                  >
                    {(sharedHealth?.ok ?? false) ? "Connected" : "Needs attention"}
                    {lastSuccessfulSyncAt
                      ? ` • ${new Date(lastSuccessfulSyncAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}`
                      : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSettingsPanel(true)}
                  style={settingsButtonStyle}
                >
                  Settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleSharedSignOut();
                  }}
                  style={settingsButtonStyle}
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>

          {inboxLoadError && (
            <div style={{ ...statusCardStyle, marginBottom: "20px" }}>
              {inboxLoadError}
            </div>
          )}

          <SyncStatusBanner status={syncStatus} message={syncMessage} />

          {isRefreshingInbox && (
            <div role="status" aria-live="polite" style={refreshBannerStyle}>
              <p style={refreshTitleStyle}>Refreshing inbox...</p>
              <p style={refreshDetailStyle}>
                {processingStatus &&
                processingStatus !== "Refreshing inbox emails."
                  ? processingStatus
                  : "Checking for new messages."}
              </p>
            </div>
          )}

          {showDebugUi && currentRep.role === "admin" && desktopRuntimeInfo && (
            <div style={{ ...statusCardStyle, marginBottom: "20px" }}>
              Desktop mode active. App data folder: {desktopRuntimeInfo.userDataPath}.
              Recommended persistence: {desktopRuntimeInfo.recommendedRepositoryBackend}.
              Inbox source: {desktopRuntimeInfo.inboxSource}.
              {desktopRuntimeInfo.logFilePath
                ? ` Log file: ${desktopRuntimeInfo.logFilePath}.`
                : ""}
              {desktopRuntimeInfo.runtimeConfigPath
                ? ` Runtime config: ${desktopRuntimeInfo.runtimeConfigPath}.`
                : ""}
            </div>
          )}

          {processingStatus && !isRefreshingInbox && (
            <div style={{ ...statusCardStyle, marginBottom: "20px" }}>
              {processingStatus}
            </div>
          )}

          {showDebugUi && !processingStatus && totalLoadedEmails > 0 && (
            <div style={{ ...statusCardStyle, marginBottom: "20px" }}>
              Loaded {totalLoadedEmails} emails. Showing {visibleEmailCount} threads
              {hiddenEmailCount > 0
                ? `, with ${hiddenEmailCount} hidden by the current view, snooze, or filters.`
                : "."}
            </div>
          )}

          <WorkflowToolbar
            currentRepRole={currentRep?.role ?? "rep"}
            queueScopeView={safeQueueScopeView}
            queueDisplayMode={safeQueueDisplayMode}
            canUseGroupedRepView={supervisorVisibilityEnabled}
            statusFilter={workflowState.preferences.statusFilter}
            showSnoozed={workflowState.preferences.showSnoozed}
            onQueueScopeViewChange={handleQueueScopeViewChange}
            onQueueDisplayModeChange={handleQueueDisplayModeChange}
            onStatusFilterChange={handleStatusFilterChange}
            onShowSnoozedChange={handleShowSnoozedChange}
          />

          <MetricsBar
            totalOpen={workflowMetrics.totalOpen}
            unassigned={workflowMetrics.unassigned}
            avgWaitMinutes={workflowMetrics.avgWaitMinutes}
            oldestOpenMinutes={workflowMetrics.oldestOpenMinutes}
            breached={workflowMetrics.breached}
            atRisk={workflowMetrics.atRisk}
            resolvedToday={workflowMetrics.resolvedToday}
            snoozed={workflowMetrics.snoozed}
            showSnoozed={workflowState.preferences.showSnoozed}
          />

          {supervisorVisibilityEnabled && (
            <>
              <SupervisorQuickFilters
                value={supervisorQuickFilter}
                onChange={setSupervisorQuickFilter}
              />
              <RepWorkloadPanel
                workloads={repWorkloads}
                now={now}
                defaultCollapsed={true}
              />
            </>
          )}

          <div style={layoutStyle}>
            {(!isSinglePaneWorkspace || !showDetailView || !selectedItem) && (
              <InboxQueue
                threads={visibleThreads}
                groupedRepSections={groupedRepSections}
                totalCount={scopedWorkflowThreads.length}
                summary={queueSummary}
                topIssues={topIssues}
                activeIssueFilter={activeIssueFilter}
                selectedEmailId={selectedEmailId}
                hasActiveFilters={hasActiveFilters}
                pilotMode={pilotMode}
                pilotEmptyStateMessage={pilotEmptyStateMessage}
                pilotQueueView={pilotQueueView}
                queueDisplayMode={safeQueueDisplayMode}
                queueView={queueView}
                showProblemsOnly={showProblemsOnly}
                isLoadingInbox={isLoadingInbox || loading}
                isLoadingMore={isLoadingMore}
                nextCursor={nextCursor}
                loadMoreError={loadMoreError}
                lastLoadedAt={lastLoadedAt}
                searchQuery={searchQuery}
                urgencyFilter={urgencyFilter}
                intentFilter={intentFilter}
                customerPriorityFilter={customerPriorityFilter}
                hasSavedCustomers={savedCustomers.length > 0}
                intentOptions={intentOptions}
                now={now}
                onRefreshInbox={handleRefreshInbox}
                onLoadMore={handleLoadMore}
                retryingEmailId={retryingEmailId ?? undefined}
                onRetryEmail={handleRetryEmail}
                onTakeThread={handleTakeThread}
                currentRepId={currentRep.id}
                onToggleProblemsOnly={() => setShowProblemsOnly((current) => !current)}
                onIssueFilterChange={(issueCode) => {
                  setActiveIssueFilter((current) =>
                    current === issueCode ? null : issueCode,
                  );
                }}
                onClearIssueFilter={() => setActiveIssueFilter(null)}
                onSelectEmail={(emailId) => {
                  openThreadDetail(emailId);
                }}
                onPilotQueueViewChange={setPilotQueueView}
                onQueueViewChange={setQueueView}
                onSearchQueryChange={setSearchQuery}
                onUrgencyFilterChange={setUrgencyFilter}
                onIntentFilterChange={setIntentFilter}
                onCustomerPriorityFilterChange={setCustomerPriorityFilter}
              />
            )}
            {(!isSinglePaneWorkspace || (detailPaneVisible && Boolean(selectedItem))) && (
              <EmailDetail
                item={selectedItem}
                thread={selectedThread}
                reps={workflowState.reps}
                currentRep={currentRep}
                pilotMode={pilotMode}
                pilotItemState={selectedPilotState}
                orderDataMessage={pilotMode ? PILOT_ORDER_DATA_MESSAGE : undefined}
                hasReplyDraft={hasReplyDraft}
                copyFeedback={copyFeedback}
                caseCopyFeedback={caseCopyFeedback}
                rawCaseCopyFeedback={rawCaseCopyFeedback}
                regeneratingReply={regeneratingReply}
                outlookDraftCreationStatus={outlookDraftCreationStatus}
                canCreateOutlookDraft={canCreateOutlookDraft}
                replyActionError={replyActionError}
                macros={BUILT_IN_MACROS}
                showDebugActions={showDebugUi && currentRep.role === "admin"}
                showBackButton={isSinglePaneWorkspace}
                isCompactWorkspace={isCompactWorkspace}
                navigation={{
                  currentPosition:
                    threadNavigation.currentIndex >= 0
                      ? threadNavigation.currentIndex + 1
                      : undefined,
                  total: threadNavigation.total,
                  hasPrevious: Boolean(threadNavigation.previousEmailId),
                  hasNext: Boolean(threadNavigation.nextEmailId),
                  onPrevious: () => {
                    if (threadNavigation.previousEmailId) {
                      openThreadDetail(threadNavigation.previousEmailId);
                    }
                  },
                  onNext: () => {
                    if (threadNavigation.nextEmailId) {
                      openThreadDetail(threadNavigation.nextEmailId);
                    }
                  },
                }}
                onBackToQueue={() => setShowDetailView(false)}
                onCopyReply={handleCopyReply}
                onCreateOutlookDraft={handleCreateOutlookDraft}
                onCopyCaseForReview={handleCopyCaseForReview}
                onCopyRawCaseJson={handleCopyRawCaseJson}
                onRegenerateReply={handleRegenerateReply}
                onThreadStatusChange={handleThreadStatusChange}
                onAddInternalNote={handleAddInternalNote}
                onLogReply={handleLogReply}
                onSnoozeThread={handleSnoozeThread}
                onUnsnoozeThread={handleUnsnoozeThread}
                onTakeThread={handleTakeThread}
                onAssignThread={handleAssignThread}
                onApplyMacro={handleApplyMacro}
                onRecomputePriority={async () => {
                  if (!selectedItem) {
                    return;
                  }

                  markSelectedThreadWorking();
                  if (persistedQueueEnabled && selectedItem.queueItemId) {
                    try {
                      await runPersistedRecomputePriority({
                        service: getQueueApplicationService(),
                        selectedItem,
                        setQueueItems: (items) =>
                          setQueueItems(decorateQueueItems(items)),
                        setSelectedEmailId,
                        setShowDetailView,
                        setReplyActionError,
                        setCopyFeedback,
                        setCaseCopyFeedback,
                        setRawCaseCopyFeedback,
                        showTemporaryProcessingStatus,
                      });
                    } catch {
                      setReplyActionError(
                        "Priority could not be recalculated right now. Please try again.",
                      );
                    }

                    return;
                  }

                  showTemporaryProcessingStatus(
                    "Recompute Priority is only active in the persisted queue mode.",
                  );
                }}
                onMarkPilotItemActive={async () => {
                  if (!selectedItem) {
                    return;
                  }

                  markSelectedThreadWorking();
                  if (persistedQueueEnabled && selectedItem.queueItemId) {
                    try {
                      await runPersistedUpdateWorkStatus({
                        service: getQueueApplicationService(),
                        selectedItem,
                        status: "active",
                        successMessage: "Queue item moved back to Active.",
                        onAfterSuccess: (emailId) => {
                          handleSetPilotWorkflowStatus(emailId, "active");
                        },
                        setQueueItems: (items) =>
                          setQueueItems(decorateQueueItems(items)),
                        setSelectedEmailId,
                        setShowDetailView,
                        setReplyActionError,
                        setCopyFeedback,
                        setCaseCopyFeedback,
                        setRawCaseCopyFeedback,
                        showTemporaryProcessingStatus,
                      });
                    } catch {
                      setReplyActionError(
                        "This queue item could not be moved back to Active right now. Please try again.",
                      );
                    }

                    return;
                  }

                  handleSetPilotWorkflowStatus(selectedItem.email.id, "active");
                }}
                onMarkPilotItemDone={async () => {
                  if (!selectedItem) {
                    return;
                  }

                  markSelectedThreadWorking();
                  if (persistedQueueEnabled && selectedItem.queueItemId) {
                    try {
                      await runPersistedMarkDone({
                        service: getQueueApplicationService(),
                        selectedItem,
                        setQueueItems: (items) =>
                          setQueueItems(decorateQueueItems(items)),
                        setSelectedEmailId,
                        setShowDetailView,
                        setReplyActionError,
                        setCopyFeedback,
                        setCaseCopyFeedback,
                        setRawCaseCopyFeedback,
                        showTemporaryProcessingStatus,
                      });
                    } catch {
                      setReplyActionError(
                        "This queue item could not be marked done right now. Please try again.",
                      );
                    }

                    return;
                  }

                  handleSetPilotWorkflowStatus(selectedItem.email.id, "done");
                }}
                onMarkPilotItemNotRelevant={() => {
                  if (selectedItem) {
                    markSelectedThreadWorking();
                    handleSetPilotWorkflowStatus(
                      selectedItem.email.id,
                      "not_relevant",
                    );
                  }
                }}
                onMarkPilotItemWaitingOnCustomer={async () => {
                  if (!selectedItem) {
                    return;
                  }

                  markSelectedThreadWorking();
                  if (persistedQueueEnabled && selectedItem.queueItemId) {
                    try {
                      await runPersistedUpdateWorkStatus({
                        service: getQueueApplicationService(),
                        selectedItem,
                        status: "waiting_on_customer",
                        successMessage:
                          "Queue item moved to Waiting on Customer.",
                        onAfterSuccess: (emailId) => {
                          handleSetPilotWorkflowStatus(
                            emailId,
                            "waiting_on_customer",
                          );
                        },
                        setQueueItems: (items) =>
                          setQueueItems(decorateQueueItems(items)),
                        setSelectedEmailId,
                        setShowDetailView,
                        setReplyActionError,
                        setCopyFeedback,
                        setCaseCopyFeedback,
                        setRawCaseCopyFeedback,
                        showTemporaryProcessingStatus,
                      });
                    } catch {
                      setReplyActionError(
                        "This queue item could not be moved to Waiting on Customer right now. Please try again.",
                      );
                    }

                    return;
                  }

                  handleSetPilotWorkflowStatus(
                    selectedItem.email.id,
                    "waiting_on_customer",
                  );
                }}
                onSnoozePilotItemUntilTomorrow={() => {
                  if (selectedItem) {
                    markSelectedThreadWorking();
                    handleSnoozeUntilTomorrow(selectedItem.email.id);
                  }
                }}
                onSetPilotUsefulness={(usefulness) => {
                  if (selectedItem) {
                    handleSetPilotUsefulness(
                      selectedItem.email.id,
                      usefulness,
                    );
                  }
                }}
              />
            )}
          </div>
        </div>
        <SettingsPanel
          isOpen={showSettingsPanel}
          currentUser={currentRep}
          reps={workflowState.reps}
          capabilities={authSession.capabilities}
          customers={savedCustomers}
          slaSettings={slaSettings}
          adminUsers={canManageUsers ? adminUsers : undefined}
          onCreateUserAccess={canManageUsers ? handleCreateUserAccess : undefined}
          onUpdateUserAccess={canManageUsers ? handleUpdateUserAccess : undefined}
          onDeactivateUserAccess={canManageUsers ? handleDeactivateUserAccess : undefined}
          onCreateTestQueueData={currentRep.role === "admin" && demoDataEnabled ? handleCreateTestQueueData : undefined}
          onRemoveTestQueueData={currentRep.role === "admin" && demoDataEnabled ? handleRemoveTestQueueData : undefined}
          testQueueDataLoading={testQueueDataLoading}
          diagnostics={diagnosticsProps}
          onClose={() => setShowSettingsPanel(false)}
          onSaveCustomer={handleSaveCustomer}
          onSaveSlaSettings={handleSaveSlaSettings}
          onDeleteCustomer={handleDeleteCustomer}
          onClearAllCustomers={handleClearAllCustomers}
        />
      </div>
    );
  }
