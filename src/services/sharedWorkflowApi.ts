import type {
  AppCapability,
  AuthSession,
  ManagedUser,
  ManagedUserDraft,
  ProcessedEmail,
  RepProfile,
  SavedCustomer,
  SavedCustomerDraft,
  SlaSettings,
  ThreadPresenceRecord,
  ThreadPresenceType,
  ThreadWorkflowState,
  WorkflowPreferences,
  WorkflowState,
} from "../types/actionDesk";

const SESSION_STORAGE_KEY = "action-desk.shared-session-id";
const EXPIRED_MICROSOFT_SESSION_MESSAGE =
  "Your Microsoft session expired. Please sign in again.";
const ACCESS_CHANGED_SESSION_MESSAGE = "Your access changed. Please sign in again.";
const SHARED_SESSION_EXPIRED_EVENT = "action-desk:shared-session-expired";
const STALE_SHARED_SESSION_ERROR_CODES = new Set([
  "microsoft_session_missing",
  "microsoft_session_expired",
  "stale_microsoft_session",
  "access_changed",
]);
export type SharedWorkflowApiError = Error & {
  code: string;
  retryable: boolean;
  context?: string;
  details?: unknown;
};

export type SharedAuthSessionResponse = AuthSession & {
  reps: RepProfile[];
  staleSessionCleared?: boolean;
  authMessage?: string;
};

let sharedApiOrigin =
  typeof window !== "undefined"
    ? window.actionDeskDesktop?.isElectron
      ? "http://localhost:3960"
      : window.location.origin
    : "http://localhost:3960";

function getSessionId(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "";
}

function setSessionId(sessionId: string) {
  if (typeof window === "undefined") {
    return;
  }

  if (!sessionId.trim()) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
}

export function clearStoredSharedWorkflowSession() {
  setSessionId("");
}

function dispatchSharedSessionExpired(message = EXPIRED_MICROSOFT_SESSION_MESSAGE) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(SHARED_SESSION_EXPIRED_EVENT, {
      detail: {
        message,
      },
    }),
  );
}

function createSharedWorkflowError(input: {
  code?: string;
  message?: string;
  retryable?: boolean;
  context?: string;
  details?: unknown;
}): SharedWorkflowApiError {
  const error = new Error(input.message ?? "Shared workflow request failed.") as SharedWorkflowApiError;
  error.code = input.code ?? "shared_workflow_error";
  error.retryable = input.retryable ?? true;
  error.context = input.context;
  error.details = input.details;
  return error;
}

async function parseErrorResponse(response: Response): Promise<SharedWorkflowApiError> {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: {
      code?: string;
      message?: string;
      retryable?: boolean;
      context?: string;
      details?: unknown;
    };
  };

  return createSharedWorkflowError({
    code: payload.error?.code ?? `http_${response.status}`,
    message:
      payload.error?.message ??
      "The shared workflow request could not be completed.",
    retryable: payload.error?.retryable ?? response.status >= 500,
    context: payload.error?.context,
    details: payload.error?.details,
  });
}

async function requestJson<T>(
  pathname: string,
  options?: {
    method?: "GET" | "POST";
    body?: unknown;
  },
): Promise<T> {
  const sessionId = getSessionId();
  const url = new URL(pathname, sharedApiOrigin);
  if (sessionId) {
    url.searchParams.set("sessionId", sessionId);
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method: options?.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        "x-action-desk-session-id": sessionId,
      },
      body: options?.body
        ? JSON.stringify(sessionId ? { sessionId, ...options.body } : options.body)
        : undefined,
    });
  } catch (error) {
    throw createSharedWorkflowError({
      code: "network_error",
      message: "The shared workflow service could not be reached.",
      retryable: true,
      context: pathname,
      details: error instanceof Error ? error.message : String(error),
    });
  }

  if (!response.ok) {
    const error = await parseErrorResponse(response);
    const shouldForceSignOut =
      Boolean(sessionId) &&
      (STALE_SHARED_SESSION_ERROR_CODES.has(error.code) ||
        (response.status === 401 && error.code === "auth_required"));

    if (shouldForceSignOut) {
      clearStoredSharedWorkflowSession();

      if (error.code === "access_changed") {
        error.message = ACCESS_CHANGED_SESSION_MESSAGE;
      } else {
        error.code = "stale_microsoft_session";
        error.message = EXPIRED_MICROSOFT_SESSION_MESSAGE;
      }

      error.retryable = false;
      dispatchSharedSessionExpired(error.message);
    }

    throw error;
  }

  return response.json() as Promise<T>;
}

export function setSharedApiOrigin(nextOrigin?: string | null) {
  if (nextOrigin?.trim()) {
    sharedApiOrigin = nextOrigin;
  }
}

export function getSharedSessionExpiredEventName() {
  return SHARED_SESSION_EXPIRED_EVENT;
}

export function getExpiredMicrosoftSessionMessage() {
  return EXPIRED_MICROSOFT_SESSION_MESSAGE;
}

export async function loadAuthSession(): Promise<SharedAuthSessionResponse> {
  const session = await requestJson<SharedAuthSessionResponse>("/api/auth/session");

  if (session.staleSessionCleared) {
    clearStoredSharedWorkflowSession();
  }

  return session;
}

export async function signInSharedWorkflow(): Promise<AuthSession> {
  if (!window.actionDeskDesktop?.signInWithMicrosoft) {
    throw createSharedWorkflowError({
      code: "microsoft_auth_unavailable",
      message: "Microsoft sign-in is only available in the desktop app.",
      retryable: false,
      context: "signInWithMicrosoft",
    });
  }

  const session = await window.actionDeskDesktop.signInWithMicrosoft();
  setSessionId(session.sessionId);

  return {
    sessionId: session.sessionId,
    currentUser: session.currentUser,
    capabilities: (session.capabilities ?? []) as AppCapability[],
  };
}

export async function signOutSharedWorkflow(): Promise<void> {
  const sessionId = getSessionId();

  if (window.actionDeskDesktop?.signOut && sessionId) {
    await window.actionDeskDesktop.signOut(sessionId);
  } else if (sessionId) {
    await requestJson("/api/auth/logout", {
      method: "POST",
    });
  }

  setSessionId("");
}

export async function loadSharedWorkflowBootstrap(): Promise<{
  currentUser: RepProfile | null;
  capabilities: AppCapability[];
  reps: RepProfile[];
  customers: SavedCustomer[];
  slaSettings: SlaSettings;
  workflowState: WorkflowState;
}> {
  return requestJson("/api/workflow/bootstrap");
}

export async function loadSharedWorkflowHealth(): Promise<{
  ok: boolean;
  databaseReady: boolean;
  databasePath: string;
  currentUser: RepProfile | null;
  repCount: number;
  threadCount: number;
  customerCount: number;
  serverTime: string;
}> {
  return requestJson("/api/health");
}

export async function createSharedTestQueueData(): Promise<{
  createdCount: number;
}> {
  return requestJson("/api/admin/test-queue-data/create", {
    method: "POST",
  });
}

export async function removeSharedTestQueueData(): Promise<{
  removedCount: number;
}> {
  return requestJson("/api/admin/test-queue-data/remove", {
    method: "POST",
  });
}

export async function saveSharedWorkflowPreferences(
  preferences: WorkflowPreferences,
): Promise<WorkflowPreferences> {
  const response = await requestJson<{ preferences: WorkflowPreferences }>(
    "/api/workflow/preferences",
    {
      method: "POST",
      body: { preferences },
    },
  );

  return response.preferences;
}

export async function saveSharedSlaSettings(
  slaSettings: SlaSettings,
): Promise<SlaSettings> {
  const response = await requestJson<{ slaSettings: SlaSettings }>(
    "/api/workflow/sla-settings",
    {
      method: "POST",
      body: { slaSettings },
    },
  );

  return response.slaSettings;
}

export async function upsertSharedCustomer(
  customer: SavedCustomerDraft,
): Promise<SavedCustomer[]> {
  const response = await requestJson<{ customers: SavedCustomer[] }>(
    "/api/workflow/customers/upsert",
    {
      method: "POST",
      body: { customer },
    },
  );

  return response.customers;
}

export async function deleteSharedCustomer(customerId: string): Promise<SavedCustomer[]> {
  const response = await requestJson<{ customers: SavedCustomer[] }>(
    "/api/workflow/customers/delete",
    {
      method: "POST",
      body: { customerId },
    },
  );

  return response.customers;
}

export async function clearSharedCustomers(): Promise<SavedCustomer[]> {
  const response = await requestJson<{ customers: SavedCustomer[] }>(
    "/api/workflow/customers/clear",
    {
      method: "POST",
    },
  );

  return response.customers;
}

export async function saveSharedThreadState(
  threadId: string,
  threadState: ThreadWorkflowState,
): Promise<ThreadWorkflowState> {
  const response = await requestJson<{ threadState: ThreadWorkflowState }>(
    "/api/workflow/thread-state",
    {
      method: "POST",
      body: { threadId, threadState },
    },
  );

  return response.threadState;
}

export async function loadSharedThreadPresence(): Promise<
  Record<string, ThreadPresenceRecord[]>
> {
  const response = await requestJson<{
    threadPresence: Record<string, ThreadPresenceRecord[]>;
  }>("/api/workflow/thread-presence");

  return response.threadPresence;
}

export async function upsertSharedThreadPresence(
  threadId: string,
  presenceType: ThreadPresenceType,
): Promise<Record<string, ThreadPresenceRecord[]>> {
  const response = await requestJson<{
    threadPresence: Record<string, ThreadPresenceRecord[]>;
  }>("/api/workflow/thread-presence", {
    method: "POST",
    body: { threadId, presenceType },
  });

  return response.threadPresence;
}

export async function clearSharedThreadPresence(
  threadId?: string,
): Promise<Record<string, ThreadPresenceRecord[]>> {
  const response = await requestJson<{
    threadPresence: Record<string, ThreadPresenceRecord[]>;
  }>("/api/workflow/thread-presence/clear", {
    method: "POST",
    body: { threadId },
  });

  return response.threadPresence;
}

export async function createSharedWorkflowBackup(): Promise<{ backupPath: string }> {
  return requestJson("/api/admin/backup", {
    method: "POST",
  });
}

export async function loadSharedUsers(): Promise<{
  users: ManagedUser[];
}> {
  return requestJson("/api/admin/users");
}

export async function createSharedUser(payload: ManagedUserDraft): Promise<{
  users: ManagedUser[];
}> {
  return requestJson("/api/admin/users/create", {
    method: "POST",
    body: payload,
  });
}

export async function updateSharedUserAccess(payload: {
  userId: string;
  displayName?: string;
  initials?: string;
  role?: RepProfile["role"];
  locationId?: string;
  isActive?: boolean;
}): Promise<{
  users: ManagedUser[];
}> {
  return requestJson("/api/admin/users/update", {
    method: "POST",
    body: payload,
  });
}

export async function deactivateSharedUser(userId: string): Promise<{
  users: ManagedUser[];
}> {
  return requestJson("/api/admin/users/deactivate", {
    method: "POST",
    body: { userId },
  });
}

function getThreadFallbackKey(item: ProcessedEmail): string {
  if (item.customerMatch?.customerId) {
    return `customer:${item.customerMatch.customerId}`;
  }

  return `sender:${item.email.senderEmail.trim().toLowerCase()}`;
}

export async function syncSharedThreadBindings(
  items: ProcessedEmail[],
): Promise<Record<string, string>> {
  const response = await requestJson<{ bindings: Record<string, string> }>(
    "/api/workflow/thread-bindings/sync",
    {
      method: "POST",
      body: {
        items: items.map((item) => ({
          emailId: item.email.id,
          conversationId: item.email.conversationId,
          fallbackKey: getThreadFallbackKey(item),
        })),
      },
    },
  );

  return response.bindings;
}

export function getSharedWorkflowErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").trim();

    if (message) {
      return message;
    }
  }

  return fallbackMessage;
}

export function isStaleSharedWorkflowSessionError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      STALE_SHARED_SESSION_ERROR_CODES.has(String((error as { code?: unknown }).code ?? "")),
  );
}
