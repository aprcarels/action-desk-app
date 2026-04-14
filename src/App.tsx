import { useEffect, useRef, useState } from "react";
import { QueueApplicationService } from "./app/queueApplicationService";
import {
  runPersistedMarkDone,
  runPersistedRecomputePriority,
  runPersistedUpdateWorkStatus,
} from "./app/persistedQueueActions";
import {
  applyPersistedQueueProjection,
  runPersistedInitialLoad,
  runPersistedLoadMore,
} from "./app/persistedQueueLoadHelpers";
import {
  createFailedProcessedEmail,
  createPendingProcessedEmail,
  createProcessedEmail,
  filterProcessedEmails,
  getIntentOptions,
  processEmailsProgressively,
  replaceProcessedEmail,
  refreshProcessedEmailReplyDraft,
  sortProcessedEmails,
} from "./app/processEmails";
import {  refreshProcessedQueue,
} from "./app/persistedQueueUiHelpers";
import { runActionDesk } from "./app/runActionDesk";
import { EmailDetail } from "./components/EmailDetail";
import { InboxQueue } from "./components/InboxQueue";
import { deriveIssueType, getIssueTypeLabel, type IssueType } from "./domain/issueType";
import { buildAnalysisInput } from "./services/analysisInput";
import { formatCaseForReview, formatRawCaseJson } from "./services/caseReviewCopy";
import { shouldShowInCustomerServiceQueue } from "./services/customerServiceMail";
import { generateReply } from "./services/generateReply";
import { loadInboxQueue } from "./services/loadInboxQueue";
import { PILOT_ORDER_DATA_MESSAGE, isPilotModeEnabled } from "./services/pilotMode";
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
import { getCachedProcessedEmail, setCachedProcessedEmail } from "./services/processedEmailCache";
import { isPersistedQueueEnabled } from "./services/persistedQueueFeature";
import type {
  EmailItem,
  IntentCode,
  PilotQueueItemState,
  PilotQueueView,
  PilotUsefulnessFeedback,
  ProcessedEmail,
} from "./types/actionDesk";

const SIGN_IN_REQUIRED_MESSAGE = "Sign in to Microsoft to load your live inbox.";

type TopIssue = {
  code: IssueType;
  label: string;
  count: number;
};

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

    const leftPriority = left.result?.priorityScore ?? 0;
    const rightPriority = right.result?.priorityScore ?? 0;

    if (Math.abs(leftPriority - rightPriority) >= 15) {
      return 0;
    }

    const leftAge = getQueueAgeInfo({
      receivedAt: left.email.receivedAt,
      pilotItemState: pilotMode ? getPilotItemStateForEmail(pilotItemStates, left.email.id) : undefined,
      now,
    });
    const rightAge = getQueueAgeInfo({
      receivedAt: right.email.receivedAt,
      pilotItemState: pilotMode ? getPilotItemStateForEmail(pilotItemStates, right.email.id) : undefined,
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
  const [queueItems, setQueueItems] = useState<ProcessedEmail[]>([]);
  const [queueView, setQueueView] = useState<"customer_service" | "all_inbox">("customer_service");
  const [showDetailView, setShowDetailView] = useState(false);
  const [pilotItemStates, setPilotItemStates] = useState<PilotQueueStateMap>(() =>
    pilotMode ? loadPilotQueueStateMap() : {},
  );
  const [pilotQueueView, setPilotQueueView] = useState<PilotQueueView>("active");
  const [selectedEmailId, setSelectedEmailId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [isLoadingInbox, setIsLoadingInbox] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inboxLoadError, setInboxLoadError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | undefined>(undefined);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [replyActionError, setReplyActionError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<"idle" | "success" | "error">("idle");
  const [caseCopyFeedback, setCaseCopyFeedback] = useState<"idle" | "success" | "error">("idle");
  const [rawCaseCopyFeedback, setRawCaseCopyFeedback] = useState<"idle" | "success" | "error">("idle");
  const [regeneratingReply, setRegeneratingReply] = useState(false);
  const [retryingEmailId, setRetryingEmailId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [intentFilter, setIntentFilter] = useState<IntentCode | "all">("all");
  const [showProblemsOnly, setShowProblemsOnly] = useState(false);
  const [activeIssueFilter, setActiveIssueFilter] = useState<TopIssue["code"] | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const copyFeedbackTimeoutRef = useRef<number | null>(null);
  const caseCopyFeedbackTimeoutRef = useRef<number | null>(null);
  const rawCaseCopyFeedbackTimeoutRef = useRef<number | null>(null);
  const processingStatusTimeoutRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const lastFocusRefreshAtRef = useRef(0);
  const nextInboxLoadInteractiveRef = useRef(false);
  const queueApplicationServiceRef = useRef<QueueApplicationService | null>(null);

  function getQueueApplicationService(): QueueApplicationService {
    if (!queueApplicationServiceRef.current) {
      queueApplicationServiceRef.current = new QueueApplicationService();
    }

    return queueApplicationServiceRef.current;
  }

  function resetFeedbackWithDelay(
    setFeedback: React.Dispatch<React.SetStateAction<"idle" | "success" | "error">>,
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

      if (!isMountedRef.current || processedIds.has(cachedItem.email.id)) {
        continue;
      }

      settledCount += 1;
      cachedProcessedCount += 1;
      processedIds.add(cachedItem.email.id);
      setQueueItems((currentItems) => {
        const withoutDuplicate = currentItems.filter(
          (item) => item.email.id !== cachedItem.email.id,
        );

        return sortProcessedEmails([...withoutDuplicate, cachedItem]);
      });
      setProcessingStatus(
        `${options?.statusPrefix ?? "Processing inbox emails"}: ${settledCount} of ${inboxEmails.length} completed.`,
      );
      if (!options?.append) {
        setSelectedEmailId((currentSelectedEmailId) =>
          currentSelectedEmailId ?? cachedItem.email.id,
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
        if (!isMountedRef.current || processedIds.has(processedItem.email.id)) {
          return;
        }

        settledCount += 1;
        processedIds.add(processedItem.email.id);
        if (processedItem.status === "processed") {
          setCachedProcessedEmail(processedItem);
        }
        setQueueItems((currentItems) => {
          const withoutDuplicate = currentItems.filter(
            (item) => item.email.id !== processedItem.email.id,
          );

          return sortProcessedEmails([...withoutDuplicate, processedItem]);
        });
        setProcessingStatus(
          `${options?.statusPrefix ?? "Processing inbox emails"}: ${settledCount} of ${inboxEmails.length} completed.`,
        );
        if (!options?.append) {
          setSelectedEmailId((currentSelectedEmailId) =>
            currentSelectedEmailId ?? processedItem.email.id,
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
    isMountedRef.current = true;

    let isMounted = true;

    async function loadQueue() {
      const shouldUseInteractiveAuth = nextInboxLoadInteractiveRef.current;
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

      let inboxEmails: EmailItem[] = [];

            try {
        if (persistedQueueEnabled) {
          const loadResult = await runPersistedInitialLoad({
            service: getQueueApplicationService(),
            interactiveAuth: shouldUseInteractiveAuth,
            setQueueItems,
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
        inboxEmails = inboxResult.items;

        if (!isMounted) {
          return;
        }

        setLastLoadedAt(
          new Date().toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          }),
        );
        setNextCursor(inboxResult.nextCursor);
        setIsLoadingInbox(false);

        if (inboxEmails.length === 0) {
          setProcessingStatus(null);
          return;
        }

        setProcessingStatus("Processing inbox emails and generating AI analysis.");
      } catch (error) {
        if (isMounted) {
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
        return;
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }

      try {
        const { processedCount, failedCount } = await processInboxEmailBatch(inboxEmails);

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
      } catch {
        if (isMounted) {
          setQueueItems([]);
          setSelectedEmailId(undefined);
          setLoadError("The inbox queue could not be processed. Please refresh and try again.");
          setProcessingStatus(null);
        }
      }
    }

    void loadQueue();

    return () => {
      isMounted = false;
      isMountedRef.current = false;
    };
  }, [reloadToken, persistedQueueEnabled]);

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

  function handleSetPilotWorkflowStatus(emailId: string, workflowStatus: PilotQueueItemState["workflowStatus"]) {
    updatePilotQueueState((current) => setPilotWorkflowStatus(current, emailId, workflowStatus));
  }

  function handleSnoozeUntilTomorrow(emailId: string) {
    updatePilotQueueState((current) => snoozePilotQueueItemUntilTomorrow(current, emailId));
  }

  function handleSetPilotUsefulness(emailId: string, usefulness: PilotUsefulnessFeedback) {
    updatePilotQueueState((current) => setPilotUsefulnessFeedback(current, emailId, usefulness));
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
      resetFeedbackWithDelay(setCopyFeedback, copyFeedbackTimeoutRef, "success");
    } catch {
      resetFeedbackWithDelay(setCopyFeedback, copyFeedbackTimeoutRef, "error");
    }
  }

  async function handleCopyCaseForReview() {
    if (!selectedItem) {
      return;
    }

    if (!navigator.clipboard?.writeText) {
      resetFeedbackWithDelay(setCaseCopyFeedback, caseCopyFeedbackTimeoutRef, "error");
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
      resetFeedbackWithDelay(setCaseCopyFeedback, caseCopyFeedbackTimeoutRef, "success");
    } catch {
      resetFeedbackWithDelay(setCaseCopyFeedback, caseCopyFeedbackTimeoutRef, "error");
    }
  }

  async function handleCopyRawCaseJson() {
    if (!selectedItem) {
      return;
    }

    if (!navigator.clipboard?.writeText) {
      resetFeedbackWithDelay(setRawCaseCopyFeedback, rawCaseCopyFeedbackTimeoutRef, "error");
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
      resetFeedbackWithDelay(setRawCaseCopyFeedback, rawCaseCopyFeedbackTimeoutRef, "success");
    } catch {
      resetFeedbackWithDelay(setRawCaseCopyFeedback, rawCaseCopyFeedbackTimeoutRef, "error");
    }
  }

  async function handleRegenerateReply() {
    const selectedItem = queueItems.find((item) => item.email.id === selectedEmailId);

    if (!selectedItem || selectedItem.status !== "processed" || !selectedItem.result || regeneratingReply) {
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
        const nextSelectedItem = nextItems.find((item) => item.email.id === selectedItem.email.id);

        if (nextSelectedItem?.status === "processed") {
          setCachedProcessedEmail(nextSelectedItem);
        }

        return nextItems;
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

    nextInboxLoadInteractiveRef.current = true;
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
        const queueResult = await getQueueApplicationService().loadAndProcessInbox({
          cursor: nextCursor,
          interactiveAuth: true,
        });

          applyPersistedQueueProjection({
          processedItems: queueResult.processedItems,
          nextCursor: queueResult.nextCursor,
          processingMessage: null,
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

      const { processedCount, failedCount } = await processInboxEmailBatch(newInboxEmails, {
        append: true,
        statusPrefix: "Processing additional inbox emails",
      });

      if (failedCount > 0) {
        setProcessingStatus(
          `Processed ${processedCount} of ${newInboxEmails.length} additional emails. ${failedCount} could not be analyzed.`,
        );
      } else {
        setProcessingStatus(null);
      }
    } catch (error) {
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
      replaceProcessedEmail(currentItems, emailId, createPendingProcessedEmail(failedItem.email)),
    );

    try {
      const nextResult = await runActionDesk(buildAnalysisInput(failedItem.email));
      const nextProcessedItem = createProcessedEmail(failedItem.email, nextResult);
      setCachedProcessedEmail(nextProcessedItem);
      setQueueItems((currentItems) =>
        replaceProcessedEmail(currentItems, emailId, nextProcessedItem),
      );
    } catch {
      setQueueItems((currentItems) =>
        replaceProcessedEmail(
          currentItems,
          emailId,
          createFailedProcessedEmail(failedItem.email, "This email could not be analyzed. Try retrying it."),
        ),
      );
    } finally {
      setRetryingEmailId(null);
    }
  }

  const intentOptions = getIntentOptions(queueItems);
  const filteredQueueItems = filterProcessedEmails(queueItems, {
    searchQuery,
    urgency: urgencyFilter,
    intent: intentFilter,
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
      ? activePilotQueueItems.filter((item) => shouldShowInCustomerServiceQueue(item))
      : activePilotQueueItems;
  const queueViewFilteredItems = pilotMode
    ? filteredQueueItems.filter((item) =>
        shouldShowPilotQueueItemInView(
          getPilotItemStateForEmail(pilotItemStates, item.email.id),
          pilotQueueView,
        ),
      )
    : filteredQueueItems;
  const visibleQueueItems = sortVisibleQueueItemsByAge(queueViewFilteredItems.filter((item) => {
    if (showProblemsOnly && (item.status !== "processed" || (item.result?.priorityScore ?? 0) < 70)) {
      return false;
    }

    if (activeIssueFilter && getIssueCode(item) !== activeIssueFilter) {
      return false;
    }

    return true;
  }), pilotItemStates, pilotMode);
  const queueSummary = {
    totalLoaded: queueScopeItems.length,
    highPriority: queueScopeItems.filter(
      (item) => item.status === "processed" && (item.result?.priorityScore ?? 0) >= 70,
    ).length,
    failed: queueScopeItems.filter((item) => item.status === "failed").length,
    processing: queueScopeItems.filter((item) => item.status === "pending").length,
  };

  const totalLoadedEmails = queueItems.length;
  const visibleEmailCount = visibleQueueItems.length;
  const hiddenEmailCount = Math.max(0, totalLoadedEmails - visibleEmailCount);
  const topIssues = Array.from(
    queueScopeItems.reduce((counts, item) => {
      const issueCode = getIssueCode(item);

      if (!issueCode || item.status !== "processed" || !item.result || item.result.priorityScore < 70) {
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
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 3);
  const selectedItem = visibleQueueItems.find((item) => item.email.id === selectedEmailId);
  const selectedPilotState = selectedItem
    ? getPilotItemStateForEmail(pilotItemStates, selectedItem.email.id)
    : undefined;
  const selectedReplyDraft = selectedItem?.result?.replyDraft.trim() ?? "";
  const hasReplyDraft = selectedReplyDraft.length > 0;
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    urgencyFilter !== "all" ||
    intentFilter !== "all" ||
    showProblemsOnly ||
    activeIssueFilter !== null ||
    queueView !== "customer_service" ||
    (pilotMode && pilotQueueView !== "active");
  const pilotEmptyStateMessage =
    pilotMode && import.meta.env.VITE_INBOX_SOURCE !== "api"
      ? "Pilot mode shows live inbox data only. Set VITE_INBOX_SOURCE=api to view live emails."
      : pilotMode
        ? "No live inbox emails are available right now. Seeded demo emails are hidden in pilot mode."
        : undefined;
  const needsMicrosoftSignIn = inboxLoadError === SIGN_IN_REQUIRED_MESSAGE;

  useEffect(() => {
    if (visibleQueueItems.length === 0) {
      setSelectedEmailId(undefined);
      setShowDetailView(false);
      return;
    }

    const hasSelectedVisible = visibleQueueItems.some((item) => item.email.id === selectedEmailId);

    if (!hasSelectedVisible) {
      setSelectedEmailId(visibleQueueItems[0].email.id);
      setCopyFeedback("idle");
      setCaseCopyFeedback("idle");
      setRawCaseCopyFeedback("idle");
      setReplyActionError(null);
    }
  }, [visibleQueueItems, selectedEmailId]);

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    margin: 0,
    backgroundColor: "#f3f6fb",
    color: "#1f2937",
    fontFamily: "Arial, sans-serif",
  };

  const shellStyle: React.CSSProperties = {
    maxWidth: "1280px",
    margin: "0 auto",
    padding: "32px 20px 40px",
    boxSizing: "border-box",
  };

  const headerStyle: React.CSSProperties = {
    marginBottom: "24px",
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

  const layoutStyle: React.CSSProperties = {
    display: "grid",
    gap: "20px",
    alignItems: "start",
  };

  const statusCardStyle: React.CSSProperties = {
    backgroundColor: "#ffffff",
    border: "1px solid #d8e1ec",
    borderRadius: "16px",
    padding: "20px",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  };

  const detailShellStyle: React.CSSProperties = {
    display: "grid",
    gap: "12px",
  };

  const backButtonStyle: React.CSSProperties = {
    border: "1px solid #cbd5e1",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    borderRadius: "10px",
    padding: "8px 12px",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
    justifySelf: "start",
  };

  if (isLoadingInbox && queueItems.length === 0) {
    return (
      <div style={pageStyle}>
        <div style={shellStyle}>
          <div style={headerStyle}>
            <h1 style={titleStyle}>Action Desk</h1>
            <p style={subtitleStyle}>{pilotMode ? "Live Inbox Pilot" : "Inbox Queue MVP"}</p>
          </div>

          <div style={statusCardStyle}>
            {processingStatus ?? "Loading inbox emails."}
          </div>
        </div>
      </div>
    );
  }

  if (inboxLoadError && queueItems.length === 0) {
    return (
      <div style={pageStyle}>
        <div style={shellStyle}>
          <div style={headerStyle}>
            <h1 style={titleStyle}>Action Desk</h1>
            <p style={subtitleStyle}>{pilotMode ? "Live Inbox Pilot" : "Inbox Queue MVP"}</p>
          </div>

          <div style={statusCardStyle}>
            <p style={{ margin: 0 }}>{inboxLoadError}</p>
            <button
              type="button"
              onClick={handleRefreshInbox}
              disabled={isLoadingInbox}
              style={{
                marginTop: "12px",
                border: "1px solid #cbd5e1",
                backgroundColor: isLoadingInbox ? "#e2e8f0" : "#ffffff",
                color: isLoadingInbox ? "#64748b" : "#0f172a",
                borderRadius: "10px",
                padding: "8px 12px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: isLoadingInbox ? "not-allowed" : "pointer",
              }}
            >
              {isLoadingInbox
                ? "Loading Inbox..."
                : needsMicrosoftSignIn
                  ? "Sign In to Load Inbox"
                  : "Retry Inbox Load"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={pageStyle}>
        <div style={shellStyle}>
          <div style={headerStyle}>
            <h1 style={titleStyle}>Action Desk</h1>
            <p style={subtitleStyle}>{pilotMode ? "Live Inbox Pilot" : "Inbox Queue MVP"}</p>
          </div>

          <div style={statusCardStyle}>{loadError}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={shellStyle}>
        <div style={headerStyle}>
          <h1 style={titleStyle}>Action Desk</h1>
          <p style={subtitleStyle}>
            {pilotMode
              ? "Live inbox pilot for customer support triage, suggested next action, and reply drafting"
              : "Inbox Queue MVP for customer support triage, analysis, and reply drafting"}
          </p>
        </div>

        {inboxLoadError && (
          <div style={{ ...statusCardStyle, marginBottom: "20px" }}>{inboxLoadError}</div>
        )}
                {processingStatus && (
          <div style={{ ...statusCardStyle, marginBottom: "20px" }}>
            {processingStatus}
          </div>
        )}

        {!processingStatus && totalLoadedEmails > 0 && (
          <div style={{ ...statusCardStyle, marginBottom: "20px" }}>
            Loaded {totalLoadedEmails} emails. Showing {visibleEmailCount}
            {hiddenEmailCount > 0 ? `, with ${hiddenEmailCount} hidden by the current view or filters.` : "."}
          </div>
        )}

        <div style={layoutStyle}>
          {!showDetailView || !selectedItem ? (
            <InboxQueue
              items={visibleQueueItems}
              totalCount={pilotMode ? queueViewFilteredItems.length : filteredQueueItems.length}
              summary={queueSummary}
              topIssues={topIssues}
              activeIssueFilter={activeIssueFilter}
              selectedEmailId={selectedEmailId}
              hasActiveFilters={hasActiveFilters}
              pilotMode={pilotMode}
              pilotEmptyStateMessage={pilotEmptyStateMessage}
              pilotQueueView={pilotQueueView}
              pilotItemStates={pilotItemStates}
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
              intentOptions={intentOptions}
              onRefreshInbox={handleRefreshInbox}
              onLoadMore={handleLoadMore}
              retryingEmailId={retryingEmailId ?? undefined}
              onRetryEmail={handleRetryEmail}
              onToggleProblemsOnly={() => setShowProblemsOnly((current) => !current)}
              onIssueFilterChange={(issueCode) => {
                setActiveIssueFilter((current) => (current === issueCode ? null : issueCode));
              }}
              onClearIssueFilter={() => setActiveIssueFilter(null)}
              onSelectEmail={(emailId) => {
                setSelectedEmailId(emailId);
                setShowDetailView(true);
                setCopyFeedback("idle");
                setCaseCopyFeedback("idle");
                setRawCaseCopyFeedback("idle");
                setReplyActionError(null);
              }}
              onPilotQueueViewChange={setPilotQueueView}
              onQueueViewChange={setQueueView}
              onSearchQueryChange={setSearchQuery}
              onUrgencyFilterChange={setUrgencyFilter}
              onIntentFilterChange={setIntentFilter}
            />
          ) : (
            <div style={detailShellStyle}>
              <button
                type="button"
                onClick={() => setShowDetailView(false)}
                style={backButtonStyle}
              >
                Back to Queue
              </button>
              <EmailDetail
                item={selectedItem}
                pilotMode={pilotMode}
                pilotItemState={selectedPilotState}
                orderDataMessage={pilotMode ? PILOT_ORDER_DATA_MESSAGE : undefined}
                hasReplyDraft={hasReplyDraft}
                copyFeedback={copyFeedback}
                caseCopyFeedback={caseCopyFeedback}
                rawCaseCopyFeedback={rawCaseCopyFeedback}
                regeneratingReply={regeneratingReply}
                replyActionError={replyActionError}
                onCopyReply={handleCopyReply}
                onCopyCaseForReview={handleCopyCaseForReview}
                onCopyRawCaseJson={handleCopyRawCaseJson}
                onRegenerateReply={handleRegenerateReply}
                onRecomputePriority={async () => {
                  if (!selectedItem) {
                    return;
                  }

                  if (persistedQueueEnabled && selectedItem.queueItemId) {
                    try {
                      await runPersistedRecomputePriority({
                        service: getQueueApplicationService(),
                        selectedItem,
                        setQueueItems,
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
                        setQueueItems,
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

                  if (persistedQueueEnabled && selectedItem.queueItemId) {
                    try {
                      await runPersistedMarkDone({
                        service: getQueueApplicationService(),
                        selectedItem,
                        setQueueItems,
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
                    handleSetPilotWorkflowStatus(selectedItem.email.id, "not_relevant");
                  }
                }}
                                onMarkPilotItemWaitingOnCustomer={async () => {
                  if (!selectedItem) {
                    return;
                  }

                  if (persistedQueueEnabled && selectedItem.queueItemId) {
                    try {
                      await runPersistedUpdateWorkStatus({
                        service: getQueueApplicationService(),
                        selectedItem,
                        status: "waiting_on_customer",
                        successMessage: "Queue item moved to Waiting on Customer.",
                        onAfterSuccess: (emailId) => {
                          handleSetPilotWorkflowStatus(emailId, "waiting_on_customer");
                        },
                        setQueueItems,
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

                  handleSetPilotWorkflowStatus(selectedItem.email.id, "waiting_on_customer");
                }}
                onSnoozePilotItemUntilTomorrow={() => {
                  if (selectedItem) {
                    handleSnoozeUntilTomorrow(selectedItem.email.id);
                  }
                }}
                onSetPilotUsefulness={(usefulness) => {
                  if (selectedItem) {
                    handleSetPilotUsefulness(selectedItem.email.id, usefulness);
                  }
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}