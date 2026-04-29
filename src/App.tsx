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
import { shouldShowInCustomerServiceQueue } from "./services/customerServiceMail";
import { generateReply } from "./services/generateReply";
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
import { getVisibleCustomersForSettings } from "./services/customerSettings";
import {
  clearStoredSharedWorkflowSession,
  clearSharedCustomers,
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
  getActiveThreadPresence,
  getPresenceConflictWarning,
} from "./services/threadPresence";
import { getDefaultSlaSettings } from "./services/sla";
import { canAccessLocation, getLocationLabel } from "./services/locations";
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

function mapManagedUsersToRepProfiles(users: ManagedUser[]): RepProfile[] {
  return users
    .filter((user) => user.isActive)
    .map((user) => ({
      id: user.id,
      name: user.displayName,
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
    recommendedRepositoryBackend: "sqlite";
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
  const workflowStateRef = useRef(workflowState);
  const lastFocusRefreshAtRef = useRef(0);
  const activePresenceThreadIdRef = useRef<string | null>(null);
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
    savedCustomersRef.current = nextCustomers;
    setSavedCustomers(nextCustomers);
    updateProcessedEmailCache((item) =>
      applyCustomerPriority([item], nextCustomers)[0],
    );
    setQueueItems((currentItems) =>
      rematchLoadedQueueItems(currentItems, nextCustomers),
    );
  }

  function applyAdminUsers(nextUsers: ManagedUser[]) {
    setAdminUsers(nextUsers);
    const nextReps = mapManagedUsersToRepProfiles(nextUsers);

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

  async function refreshAdminUsers() {
    const usersResponse = await loadSharedUsers();
    applyAdminUsers(usersResponse.users);
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

        setQueueItems((currentItems) =>
          applyWorkflowThreadBindings(currentItems, bindings),
        );
      } catch {
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
        setWorkflowState((current) => ({
          ...current,
          reps: session.reps.length > 0 ? session.reps : getDefaultRepProfiles(),
          currentRepId: "",
        }));
        setSavedCustomers([]);
        setSlaSettings(getDefaultSlaSettings());
        setAdminUsers([]);
        return;
        }

        const bootstrap = await loadSharedWorkflowBootstrap();

        if (cancelled) {
          return;
        }

        setAuthSession({
          sessionId: session.sessionId,
          currentUser: bootstrap.currentUser,
          capabilities: bootstrap.capabilities,
        });
        setWorkflowState(bootstrap.workflowState);
        setSavedCustomers(bootstrap.customers);
        setSlaSettings(bootstrap.slaSettings);
        if (!bootstrap.capabilities.includes("manage_users")) {
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
  const visibleSettingsCustomers = currentRep
    ? getVisibleCustomersForSettings(
        savedCustomers,
        currentRep,
        authSession.capabilities.includes("manage_customer_ownership"),
      )
    : [];
  const canManageUsers = authSession.capabilities.includes("manage_users");
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

      setAuthSession(session);
      setWorkflowState(bootstrap.workflowState);
      setSavedCustomers(bootstrap.customers);
      setSlaSettings(bootstrap.slaSettings);
      if (!bootstrap.capabilities.includes("manage_users")) {
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
      markSyncFailure(error, "Sign-in failed. Please try again.");
      throw error;
    }
  }

  async function handleSharedSignOut() {
    try {
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
        reps: session.reps.length > 0 ? session.reps : getDefaultRepProfiles(),
        currentRepId: "",
        threadStates: {},
        threadPresence: {},
      }));
      setSavedCustomers([]);
      setSlaSettings(getDefaultSlaSettings());
      setAdminUsers([]);
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
      reps: session.reps.length > 0 ? session.reps : getDefaultRepProfiles(),
      currentRepId: "",
      threadStates: {},
      threadPresence: {},
    }));
    setSavedCustomers([]);
    setSlaSettings(getDefaultSlaSettings());
    setAdminUsers([]);
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
      applyAdminUsers(response.users);
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
      applyAdminUsers(response.users);
      const session = await loadAuthSession();
      setAuthSession({
        sessionId: session.sessionId,
        currentUser: session.currentUser,
        capabilities: session.capabilities,
      });
      markSyncSuccess("User access was updated.");
    } catch (error) {
      markSyncFailure(error, "User access could not be updated right now.");
    }
  }

  async function handleDeactivateUserAccess(userId: string) {
    try {
      const response = await deactivateSharedUser(userId);
      applyAdminUsers(response.users);
      const session = await loadAuthSession();
      setAuthSession({
        sessionId: session.sessionId,
        currentUser: session.currentUser,
        capabilities: session.capabilities,
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
      setQueueItems((currentItems) => {
        const withoutDuplicate = currentItems.filter(
          (item) => item.email.id !== prioritizedCachedItem.email.id,
        );

        return decorateQueueItems([...withoutDuplicate, prioritizedCachedItem]);
      });
      setProcessingStatus(
        `${options?.statusPrefix ?? "Processing inbox emails"}: ${settledCount} of ${inboxEmails.length} completed.`,
      );
      if (!options?.append) {
        setSelectedEmailId(
          (currentSelectedEmailId) =>
            currentSelectedEmailId ?? prioritizedCachedItem.email.id,
        );
      }
    }

    if (uncachedEmails.length === 0) {
      return {
        processedCount: cachedProcessedCount,
        failedCount: 0,
      };
    }

    const result = await processEmailsProgressively(uncachedEmails, {
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
        setQueueItems((currentItems) => {
          const withoutDuplicate = currentItems.filter(
            (item) => item.email.id !== prioritizedProcessedItem.email.id,
          );

          return decorateQueueItems([
            ...withoutDuplicate,
            prioritizedProcessedItem,
          ]);
        });
        setProcessingStatus(
          `${options?.statusPrefix ?? "Processing inbox emails"}: ${settledCount} of ${inboxEmails.length} completed.`,
        );
        if (!options?.append) {
          setSelectedEmailId(
            (currentSelectedEmailId) =>
              currentSelectedEmailId ?? prioritizedProcessedItem.email.id,
          );
        }
      },
    });

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

      async function loadQueue() {
        const shouldUseInteractiveAuth =
          nextInboxLoadInteractiveRef.current ||
          Boolean(window.actionDeskDesktop?.isElectron);

        nextInboxLoadInteractiveRef.current = false;

        setLoading(true);
        setIsLoadingInbox(true);
        setLoadError(null);
        setInboxLoadError(null);
        setLoadMoreError(null);
        setNextCursor(undefined);
        setProcessingStatus("Loading inbox emails.");
        setQueueItems([]);
        setSelectedEmailId(undefined);

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

          setProcessingStatus(
            "Processing inbox emails and generating AI analysis.",
          );

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
            setQueueItems([]);
            setSelectedEmailId(undefined);
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

    useEffect(() => {
      function handleWindowFocus() {
        const now = Date.now();

        if (
          loading ||
          isLoadingInbox ||
          isLoadingMore ||
          now - lastFocusRefreshAtRef.current < 5000
        ) {
          return;
        }

        lastFocusRefreshAtRef.current = now;
        setReloadToken((current) => current + 1);
      }

      window.addEventListener("focus", handleWindowFocus);

      return () => {
        window.removeEventListener("focus", handleWindowFocus);
      };
    }, [loading, isLoadingInbox, isLoadingMore]);

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

    async function handleCopyReply() {
      if (!selectedItem || selectedItem.status !== "processed" || !hasReplyDraft) {
        return;
      }

      setReplyActionError(null);

      if (!navigator.clipboard?.writeText) {
        resetFeedbackWithDelay(setCopyFeedback, copyFeedbackTimeoutRef, "error");
        return;
      }

      try {
        await navigator.clipboard.writeText(selectedReplyDraft);
        resetFeedbackWithDelay(
          setCopyFeedback,
          copyFeedbackTimeoutRef,
          "success",
        );
      } catch {
        resetFeedbackWithDelay(setCopyFeedback, copyFeedbackTimeoutRef, "error");
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
        !selectedItem.result ||
        regeneratingReply
      ) {
        return;
      }

      setRegeneratingReply(true);
      setCopyFeedback("idle");
      setReplyActionError(null);

      try {
        const nextReplyDraft = generateReply(
          selectedItem.result.analysis,
          selectedItem.result.orderContext,
        );

        setQueueItems((currentItems) => {
          const nextItems = refreshProcessedEmailReplyDraft(
            currentItems,
            selectedItem.email.id,
            nextReplyDraft,
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
      } catch {
        setReplyActionError(
          "The reply could not be regenerated right now. Please try again.",
        );
      } finally {
        setRegeneratingReply(false);
      }
    }

    function handleRefreshInbox() {
      if (loading || isLoadingInbox) {
        return;
      }

      setInboxLoadError(null);
      setLoadError(null);
      setLoadMoreError(null);
      setProcessingStatus("Loading inbox emails...");
      setLoading(true);
      setIsLoadingInbox(true);

      nextInboxLoadInteractiveRef.current = true;
      setHasAttemptedInboxLoad(true);
      setReloadToken((current) => current + 1);
    }

    async function handleLoadMore() {
      if (!nextCursor || isLoadingMore || isLoadingInbox || loading) {
        return;
      }

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
        const nextResult = await runActionDesk(buildAnalysisInput(failedItem.email));
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
        const nextCustomers = await upsertSharedCustomer(draft);
        saveCustomers(nextCustomers);
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
        const nextCustomers = await deleteSharedCustomer(customerId);
        saveCustomers(nextCustomers);
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
        const nextCustomers = await clearSharedCustomers();
        saveCustomers(nextCustomers);
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
          shouldShowInCustomerServiceQueue(item),
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
    // TODO: MariaDB ticket ingestion exists, but this visible feed still builds
    // from inbox/mock/persisted queue items plus shared workflow settings. Add a
    // ticket-feed adapter at this boundary before switching cards to MariaDB tickets.
    const workflowThreads = buildWorkflowThreads({
      items: issueFilteredQueueItems,
      workflowState,
      customers: savedCustomers,
      slaSettings,
      now,
    });
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
        })
      : workflowThreads;
    const statusScopedWorkflowThreads = currentRep
      ? filterWorkflowThreads({
          threads: workflowThreads,
          currentRep,
          queueScopeView: safeQueueScopeView,
          statusFilter: workflowState.preferences.statusFilter,
          searchQuery: "",
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
      failed: queueScopeItems.filter((item) => item.status === "failed").length,
      processing: queueScopeItems.filter((item) => item.status === "pending").length,
    };

    const totalLoadedEmails = queueItems.length;
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
    const selectedReplyDraft = selectedItem?.result?.replyDraft.trim() ?? "";
    const hasReplyDraft = selectedReplyDraft.length > 0;
    const threadNavigation = getWorkflowThreadNavigation(
      displayThreads,
      selectedEmailId,
    );
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
            customers={visibleSettingsCustomers}
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
            customers={visibleSettingsCustomers}
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
            customers={visibleSettingsCustomers}
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

          {showDebugUi && currentRep.role === "admin" && desktopRuntimeInfo && (
            <div style={{ ...statusCardStyle, marginBottom: "20px" }}>
              Desktop mode active. App data folder: {desktopRuntimeInfo.userDataPath}.
              Recommended persistence: {desktopRuntimeInfo.recommendedRepositoryBackend}.
              Inbox source: {desktopRuntimeInfo.inboxSource}.
              {desktopRuntimeInfo.logFilePath
                ? ` Log file: ${desktopRuntimeInfo.logFilePath}.`
                : ""}
            </div>
          )}

          {processingStatus && (
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
                onCopyCaseForReview={handleCopyCaseForReview}
                onCopyRawCaseJson={handleCopyRawCaseJson}
                onRegenerateReply={handleRegenerateReply}
                onThreadStatusChange={handleThreadStatusChange}
                onAddInternalNote={handleAddInternalNote}
                onLogReply={handleLogReply}
                onSnoozeThread={handleSnoozeThread}
                onUnsnoozeThread={handleUnsnoozeThread}
                onTakeThread={handleTakeThread}
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
          customers={visibleSettingsCustomers}
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
