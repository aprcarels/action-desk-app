import { useEffect, useRef, useState } from "react";
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
import { runActionDesk } from "./app/runActionDesk";
import { EmailDetail } from "./components/EmailDetail";
import { InboxQueue } from "./components/InboxQueue";
import { deriveIssueType, getIssueTypeLabel, type IssueType } from "./domain/issueType";
import { generateReply } from "./services/generateReply";
import { loadInboxQueue } from "./services/loadInboxQueue";
import { getCachedProcessedEmail, setCachedProcessedEmail } from "./services/processedEmailCache";
import type { EmailItem, IntentCode, ProcessedEmail } from "./types/actionDesk";

type TopIssue = {
  code: IssueType;
  label: string;
  count: number;
};

function getIssueCode(item: ProcessedEmail): IssueType | null {
  if (item.status !== "processed" || !item.result) {
    return null;
  }

  return deriveIssueType(item.result.analysis, item.result.orderContext);
}

export default function App() {
  const [queueItems, setQueueItems] = useState<ProcessedEmail[]>([]);
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
  const [regeneratingReply, setRegeneratingReply] = useState(false);
  const [retryingEmailId, setRetryingEmailId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [intentFilter, setIntentFilter] = useState<IntentCode | "all">("all");
  const [showProblemsOnly, setShowProblemsOnly] = useState(false);
  const [activeIssueFilter, setActiveIssueFilter] = useState<TopIssue["code"] | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const copyFeedbackTimeoutRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const lastFocusRefreshAtRef = useRef(0);

  function resetCopyFeedbackWithDelay(nextState: "success" | "error") {
    if (copyFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(copyFeedbackTimeoutRef.current);
    }

    setCopyFeedback(nextState);
    copyFeedbackTimeoutRef.current = window.setTimeout(() => {
      setCopyFeedback("idle");
      copyFeedbackTimeoutRef.current = null;
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
        const inboxResult = await loadInboxQueue();
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
      } catch {
        if (isMounted) {
          setQueueItems([]);
          setSelectedEmailId(undefined);
          setInboxLoadError("We couldn't load the inbox right now. Please try again.");
          setProcessingStatus(null);
          setIsLoadingInbox(false);
        }
        return;
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
  }, [reloadToken]);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(copyFeedbackTimeoutRef.current);
      }
    };
  }, []);

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

  async function handleCopyReply() {
    if (!selectedItem || selectedItem.status !== "processed" || !hasReplyDraft) {
      return;
    }

    setReplyActionError(null);

    if (!navigator.clipboard?.writeText) {
      resetCopyFeedbackWithDelay("error");
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedReplyDraft);
      resetCopyFeedbackWithDelay("success");
    } catch {
      resetCopyFeedbackWithDelay("error");
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

    setReloadToken((current) => current + 1);
  }

  async function handleLoadMore() {
    if (!nextCursor || isLoadingMore || isLoadingInbox || loading) {
      return;
    }

    setIsLoadingMore(true);
    setLoadMoreError(null);

    try {
      const inboxResult = await loadInboxQueue(nextCursor);
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
    } catch {
      setLoadMoreError("We couldn't load more emails right now. Please try again.");
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
      const nextResult = await runActionDesk(failedItem.email.body);
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
  });
  const visibleQueueItems = filteredQueueItems.filter((item) => {
    if (showProblemsOnly && (item.status !== "processed" || (item.result?.priorityScore ?? 0) < 70)) {
      return false;
    }

    if (activeIssueFilter && getIssueCode(item) !== activeIssueFilter) {
      return false;
    }

    return true;
  });
  const queueSummary = {
    totalLoaded: queueItems.length,
    highPriority: queueItems.filter(
      (item) => item.status === "processed" && (item.result?.priorityScore ?? 0) >= 70,
    ).length,
    failed: queueItems.filter((item) => item.status === "failed").length,
    processing: queueItems.filter((item) => item.status === "pending").length,
  };
  const topIssues = Array.from(
    queueItems.reduce((counts, item) => {
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
  const selectedReplyDraft = selectedItem?.result?.replyDraft.trim() ?? "";
  const hasReplyDraft = selectedReplyDraft.length > 0;
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    urgencyFilter !== "all" ||
    intentFilter !== "all" ||
    showProblemsOnly ||
    activeIssueFilter !== null;

  useEffect(() => {
    if (visibleQueueItems.length === 0) {
      setSelectedEmailId(undefined);
      return;
    }

    const hasSelectedVisible = visibleQueueItems.some((item) => item.email.id === selectedEmailId);

    if (!hasSelectedVisible) {
      setSelectedEmailId(visibleQueueItems[0].email.id);
      setCopyFeedback("idle");
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
    gridTemplateColumns: "360px minmax(0, 1fr)",
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

  if (isLoadingInbox && queueItems.length === 0) {
    return (
      <div style={pageStyle}>
        <div style={shellStyle}>
          <div style={headerStyle}>
            <h1 style={titleStyle}>Action Desk</h1>
            <p style={subtitleStyle}>Inbox Queue MVP</p>
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
            <p style={subtitleStyle}>Inbox Queue MVP</p>
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
              {isLoadingInbox ? "Loading Inbox..." : "Retry Inbox Load"}
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
            <p style={subtitleStyle}>Inbox Queue MVP</p>
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
            Inbox Queue MVP for customer support triage, analysis, and reply drafting
          </p>
        </div>

        {inboxLoadError && (
          <div style={{ ...statusCardStyle, marginBottom: "20px" }}>{inboxLoadError}</div>
        )}
        {processingStatus && <div style={{ ...statusCardStyle, marginBottom: "20px" }}>{processingStatus}</div>}

        <div style={layoutStyle}>
          <InboxQueue
            items={visibleQueueItems}
            totalCount={queueItems.length}
            summary={queueSummary}
            topIssues={topIssues}
            activeIssueFilter={activeIssueFilter}
            selectedEmailId={selectedEmailId}
            hasActiveFilters={hasActiveFilters}
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
              setCopyFeedback("idle");
              setReplyActionError(null);
            }}
            onSearchQueryChange={setSearchQuery}
            onUrgencyFilterChange={setUrgencyFilter}
            onIntentFilterChange={setIntentFilter}
          />

          <EmailDetail
            item={selectedItem}
            hasReplyDraft={hasReplyDraft}
            copyFeedback={copyFeedback}
            regeneratingReply={regeneratingReply}
            replyActionError={replyActionError}
            onCopyReply={handleCopyReply}
            onRegenerateReply={handleRegenerateReply}
          />
        </div>
      </div>
    </div>
  );
}
