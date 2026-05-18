import {
  ASSIGNED_REP_MISSING_LABEL,
  getAssignmentRecordFromResolution,
  resolveCanonicalAssignment,
} from "./assignmentLogic";
import {
  buildThreadSla,
  getDefaultSlaSettings,
  getElapsedMinutes,
  getPrimarySlaDisplayState,
  isThreadSlaAtRisk,
  isThreadSlaBreached,
} from "./sla";
import { getActiveThreadPresence, isThreadPresenceActive } from "./threadPresence";
import { createBaseWorkflowThreads, getSenderThreadGroupKey } from "./threadGrouping";
import { canAccessLocation, normalizeLocationId } from "./locations";
import { getCustomerPrimaryOwnerId, getEmailDomain } from "./customerSettings";
import { applyCustomerPriorityToEmails } from "./customerMatching";
import type {
  AssignmentResolution,
  ProcessedEmail,
  QueueScopeView,
  RepProfile,
  SavedCustomer,
  SlaSettings,
  SupervisorQuickFilter,
  ThreadWorkflowState,
  WorkflowState,
  WorkflowStatusFilter,
  WorkflowThread,
} from "../types/actionDesk";

const SHARED_CSR_MAILBOX_EMAILS = new Set(["ecomcsr@apexpress.com"]);
const INTERNAL_CSR_DOMAINS = new Set([
  "actiondesk.local",
  "apexpress.com",
  "worldpackusa.com",
]);

export type WorkflowMetrics = {
  totalOpen: number;
  unassigned: number;
  avgWaitMinutes: number;
  oldestOpenMinutes: number;
  breached: number;
  atRisk: number;
  resolvedToday: number;
  snoozed: number;
};

export type RepWorkloadSummary = {
  repId: string;
  repName: string;
  repEmail: string;
  repRole: RepProfile["role"];
  openThreadCount: number;
  waitingOnCustomerCount: number;
  breachedCount: number;
  oldestOpenMinutes: number;
  resolvedTodayCount: number;
};

export type WorkflowThreadNavigation = {
  currentIndex: number;
  total: number;
  previousEmailId?: string;
  nextEmailId?: string;
};

export type RepGroupedQueueSection = {
  groupId: string;
  repId?: string;
  repName: string;
  threads: WorkflowThread[];
  openThreadCount: number;
  waitingOnCustomerCount: number;
  overSlaCount: number;
  oldestOpenMinutes: number;
};

export function getWorkloadVisibleReps(
  reps: RepProfile[],
  currentUser: RepProfile,
): RepProfile[] {
  const activeCsrs = reps.filter(
    (rep) => rep.role === "rep" && rep.isActive !== false,
  );

  if (currentUser.role === "admin") {
    return activeCsrs;
  }

  if (currentUser.role !== "supervisor") {
    return [];
  }

  const supervisorLocationId = normalizeLocationId(currentUser.locationId);

  if (!supervisorLocationId) {
    return [];
  }

  return activeCsrs.filter(
    (rep) => normalizeLocationId(rep.locationId) === supervisorLocationId,
  );
}

function getTimestamp(value?: string): number {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getEmailActivityTimestamp(item: ProcessedEmail): number {
  return getTimestamp(item.email.sentAt ?? item.email.receivedAt);
}

function isInternalCsrEmail(email: unknown, reps: RepProfile[]): boolean {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return false;
  }

  if (SHARED_CSR_MAILBOX_EMAILS.has(normalizedEmail)) {
    return true;
  }

  if (reps.some((rep) => normalizeEmail(rep.email) === normalizedEmail)) {
    return true;
  }

  return INTERNAL_CSR_DOMAINS.has(getEmailDomain(normalizedEmail));
}

function hasExternalRecipient(item: ProcessedEmail, reps: RepProfile[]): boolean {
  return [...(item.email.toRecipients ?? []), ...(item.email.ccRecipients ?? [])].some(
    (recipient) => !isInternalCsrEmail(recipient, reps),
  );
}

function getFirstDetectedCsrReplyAt(
  items: ProcessedEmail[],
  reps: RepProfile[],
): string | undefined {
  const firstExternalCustomerTimestamp = Math.min(
    ...items
      .filter((item) => !isInternalCsrEmail(item.email.senderEmail, reps))
      .map((item) => getTimestamp(item.email.receivedAt))
      .filter((timestamp) => timestamp > 0),
  );
  const hasExternalCustomerMessage = Number.isFinite(firstExternalCustomerTimestamp);
  const replyCandidates = items
    .filter((item) => {
      if (!isInternalCsrEmail(item.email.senderEmail, reps)) {
        return false;
      }

      if (hasExternalRecipient(item, reps)) {
        return true;
      }

      if (!hasExternalCustomerMessage) {
        return false;
      }

      return getEmailActivityTimestamp(item) >= firstExternalCustomerTimestamp;
    })
    .sort((left, right) => getEmailActivityTimestamp(left) - getEmailActivityTimestamp(right));

  return replyCandidates[0]?.email.sentAt ?? replyCandidates[0]?.email.receivedAt;
}

function isThreadResolved(thread: WorkflowThread): boolean {
  return thread.status === "resolved";
}

function isThreadSnoozed(thread: WorkflowThread): boolean {
  return thread.isSnoozed && !isThreadResolved(thread);
}

function isThreadOpen(thread: WorkflowThread): boolean {
  return !isThreadResolved(thread);
}

function isResolvedToday(thread: WorkflowThread, now = new Date()): boolean {
  if (!isThreadResolved(thread)) {
    return false;
  }

  const candidateDates = [
    thread.resolvedAt,
    thread.replyLog[thread.replyLog.length - 1]?.createdAt ||
      thread.latestActivityAt,
    thread.updatedAt,
  ].filter((value): value is string => Boolean(value));

  return candidateDates.some((value) => {
    const date = new Date(value);
    return date.toDateString() === now.toDateString();
  });
}

function matchesStatusFilter(
  thread: WorkflowThread,
  statusFilter: WorkflowStatusFilter,
): boolean {
  if (statusFilter === "all") {
    return true;
  }

  if (statusFilter === "open") {
    return thread.status !== "resolved";
  }

  return thread.status === statusFilter;
}

function selectFallbackThreadState(
  workflowState: WorkflowState,
  thread: ReturnType<typeof createBaseWorkflowThreads>[number],
): ThreadWorkflowState | undefined {
  const fallbackStates = thread.items
    .map((item) => workflowState.threadStates[getSenderThreadGroupKey(item.email.senderEmail)])
    .filter((threadState): threadState is ThreadWorkflowState => Boolean(threadState));

  if (fallbackStates.length === 0) {
    return undefined;
  }

  return [...fallbackStates].sort(
    (left, right) => getTimestamp(right.updatedAt) - getTimestamp(left.updatedAt),
  )[0];
}

function selectThreadPresenceRecords(
  workflowState: WorkflowState,
  thread: ReturnType<typeof createBaseWorkflowThreads>[number],
) {
  const directPresenceRecords = workflowState.threadPresence[thread.id];

  if (directPresenceRecords && directPresenceRecords.length > 0) {
    return directPresenceRecords;
  }

  return thread.items.flatMap(
    (item) =>
      workflowState.threadPresence[getSenderThreadGroupKey(item.email.senderEmail)] ?? [],
  );
}

export function getAvailableQueueScopeViews(currentRep: RepProfile): QueueScopeView[] {
  return currentRep.role === "supervisor" || currentRep.role === "admin"
    ? ["my_queue", "unassigned", "all_emails"]
    : ["my_queue", "unassigned"];
}

export function canViewSupervisorVisibility(currentRep?: RepProfile | null): boolean {
  return currentRep?.role === "supervisor" || currentRep?.role === "admin";
}

export function sanitizeQueueScopeView(
  queueScopeView: QueueScopeView,
  currentRep: RepProfile,
): QueueScopeView {
  return getAvailableQueueScopeViews(currentRep).includes(queueScopeView)
    ? queueScopeView
    : "my_queue";
}

function matchesQueueScope(
  thread: WorkflowThread,
  queueScopeView: QueueScopeView,
  currentRep: RepProfile,
): boolean {
  const safeQueueScopeView = sanitizeQueueScopeView(queueScopeView, currentRep);

  if (safeQueueScopeView === "all_emails") {
    return true;
  }

  if (safeQueueScopeView === "unassigned") {
    return thread.assignmentResolution.assignmentStatus === "unassigned";
  }

  return (
    thread.assignmentResolution.assignedRepIds.includes(currentRep.id) ||
    thread.assignmentResolution.assignmentStatus === "unassigned"
  );
}

function matchesLocationScope(thread: WorkflowThread, currentRep: RepProfile): boolean {
  return canAccessLocation(currentRep, thread.locationId);
}

function resolveCustomerLocation(
  item: ProcessedEmail,
  customers: SavedCustomer[],
  reps: RepProfile[],
): string | undefined {
  const matchedCustomer = item.customerMatch?.customerId
    ? customers.find((customer) => customer.id === item.customerMatch?.customerId)
    : undefined;

  if (matchedCustomer?.locationId) {
    return matchedCustomer.locationId;
  }

  const primaryOwnerRepId = matchedCustomer
    ? getCustomerPrimaryOwnerId(matchedCustomer)
    : undefined;
  const ownerRep = primaryOwnerRepId
    ? reps.find((rep) => rep.id === primaryOwnerRepId)
    : undefined;

  return ownerRep?.locationId ?? item.email.locationId;
}

function applyCustomerSettingsToFeedItems(
  items: ProcessedEmail[],
  customers: SavedCustomer[],
): ProcessedEmail[] {
  const safeCustomers = Array.isArray(customers) ? customers : [];

  if (safeCustomers.length === 0) {
    return items;
  }

  try {
    return applyCustomerPriorityToEmails(items, safeCustomers);
  } catch (error) {
    console.error("EMAIL PROCESSING FAILED", {
      failureReason: "customer_match_failed",
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    return items;
  }
}

function getFallbackAssignmentResolution(): AssignmentResolution {
  return {
    assignmentStatus: "unassigned",
    assignmentSource: "none",
    assignedRepIds: [],
    assignedRepNames: [],
    matchType: "none",
  };
}

function logAssignmentLookupFailure(
  thread: Pick<WorkflowThread, "representativeItem">,
  error: unknown,
) {
  console.error("EMAIL PROCESSING FAILED", {
    emailId: thread.representativeItem.email.id,
    subject: thread.representativeItem.email.subject,
    senderName: thread.representativeItem.email.senderName,
    senderEmail: thread.representativeItem.email.senderEmail,
    receivedAt: thread.representativeItem.email.receivedAt,
    failureReason: "assignment_lookup_failed",
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error),
    errorStack: error instanceof Error ? error.stack : undefined,
  });
}

function matchesSearch(thread: WorkflowThread, searchQuery: string): boolean {
  const query = searchQuery.trim().toLowerCase();

  if (!query) {
    return true;
  }

  return thread.items.some((item) => {
    const senderName = item.email.senderName.toLowerCase();
    const senderEmail = item.email.senderEmail.toLowerCase();
    const subject = item.email.subject.toLowerCase();
    const body = item.email.body.toLowerCase();

    return (
      senderName.includes(query) ||
      senderEmail.includes(query) ||
      subject.includes(query) ||
      body.includes(query)
    );
  });
}

function getSlaSortRank(thread: WorkflowThread): number {
  const state = getPrimarySlaDisplayState(thread.sla.current.state);

  if (state === "breached") {
    return 0;
  }

  if (state === "at_risk") {
    return 1;
  }

  return 2;
}

function getSlaUrgencyRatio(thread: WorkflowThread): number {
  if (thread.sla.current.targetMinutes <= 0) {
    return 0;
  }

  return thread.sla.current.elapsedMinutes / thread.sla.current.targetMinutes;
}

export function buildWorkflowThreads(options: {
  items: ProcessedEmail[];
  workflowState: WorkflowState;
  customers: SavedCustomer[];
  slaSettings?: SlaSettings;
  now?: Date;
}): WorkflowThread[] {
  const {
    items,
    workflowState,
    customers,
    slaSettings = getDefaultSlaSettings(),
    now = new Date(),
  } = options;
  const assignmentLoadByRepId = new Map<string, number>();
  const itemsMatchedToCustomerSettings = applyCustomerSettingsToFeedItems(
    items,
    customers,
  );

  return createBaseWorkflowThreads(itemsMatchedToCustomerSettings)
    .map((thread) => {
      const threadState =
        workflowState.threadStates[thread.id] ??
        selectFallbackThreadState(workflowState, thread);
      let assignmentResolution: AssignmentResolution;

      try {
        assignmentResolution = resolveCanonicalAssignment({
          threadState,
          representativeItem: thread.representativeItem,
          customers,
          reps: workflowState.reps,
        });
      } catch (error) {
        logAssignmentLookupFailure(thread, error);
        assignmentResolution = getFallbackAssignmentResolution();
      }
      const currentAssignment = getAssignmentRecordFromResolution(
        assignmentResolution,
        thread.representativeItem,
        threadState,
      );
      if (assignmentResolution.primaryRepId) {
        assignmentLoadByRepId.set(
          assignmentResolution.primaryRepId,
          (assignmentLoadByRepId.get(assignmentResolution.primaryRepId) ?? 0) + 1,
        );
      }
      const assignedRep = workflowState.reps.find(
        (rep) => rep.id === assignmentResolution.primaryRepId,
      );
      const locationId =
        resolveCustomerLocation(thread.representativeItem, customers, workflowState.reps) ??
        assignedRep?.locationId ??
        thread.items.find((item) => item.email.locationId)?.email.locationId;
      const isSnoozed =
        Boolean(threadState?.snooze) &&
        Date.parse(threadState.snooze!.until) > now.getTime();
      const sortedReplyLog = [...(threadState?.replyLog ?? [])].sort(
        (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
      );
      const firstLoggedReplyAt = sortedReplyLog[0]?.createdAt;
      const detectedFirstReplyAt = getFirstDetectedCsrReplyAt(
        thread.items,
        workflowState.reps,
      );
      const firstReplyAt = firstLoggedReplyAt ?? detectedFirstReplyAt;
      const latestReplyAt =
        sortedReplyLog[sortedReplyLog.length - 1]?.createdAt ??
        detectedFirstReplyAt;
      const latestActivityAt =
        getTimestamp(latestReplyAt) > getTimestamp(thread.latestReceivedAt)
          ? latestReplyAt!
          : thread.latestReceivedAt;
      const firstReplySource: WorkflowThread["firstReplySource"] = firstLoggedReplyAt
        ? "logged"
        : detectedFirstReplyAt
          ? "thread"
          : undefined;
      const resolvedAt = threadState?.resolvedAt;
      const sla = buildThreadSla({
        receivedAt: thread.oldestReceivedAt,
        firstReplyAt,
        resolvedAt,
        settings: slaSettings,
        now,
      });
      const threadPresenceRecords = selectThreadPresenceRecords(
        workflowState,
        thread,
      );
      const activePresence = getActiveThreadPresence(
        threadPresenceRecords,
        { now, includeCurrentUser: true },
      );
      const activePresenceRecords = threadPresenceRecords.filter((presence) =>
        isThreadPresenceActive(presence, now),
      );

      return {
        ...thread,
        latestActivityAt,
        locationId,
        assignedRepId: assignmentResolution.primaryRepId,
        assignedRepName: assignmentResolution.primaryRepName,
        assignedRepInitials: assignedRep?.initials,
        customerAssignedRepIds: assignmentResolution.assignedRepIds,
        customerAssignedRepNames: assignmentResolution.assignedRepNames,
        customerAssignedRepInitials: assignmentResolution.assignedRepIds.map(
          (repId) =>
            workflowState.reps.find((rep) => rep.id === repId)?.initials ?? "",
        ),
        assignmentType: currentAssignment?.type,
        assignmentResolution,
        currentAssignment,
        assignmentHistory: threadState?.assignmentHistory ?? [],
        status: threadState?.status ?? "new",
        resolvedAt,
        notes: threadState?.notes ?? [],
        replyLog: threadState?.replyLog ?? [],
        snooze: threadState?.snooze,
        isSnoozed,
        noteCount: threadState?.notes.length ?? 0,
        replyCount: threadState?.replyLog.length ?? 0,
        activePresence,
        activePresenceRecords,
        slaMinutes: getElapsedMinutes(thread.oldestReceivedAt, now),
        firstReplyAt,
        firstReplySource,
        sla,
        updatedAt: threadState?.updatedAt,
        updatedByRepId: threadState?.updatedByRepId,
        updatedByRepName: threadState?.updatedByRepName,
      };
    })
    .sort((left, right) => {
      const leftResolved = isThreadResolved(left);
      const rightResolved = isThreadResolved(right);

      if (leftResolved !== rightResolved) {
        return leftResolved ? 1 : -1;
      }

      const leftSnoozed = isThreadSnoozed(left);
      const rightSnoozed = isThreadSnoozed(right);

      if (leftSnoozed !== rightSnoozed) {
        return leftSnoozed ? 1 : -1;
      }

      const leftSlaRank = getSlaSortRank(left);
      const rightSlaRank = getSlaSortRank(right);

      if (leftSlaRank !== rightSlaRank) {
        return leftSlaRank - rightSlaRank;
      }

      const leftSlaRatio = getSlaUrgencyRatio(left);
      const rightSlaRatio = getSlaUrgencyRatio(right);

      if (rightSlaRatio !== leftSlaRatio) {
        return rightSlaRatio - leftSlaRatio;
      }

      const priorityDifference =
        (right.representativeItem.result?.priorityScore ?? 0) -
        (left.representativeItem.result?.priorityScore ?? 0);

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return Date.parse(right.latestReceivedAt) - Date.parse(left.latestReceivedAt);
    });
}

export function filterWorkflowThreads(options: {
  threads: WorkflowThread[];
  currentRep: RepProfile;
  queueScopeView: QueueScopeView;
  statusFilter: WorkflowStatusFilter;
  searchQuery: string;
  bypassAssignmentScope?: boolean;
}): WorkflowThread[] {
  const {
    threads,
    currentRep,
    queueScopeView,
    statusFilter,
    searchQuery,
    bypassAssignmentScope = false,
  } = options;

  return threads.filter(
    (thread) =>
      (bypassAssignmentScope ||
        matchesQueueScope(thread, queueScopeView, currentRep)) &&
      matchesLocationScope(thread, currentRep) &&
      matchesStatusFilter(thread, statusFilter) &&
      matchesSearch(thread, searchQuery),
  );
}

export function applySupervisorQuickFilter(options: {
  threads: WorkflowThread[];
  quickFilter: SupervisorQuickFilter;
  now?: Date;
}): WorkflowThread[] {
  const { threads, quickFilter, now = new Date() } = options;

  switch (quickFilter) {
    case "unassigned":
      return threads.filter(
        (thread) =>
          thread.assignmentResolution.assignmentStatus === "unassigned" &&
          isThreadOpen(thread),
      );
    case "over_sla":
      return threads.filter((thread) => isThreadOpen(thread) && isThreadSlaBreached(thread));
    case "waiting_on_customer":
      return threads.filter((thread) => thread.status === "waiting_on_customer");
    case "resolved_today":
      return threads.filter((thread) => isResolvedToday(thread, now));
    case "all":
    default:
      return threads;
  }
}

export function getVisibleWorkflowThreads(
  threads: WorkflowThread[],
  showSnoozed: boolean,
): WorkflowThread[] {
  return showSnoozed ? threads : threads.filter((thread) => !thread.isSnoozed);
}

export function groupWorkflowThreadsByAssignedRep(options: {
  threads: WorkflowThread[];
  reps: RepProfile[];
  now?: Date;
}): RepGroupedQueueSection[] {
  const { threads, reps, now = new Date() } = options;
  const sectionMap = new Map<string, RepGroupedQueueSection>();

  for (const thread of threads) {
    const isUnassigned =
      thread.assignmentResolution.assignmentStatus === "unassigned";
    const primaryRepId = thread.assignmentResolution.primaryRepId;
    const rep = isUnassigned || !primaryRepId
      ? undefined
      : reps.find((candidate) => candidate.id === primaryRepId);

    if (!isUnassigned && !rep && thread.assignmentResolution.assignmentStatus !== "missing_rep") {
      continue;
    }

    const groupId = isUnassigned ? "unassigned" : primaryRepId!;
    const repName =
      rep?.name ||
      (isUnassigned ? "Unassigned" : ASSIGNED_REP_MISSING_LABEL);
    const existingSection = sectionMap.get(groupId);

    if (!existingSection) {
      sectionMap.set(groupId, {
        groupId,
        repId: isUnassigned ? undefined : primaryRepId,
        repName,
        threads: [thread],
        openThreadCount: isThreadOpen(thread) ? 1 : 0,
        waitingOnCustomerCount: thread.status === "waiting_on_customer" ? 1 : 0,
        overSlaCount: isThreadOpen(thread) && isThreadSlaBreached(thread) ? 1 : 0,
        oldestOpenMinutes: isThreadOpen(thread)
          ? getElapsedMinutes(thread.oldestReceivedAt, now)
          : 0,
      });
      continue;
    }

    existingSection.threads.push(thread);
    existingSection.openThreadCount += isThreadOpen(thread) ? 1 : 0;
    existingSection.waitingOnCustomerCount +=
      thread.status === "waiting_on_customer" ? 1 : 0;
    existingSection.overSlaCount += isThreadOpen(thread) && isThreadSlaBreached(thread) ? 1 : 0;
    existingSection.oldestOpenMinutes = Math.max(
      existingSection.oldestOpenMinutes,
      isThreadOpen(thread) ? getElapsedMinutes(thread.oldestReceivedAt, now) : 0,
    );
  }

  return Array.from(sectionMap.values()).sort((left, right) => {
    if (left.groupId === "unassigned" && right.groupId !== "unassigned") {
      return -1;
    }

    if (right.groupId === "unassigned" && left.groupId !== "unassigned") {
      return 1;
    }

    if (right.openThreadCount !== left.openThreadCount) {
      return right.openThreadCount - left.openThreadCount;
    }

    if (right.overSlaCount !== left.overSlaCount) {
      return right.overSlaCount - left.overSlaCount;
    }

    if (right.oldestOpenMinutes !== left.oldestOpenMinutes) {
      return right.oldestOpenMinutes - left.oldestOpenMinutes;
    }

    return left.repName.localeCompare(right.repName);
  });
}

export function flattenRepGroupedQueueSections(
  sections: RepGroupedQueueSection[],
): WorkflowThread[] {
  return sections.flatMap((section) => section.threads);
}

export function getWorkflowThreadNavigation(
  threads: WorkflowThread[],
  selectedEmailId?: string,
): WorkflowThreadNavigation {
  const currentIndex = threads.findIndex((thread) =>
    thread.items.some((item) => item.email.id === selectedEmailId),
  );

  if (currentIndex < 0) {
    return {
      currentIndex,
      total: threads.length,
    };
  }

  return {
    currentIndex,
    total: threads.length,
    previousEmailId:
      currentIndex > 0
        ? threads[currentIndex - 1]?.representativeItem.email.id
        : undefined,
    nextEmailId:
      currentIndex < threads.length - 1
        ? threads[currentIndex + 1]?.representativeItem.email.id
        : undefined,
  };
}

export function calculateWorkflowMetrics(options: {
  visibleThreads: WorkflowThread[];
  scopedThreads?: WorkflowThread[];
  now?: Date;
}): WorkflowMetrics {
  const {
    visibleThreads,
    scopedThreads = visibleThreads,
    now = new Date(),
  } = options;
  const openThreads = visibleThreads.filter((thread) => isThreadOpen(thread));
  const resolvedToday = visibleThreads.filter((thread) =>
    isResolvedToday(thread, now),
  ).length;
  const avgWaitMinutes =
    openThreads.length > 0
      ? Math.round(
          openThreads.reduce((total, thread) => total + thread.slaMinutes, 0) /
            openThreads.length,
        )
      : 0;

  return {
    totalOpen: openThreads.length,
    unassigned: openThreads.filter(
      (thread) => thread.assignmentResolution.assignmentStatus === "unassigned",
    ).length,
    avgWaitMinutes,
    oldestOpenMinutes:
      openThreads.length > 0
        ? Math.max(...openThreads.map((thread) => thread.slaMinutes))
        : 0,
    breached: openThreads.filter((thread) => isThreadSlaBreached(thread)).length,
    atRisk: openThreads.filter((thread) => isThreadSlaAtRisk(thread)).length,
    resolvedToday,
    snoozed: scopedThreads.filter((thread) => isThreadSnoozed(thread)).length,
  };
}

export function calculateSupervisorSummaryMetrics(options: {
  visibleThreads: WorkflowThread[];
  scopedThreads?: WorkflowThread[];
  statusFilter?: WorkflowStatusFilter;
  now?: Date;
}): WorkflowMetrics {
  const {
    visibleThreads,
    scopedThreads = visibleThreads,
    statusFilter = "open",
    now = new Date(),
  } = options;
  const unresolvedThreads = visibleThreads.filter((thread) => isThreadOpen(thread));
  const countableThreads =
    statusFilter === "resolved" ? visibleThreads : unresolvedThreads;
  const avgWaitMinutes =
    unresolvedThreads.length > 0
      ? Math.round(
          unresolvedThreads.reduce(
            (total, thread) => total + getElapsedMinutes(thread.oldestReceivedAt, now),
            0,
          ) / unresolvedThreads.length,
        )
      : 0;

  return {
    totalOpen: countableThreads.length,
    unassigned: unresolvedThreads.filter(
      (thread) => thread.assignmentResolution.assignmentStatus === "unassigned",
    ).length,
    avgWaitMinutes,
    oldestOpenMinutes:
      unresolvedThreads.length > 0
        ? Math.max(
            ...unresolvedThreads.map((thread) =>
              getElapsedMinutes(thread.oldestReceivedAt, now),
            ),
          )
        : 0,
    breached: unresolvedThreads.filter((thread) => isThreadSlaBreached(thread)).length,
    atRisk: unresolvedThreads.filter((thread) => isThreadSlaAtRisk(thread)).length,
    resolvedToday: scopedThreads.filter((thread) => isResolvedToday(thread, now)).length,
    snoozed: scopedThreads.filter((thread) => isThreadSnoozed(thread)).length,
  };
}

export function calculateRepWorkloadSummaries(options: {
  threads: WorkflowThread[];
  reps: RepProfile[];
  now?: Date;
}): RepWorkloadSummary[] {
  const { threads, reps, now = new Date() } = options;

  return reps
    .filter((rep) => rep.isActive !== false)
    .map((rep) => {
      const assignedThreads = threads.filter(
        (thread) => thread.assignmentResolution.assignedRepIds.includes(rep.id),
      );
      const openThreads = assignedThreads.filter((thread) => isThreadOpen(thread));

      return {
        repId: rep.id,
        repName: rep.name,
        repEmail: rep.email,
        repRole: rep.role,
        openThreadCount: openThreads.length,
        waitingOnCustomerCount: openThreads.filter(
          (thread) => thread.status === "waiting_on_customer",
        ).length,
        breachedCount: openThreads.filter((thread) => isThreadSlaBreached(thread)).length,
        oldestOpenMinutes:
          openThreads.length > 0
            ? Math.max(
                ...openThreads.map((thread) =>
                  getElapsedMinutes(thread.oldestReceivedAt, now),
                ),
              )
            : 0,
        resolvedTodayCount: assignedThreads.filter((thread) =>
          isResolvedToday(thread, now),
        ).length,
      };
    })
    .sort((left, right) => {
      if (right.openThreadCount !== left.openThreadCount) {
        return right.openThreadCount - left.openThreadCount;
      }

      if (right.oldestOpenMinutes !== left.oldestOpenMinutes) {
        return right.oldestOpenMinutes - left.oldestOpenMinutes;
      }

      return left.repName.localeCompare(right.repName);
    });
}
