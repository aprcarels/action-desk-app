import { GroupedRepQueue } from "./GroupedRepQueue";
import { ThreadedQueueCard } from "./ThreadedQueueCard";
import { getIntentLabel } from "../services/analysisTaxonomy";
import type { CustomerPriorityFilter } from "../app/processEmails";
import type { RepGroupedQueueSection } from "../services/workflowSelectors";
import type {
  AssignmentReason,
  IntentCode,
  PilotQueueView,
  QueueDisplayMode,
  WorkflowThread,
} from "../types/actionDesk";

type IssueFilterCode =
  | "delivered_not_received"
  | "delayed_shipment"
  | "missing_order"
  | "general_issue";

type InboxQueueProps = {
  threads: WorkflowThread[];
  groupedRepSections?: RepGroupedQueueSection[];
  totalCount: number;
  summary: {
    totalLoaded: number;
    highPriority: number;
    failed: number;
    processing: number;
  };
  topIssues: Array<{
    code: IssueFilterCode;
    label: string;
    count: number;
  }>;
  activeIssueFilter: IssueFilterCode | null;
  selectedEmailId?: string;
  hasActiveFilters: boolean;
  pilotMode: boolean;
  pilotEmptyStateMessage?: string;
  pilotQueueView: PilotQueueView;
  queueDisplayMode: QueueDisplayMode;
  queueView: "customer_service" | "all_inbox";
  showProblemsOnly: boolean;
  isLoadingInbox: boolean;
  isLoadingMore: boolean;
  nextCursor?: string;
  loadMoreError?: string | null;
  lastLoadedAt?: string;
  searchQuery: string;
  urgencyFilter: "all" | "high" | "medium" | "low";
  intentFilter: IntentCode | "all";
  customerPriorityFilter: CustomerPriorityFilter;
  hasSavedCustomers: boolean;
  intentOptions: IntentCode[];
  now: Date;
  currentRepId?: string;
  onRefreshInbox: () => void;
  onLoadMore: () => void;
  retryingEmailId?: string;
  onRetryEmail: (emailId: string) => void;
  onTakeThread: (threadId: string, reason: AssignmentReason) => void;
  onToggleProblemsOnly: () => void;
  onIssueFilterChange: (issueCode: IssueFilterCode) => void;
  onClearIssueFilter: () => void;
  onSelectEmail: (emailId: string) => void;
  onPilotQueueViewChange: (value: PilotQueueView) => void;
  onQueueViewChange: (value: "customer_service" | "all_inbox") => void;
  onSearchQueryChange: (value: string) => void;
  onUrgencyFilterChange: (value: "all" | "high" | "medium" | "low") => void;
  onIntentFilterChange: (value: IntentCode | "all") => void;
  onCustomerPriorityFilterChange: (value: CustomerPriorityFilter) => void;
};

function getPilotQueueViewLabel(view: PilotQueueView): string {
  switch (view) {
    case "active":
      return "Active";
    case "waiting_on_customer":
      return "Waiting";
    case "snoozed":
      return "Snoozed";
    case "done":
      return "Done";
    case "not_relevant":
      return "Not Relevant";
    case "all":
      return "All";
  }
}

export function InboxQueue({
  threads,
  groupedRepSections = [],
  totalCount,
  summary,
  topIssues,
  activeIssueFilter,
  selectedEmailId,
  hasActiveFilters,
  pilotMode,
  pilotEmptyStateMessage,
  pilotQueueView,
  queueDisplayMode,
  queueView,
  showProblemsOnly,
  isLoadingInbox,
  isLoadingMore,
  nextCursor,
  loadMoreError,
  lastLoadedAt,
  searchQuery,
  urgencyFilter,
  intentFilter,
  customerPriorityFilter,
  hasSavedCustomers,
  intentOptions,
  now,
  currentRepId,
  onRefreshInbox,
  onLoadMore,
  retryingEmailId,
  onRetryEmail,
  onTakeThread,
  onToggleProblemsOnly,
  onIssueFilterChange,
  onClearIssueFilter,
  onSelectEmail,
  onPilotQueueViewChange,
  onQueueViewChange,
  onSearchQueryChange,
  onUrgencyFilterChange,
  onIntentFilterChange,
  onCustomerPriorityFilterChange,
}: InboxQueueProps) {
  const refreshDisabled = isLoadingInbox || isLoadingMore;
  const loadMoreDisabled = isLoadingMore || isLoadingInbox;

  const containerStyle: React.CSSProperties = {
    backgroundColor: "#ffffff",
    border: "1px solid #d8e1ec",
    borderRadius: "18px",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
    overflow: "hidden",
  };

  const headerStyle: React.CSSProperties = {
    padding: "18px 20px",
    borderBottom: "1px solid #e5edf5",
    backgroundColor: "#f8fafc",
  };

  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: "19px",
    fontWeight: 700,
    color: "#0f172a",
  };

  const headerRowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
  };

  const subtitleStyle: React.CSSProperties = {
    margin: "4px 0 0",
    fontSize: "13px",
    color: "#475569",
  };

  const secondaryButtonStyle: React.CSSProperties = {
    border: "1px solid #cbd5e1",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    borderRadius: "10px",
    padding: "8px 12px",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
  };

  const controlsStyle: React.CSSProperties = {
    display: "grid",
    gap: "10px",
    marginTop: "14px",
  };

  const segmentedControlStyle: React.CSSProperties = {
    display: "inline-flex",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    overflow: "hidden",
    backgroundColor: "#ffffff",
  };

  const segmentButtonStyle: React.CSSProperties = {
    border: "none",
    backgroundColor: "#ffffff",
    color: "#475569",
    padding: "8px 12px",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    boxSizing: "border-box",
    fontSize: "13px",
    backgroundColor: "#ffffff",
    color: "#0f172a",
  };

  const filterRowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "10px",
  };

  const topIssuesPanelStyle: React.CSSProperties = {
    padding: "14px 20px",
    borderBottom: "1px solid #e5edf5",
    backgroundColor: "#f8fafc",
  };

  const topIssuesRowStyle: React.CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginTop: "10px",
  };

  const topIssueBadgeStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    border: "1px solid #dbe5f0",
    borderRadius: "999px",
    padding: "6px 10px",
    backgroundColor: "#ffffff",
    fontSize: "12px",
    fontWeight: 700,
    color: "#334155",
    cursor: "pointer",
  };

  const summaryBarStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: "8px",
    padding: "12px 20px",
    borderBottom: "1px solid #e5edf5",
    backgroundColor: "#fcfdff",
  };

  const summaryCardStyle: React.CSSProperties = {
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "10px 12px",
    backgroundColor: "#ffffff",
  };

  const summaryLabelStyle: React.CSSProperties = {
    margin: 0,
    fontSize: "11px",
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  };

  const summaryValueStyle: React.CSSProperties = {
    margin: "4px 0 0",
    fontSize: "20px",
    fontWeight: 700,
    color: "#0f172a",
  };

  const emptyStateStyle: React.CSSProperties = {
    padding: "28px 20px",
    fontSize: "14px",
    lineHeight: 1.6,
    color: "#64748b",
  };

  const footerStyle: React.CSSProperties = {
    padding: "16px 20px 20px",
    borderTop: "1px solid #e5edf5",
    backgroundColor: "#fcfdff",
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div style={headerRowStyle}>
          <div>
            <h2 style={titleStyle}>
              {queueView === "customer_service" ? "Queue Quick List" : "Inbox Quick List"}
            </h2>
            <p style={subtitleStyle}>
              Showing {threads.length} of {totalCount} threads
              {lastLoadedAt ? ` | Last loaded ${lastLoadedAt}` : ""}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div style={segmentedControlStyle}>
              <button
                type="button"
                onClick={queueView === "customer_service" ? undefined : () => onQueueViewChange("customer_service")}
                aria-pressed={queueView === "customer_service"}
                style={{
                  ...segmentButtonStyle,
                  backgroundColor: queueView === "customer_service" ? "#dbeafe" : "#ffffff",
                  color: queueView === "customer_service" ? "#1d4ed8" : "#475569",
                  cursor: queueView === "customer_service" ? "default" : "pointer",
                }}
              >
                Customer Service Queue
              </button>
              <button
                type="button"
                onClick={queueView === "all_inbox" ? undefined : () => onQueueViewChange("all_inbox")}
                aria-pressed={queueView === "all_inbox"}
                style={{
                  ...segmentButtonStyle,
                  backgroundColor: queueView === "all_inbox" ? "#dbeafe" : "#ffffff",
                  color: queueView === "all_inbox" ? "#1d4ed8" : "#475569",
                  cursor: queueView === "all_inbox" ? "default" : "pointer",
                  borderLeft: "1px solid #cbd5e1",
                }}
              >
                All Inbox
              </button>
            </div>
            <div style={segmentedControlStyle}>
              <button
                type="button"
                onClick={showProblemsOnly ? onToggleProblemsOnly : undefined}
                aria-pressed={!showProblemsOnly}
                style={{
                  ...segmentButtonStyle,
                  backgroundColor: showProblemsOnly ? "#ffffff" : "#dbeafe",
                  color: showProblemsOnly ? "#475569" : "#1d4ed8",
                  cursor: showProblemsOnly ? "pointer" : "default",
                }}
              >
                All Emails
              </button>
              <button
                type="button"
                onClick={showProblemsOnly ? undefined : onToggleProblemsOnly}
                aria-pressed={showProblemsOnly}
                style={{
                  ...segmentButtonStyle,
                  backgroundColor: showProblemsOnly ? "#fee2e2" : "#ffffff",
                  color: showProblemsOnly ? "#991b1b" : "#475569",
                  cursor: showProblemsOnly ? "default" : "pointer",
                  borderLeft: "1px solid #cbd5e1",
                }}
              >
                Problems First
              </button>
            </div>
            <button
              type="button"
              onClick={onRefreshInbox}
              disabled={refreshDisabled}
              style={{
                ...secondaryButtonStyle,
                backgroundColor: refreshDisabled ? "#e2e8f0" : "#ffffff",
                color: refreshDisabled ? "#64748b" : "#0f172a",
                cursor: refreshDisabled ? "not-allowed" : "pointer",
              }}
            >
              {isLoadingInbox
                ? "Refreshing Queue..."
                : isLoadingMore
                  ? "Loading More..."
                  : "Refresh Queue"}
            </button>
          </div>
        </div>
        <div style={controlsStyle}>
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search sender or subject"
            style={inputStyle}
          />
          <div style={filterRowStyle}>
            <select
              value={urgencyFilter}
              onChange={(event) =>
                onUrgencyFilterChange(event.target.value as "all" | "high" | "medium" | "low")
              }
              style={inputStyle}
            >
              <option value="all">All urgency</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              value={intentFilter}
              onChange={(event) =>
                onIntentFilterChange(event.target.value as IntentCode | "all")
              }
              style={inputStyle}
            >
              <option value="all">All intents</option>
              {intentOptions.map((intent) => (
                <option key={intent} value={intent}>
                  {getIntentLabel(intent)}
                </option>
              ))}
            </select>
            <select
              value={customerPriorityFilter}
              onChange={(event) =>
                onCustomerPriorityFilterChange(
                  event.target.value as CustomerPriorityFilter,
                )
              }
              style={inputStyle}
            >
              <option value="all">All emails</option>
              <option value="matched_only">Matched customers only</option>
            </select>
            {pilotMode && (
              <select
                value={pilotQueueView}
                onChange={(event) =>
                  onPilotQueueViewChange(event.target.value as PilotQueueView)
                }
                style={inputStyle}
              >
                {(["active", "waiting_on_customer", "snoozed", "done", "not_relevant", "all"] as const).map((view) => (
                  <option key={view} value={view}>
                    {getPilotQueueViewLabel(view)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      <div style={topIssuesPanelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <p style={{ ...summaryLabelStyle, fontSize: "12px" }}>Quick Filters</p>
          <button
            type="button"
            onClick={onClearIssueFilter}
            disabled={activeIssueFilter === null}
            style={{
              border: "none",
              background: "transparent",
              color: activeIssueFilter ? "#1d4ed8" : "#94a3b8",
              fontSize: "12px",
              fontWeight: 700,
              cursor: activeIssueFilter ? "pointer" : "default",
              padding: 0,
            }}
          >
            All Issues
          </button>
        </div>
        {topIssues.length > 0 ? (
          <div style={topIssuesRowStyle}>
            {topIssues.map((issue) => (
              <button
                key={issue.code}
                type="button"
                onClick={() => onIssueFilterChange(issue.code)}
                aria-pressed={activeIssueFilter === issue.code}
                style={{
                  ...topIssueBadgeStyle,
                  backgroundColor: activeIssueFilter === issue.code ? "#dbeafe" : "#ffffff",
                  borderColor: activeIssueFilter === issue.code ? "#93c5fd" : "#dbe5f0",
                  color: activeIssueFilter === issue.code ? "#1d4ed8" : "#334155",
                }}
              >
                {issue.label}
                <span style={{ color: "#64748b" }}>
                  ({issue.count} {issue.count === 1 ? "email" : "emails"})
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p style={{ ...subtitleStyle, marginTop: "8px" }}>No high-risk issue clusters right now.</p>
        )}
      </div>

      <div style={summaryBarStyle}>
        <div style={summaryCardStyle}>
          <p style={summaryLabelStyle}>Total Loaded</p>
          <p style={summaryValueStyle}>{summary.totalLoaded}</p>
        </div>
        <div style={summaryCardStyle}>
          <p style={summaryLabelStyle}>High Priority</p>
          <p style={{ ...summaryValueStyle, color: "#991b1b" }}>{summary.highPriority}</p>
        </div>
        <div style={summaryCardStyle}>
          <p style={summaryLabelStyle}>Failed</p>
          <p style={{ ...summaryValueStyle, color: "#991b1b" }}>{summary.failed}</p>
        </div>
        <div style={summaryCardStyle}>
          <p style={summaryLabelStyle}>Processing</p>
          <p style={{ ...summaryValueStyle, color: "#92400e" }}>{summary.processing}</p>
        </div>
      </div>

      {threads.length === 0 && (
        <div style={emptyStateStyle}>
          {pilotMode && !hasActiveFilters && pilotEmptyStateMessage
            ? pilotEmptyStateMessage
            : pilotMode && pilotQueueView !== "active"
              ? `No ${getPilotQueueViewLabel(pilotQueueView).toLowerCase()} emails match the current filters.`
              : queueView === "customer_service"
                ? "No likely customer-service emails match the current filters. Switch to All Inbox to review everything."
                : customerPriorityFilter === "matched_only" && !hasSavedCustomers
                  ? "No saved customers yet. Add customers in Settings to surface their emails first."
                  : customerPriorityFilter === "matched_only"
                    ? "No emails match your saved customers with the current filters."
                    : showProblemsOnly
                      ? "No urgent issues right now."
                      : hasActiveFilters
                        ? "No threads match the current filters. Try clearing the search or status filters."
                        : "Inbox is empty right now. New emails will appear here when available."}
        </div>
      )}

      {queueDisplayMode === "grouped_by_rep" ? (
        <GroupedRepQueue
          sections={groupedRepSections}
          now={now}
          selectedEmailId={selectedEmailId}
          retryingEmailId={retryingEmailId}
          currentRepId={currentRepId}
          onSelectEmail={onSelectEmail}
          onTakeThread={onTakeThread}
          onRetryEmail={onRetryEmail}
        />
      ) : (
        <div style={{ display: "grid" }}>
          {threads.map((thread) => (
            <ThreadedQueueCard
              key={thread.id}
              thread={thread}
              now={now}
              isSelected={thread.items.some((item) => item.email.id === selectedEmailId)}
              retryingEmailId={retryingEmailId}
              onSelect={() => onSelectEmail(thread.representativeItem.email.id)}
              onTakeThread={(reason) => onTakeThread(thread.id, reason)}
              onRetryEmail={onRetryEmail}
              currentRepId={currentRepId}
            />
          ))}
        </div>
      )}

      {(nextCursor || loadMoreError) && (
        <div style={footerStyle}>
          {loadMoreError && (
            <p style={{ ...subtitleStyle, marginBottom: "10px", color: "#991b1b" }}>
              {loadMoreError}
            </p>
          )}
          {nextCursor && (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadMoreDisabled}
              style={{
                ...secondaryButtonStyle,
                backgroundColor: loadMoreDisabled ? "#e2e8f0" : "#ffffff",
                color: loadMoreDisabled ? "#64748b" : "#0f172a",
                cursor: loadMoreDisabled ? "not-allowed" : "pointer",
              }}
            >
              {isLoadingMore
                ? "Loading More..."
                : isLoadingInbox
                  ? "Refreshing Queue..."
                  : "Load More"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
