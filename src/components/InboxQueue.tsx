import { getIntentLabel } from "../services/analysisTaxonomy";
import type { IntentCode, ProcessedEmail } from "../types/actionDesk";

type InboxQueueProps = {
  items: ProcessedEmail[];
  totalCount: number;
  summary: {
    totalLoaded: number;
    highPriority: number;
    failed: number;
    processing: number;
  };
  selectedEmailId?: string;
  hasActiveFilters: boolean;
  showProblemsOnly: boolean;
  isLoadingInbox: boolean;
  isLoadingMore: boolean;
  nextCursor?: string;
  loadMoreError?: string | null;
  lastLoadedAt?: string;
  searchQuery: string;
  urgencyFilter: "all" | "high" | "medium" | "low";
  intentFilter: IntentCode | "all";
  intentOptions: IntentCode[];
  onRefreshInbox: () => void;
  onLoadMore: () => void;
  retryingEmailId?: string;
  onRetryEmail: (emailId: string) => void;
  onToggleProblemsOnly: () => void;
  onSelectEmail: (emailId: string) => void;
  onSearchQueryChange: (value: string) => void;
  onUrgencyFilterChange: (value: "all" | "high" | "medium" | "low") => void;
  onIntentFilterChange: (value: IntentCode | "all") => void;
};

function formatReceivedTime(receivedAt: string) {
  return new Date(receivedAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getUrgencyBadgeStyle(
  urgency: NonNullable<ProcessedEmail["result"]>["analysis"]["urgency"],
): React.CSSProperties {
  return {
    fontSize: "12px",
    fontWeight: 700,
    color:
      urgency === "high" ? "#991b1b" : urgency === "low" ? "#166534" : "#92400e",
    backgroundColor:
      urgency === "high" ? "#fee2e2" : urgency === "low" ? "#dcfce7" : "#fef3c7",
    borderRadius: "999px",
    padding: "4px 8px",
    textTransform: "capitalize",
  };
}

function getPriorityLevel(priorityScore: number): "High" | "Medium" | "Low" {
  if (priorityScore >= 70) {
    return "High";
  }

  if (priorityScore >= 40) {
    return "Medium";
  }

  return "Low";
}

function getPriorityBadgeStyle(priorityScore: number): React.CSSProperties {
  const level = getPriorityLevel(priorityScore);

  return {
    fontSize: "12px",
    fontWeight: 700,
    color:
      level === "High" ? "#991b1b" : level === "Medium" ? "#92400e" : "#166534",
    backgroundColor:
      level === "High" ? "#fee2e2" : level === "Medium" ? "#fef3c7" : "#dcfce7",
    borderRadius: "999px",
    padding: "4px 8px",
  };
}

function getRowSurfaceStyle(options: {
  isSelected: boolean;
  isFailed: boolean;
  isPending: boolean;
  isHighPriority: boolean;
}): React.CSSProperties {
  const { isSelected, isFailed, isPending, isHighPriority } = options;

  if (isSelected) {
    return {
      borderLeft: "4px solid #2563eb",
      backgroundColor: "#eff6ff",
      boxShadow: "inset 0 0 0 1px rgba(37, 99, 235, 0.12)",
    };
  }

  if (isFailed) {
    return {
      borderLeft: "4px solid #dc2626",
      backgroundColor: "#fff4f4",
      boxShadow: "inset 0 0 0 1px rgba(220, 38, 38, 0.1)",
    };
  }

  if (isHighPriority) {
    return {
      borderLeft: "4px solid #dc2626",
      backgroundColor: "#fff8f6",
      boxShadow: "inset 0 0 0 1px rgba(220, 38, 38, 0.06)",
    };
  }

  if (isPending) {
    return {
      borderLeft: "4px solid #f59e0b",
      backgroundColor: "#fffdf5",
      boxShadow: "inset 0 0 0 1px rgba(245, 158, 11, 0.08)",
    };
  }

  return {
    borderLeft: "4px solid transparent",
    backgroundColor: "#ffffff",
    boxShadow: "none",
  };
}

export function InboxQueue({
  items,
  totalCount,
  summary,
  selectedEmailId,
  hasActiveFilters,
  showProblemsOnly,
  isLoadingInbox,
  isLoadingMore,
  nextCursor,
  loadMoreError,
  lastLoadedAt,
  searchQuery,
  urgencyFilter,
  intentFilter,
  intentOptions,
  onRefreshInbox,
  onLoadMore,
  retryingEmailId,
  onRetryEmail,
  onToggleProblemsOnly,
  onSelectEmail,
  onSearchQueryChange,
  onUrgencyFilterChange,
  onIntentFilterChange,
}: InboxQueueProps) {
  const containerStyle: React.CSSProperties = {
    backgroundColor: "#ffffff",
    border: "1px solid #d8e1ec",
    borderRadius: "16px",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
    overflow: "hidden",
  };

  const headerStyle: React.CSSProperties = {
    padding: "18px 20px",
    borderBottom: "1px solid #e5edf5",
    backgroundColor: "#f8fafc",
  };

  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: "18px",
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
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "10px",
  };

  const listStyle: React.CSSProperties = {
    display: "grid",
  };

  const summaryBarStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
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
            <h2 style={titleStyle}>Inbox Queue</h2>
            <p style={subtitleStyle}>
              Showing {items.length} of {totalCount} emails
              {lastLoadedAt ? ` | Last loaded ${lastLoadedAt}` : ""}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
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
              disabled={isLoadingInbox}
              style={{
                ...secondaryButtonStyle,
                backgroundColor: isLoadingInbox ? "#e2e8f0" : "#ffffff",
                color: isLoadingInbox ? "#64748b" : "#0f172a",
                cursor: isLoadingInbox ? "not-allowed" : "pointer",
              }}
            >
              {isLoadingInbox ? "Loading Inbox..." : "Refresh Inbox"}
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
          </div>
        </div>
      </div>

      <div style={listStyle}>
        <div style={summaryBarStyle}>
          <div style={summaryCardStyle}>
            <p style={summaryLabelStyle}>Total Loaded</p>
            <p style={summaryValueStyle}>{summary.totalLoaded}</p>
          </div>
          <div
            style={{
              ...summaryCardStyle,
              backgroundColor: summary.highPriority > 0 ? "#fff7f7" : "#ffffff",
              borderColor: summary.highPriority > 0 ? "#fecaca" : "#e2e8f0",
            }}
          >
            <p style={summaryLabelStyle}>High Priority</p>
            <p style={{ ...summaryValueStyle, color: "#991b1b" }}>{summary.highPriority}</p>
          </div>
          <div
            style={{
              ...summaryCardStyle,
              backgroundColor: summary.failed > 0 ? "#fff7f7" : "#ffffff",
              borderColor: summary.failed > 0 ? "#fecaca" : "#e2e8f0",
            }}
          >
            <p style={summaryLabelStyle}>Failed</p>
            <p style={{ ...summaryValueStyle, color: "#991b1b" }}>{summary.failed}</p>
          </div>
          <div
            style={{
              ...summaryCardStyle,
              backgroundColor: summary.processing > 0 ? "#fffbeb" : "#ffffff",
              borderColor: summary.processing > 0 ? "#fde68a" : "#e2e8f0",
            }}
          >
            <p style={summaryLabelStyle}>Processing</p>
            <p style={{ ...summaryValueStyle, color: "#92400e" }}>{summary.processing}</p>
          </div>
        </div>

        {items.length === 0 && (
          <div style={emptyStateStyle}>
            {showProblemsOnly
              ? "No urgent issues right now."
              : hasActiveFilters
              ? "No emails match the current filters. Try clearing the search or urgency filter."
              : "Inbox is empty right now. New emails will appear here when available."}
          </div>
        )}

        {items.map((item) => {
          const isSelected = item.email.id === selectedEmailId;
          const isFailed = item.status === "failed";
          const isPending = item.status === "pending";
          const isRetrying = retryingEmailId === item.email.id;
          const priorityLevel = getPriorityLevel(item.result?.priorityScore ?? 0);
          const isHighPriority = priorityLevel === "High";
          const rowSurfaceStyle = getRowSurfaceStyle({
            isSelected,
            isFailed,
            isPending,
            isHighPriority,
          });

          return (
            <div
              key={item.email.id}
              style={{
                borderBottom: "1px solid #e5edf5",
                transition: "background-color 120ms ease, box-shadow 120ms ease",
                ...rowSurfaceStyle,
              }}
            >
              <button
                type="button"
                onClick={() => onSelectEmail(item.email.id)}
                style={{
                  width: "100%",
                  border: "none",
                  background: "transparent",
                  padding: "18px 20px",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    alignItems: "start",
                    marginBottom: "10px",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 700,
                        color: isFailed ? "#7f1d1d" : "#334155",
                        marginBottom: "5px",
                        letterSpacing: "0.01em",
                      }}
                    >
                      {item.email.senderName}
                    </div>
                    <div
                      style={{
                        fontSize: isHighPriority || isFailed ? "15px" : "14px",
                        fontWeight: isHighPriority || isFailed ? 700 : 600,
                        lineHeight: 1.4,
                        color: isFailed ? "#991b1b" : "#0f172a",
                        marginBottom: "2px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.email.subject}
                    </div>
                    <div
                      style={{
                        marginTop: "8px",
                        fontSize: "12px",
                        lineHeight: 1.5,
                        color: isFailed ? "#b91c1c" : isPending ? "#92400e" : "#64748b",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {isFailed
                        ? item.processingError ?? "This email could not be processed."
                        : isPending
                          ? "Processing this email..."
                          : item.previewText}
                    </div>
                  </div>

                  <div
                    style={{
                      flexShrink: 0,
                      fontSize: "12px",
                      fontWeight: 600,
                      color: isFailed ? "#991b1b" : isPending ? "#92400e" : "#64748b",
                    }}
                  >
                    {formatReceivedTime(item.email.receivedAt)}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    alignItems: "center",
                  }}
                >
                  {item.status === "processed" && (
                    <span
                      style={{
                        ...getPriorityBadgeStyle(item.result?.priorityScore ?? 0),
                        boxShadow: isHighPriority
                          ? "inset 0 0 0 1px rgba(153, 27, 27, 0.12)"
                          : "none",
                      }}
                    >
                      {priorityLevel} Priority
                    </span>
                  )}
                  {item.status === "failed" && (
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "#991b1b",
                        backgroundColor: "#fee2e2",
                        boxShadow: "inset 0 0 0 1px rgba(153, 27, 27, 0.12)",
                        borderRadius: "999px",
                        padding: "4px 8px",
                      }}
                    >
                      Failed
                    </span>
                  )}
                  {item.status === "pending" && (
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "#92400e",
                        backgroundColor: "#fef3c7",
                        boxShadow: "inset 0 0 0 1px rgba(146, 64, 14, 0.1)",
                        borderRadius: "999px",
                        padding: "4px 8px",
                      }}
                    >
                      Processing
                    </span>
                  )}
                  {item.status === "processed" && item.result && (
                    <>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "#1d4ed8",
                          backgroundColor: "#dbeafe",
                          borderRadius: "999px",
                          padding: "4px 8px",
                        }}
                      >
                        {getIntentLabel(item.result.analysis.intent)}
                      </span>
                      <span style={getUrgencyBadgeStyle(item.result.analysis.urgency)}>
                        {item.result.analysis.urgency}
                      </span>
                    </>
                  )}
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#334155",
                      backgroundColor: "#e2e8f0",
                      borderRadius: "999px",
                      padding: "4px 8px",
                    }}
                  >
                    {item.issueCount} issues
                  </span>
                </div>
              </button>

              {isFailed && (
                <div style={{ padding: "0 20px 16px" }}>
                  <button
                    type="button"
                    onClick={() => onRetryEmail(item.email.id)}
                    disabled={isRetrying}
                    style={{
                      ...secondaryButtonStyle,
                      backgroundColor: isRetrying ? "#e2e8f0" : "#ffffff",
                      color: isRetrying ? "#64748b" : "#0f172a",
                      cursor: isRetrying ? "not-allowed" : "pointer",
                    }}
                  >
                    {isRetrying ? "Retrying..." : "Retry"}
                  </button>
                </div>
              )}
            </div>
          );
        })}

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
                disabled={isLoadingMore}
                style={{
                  ...secondaryButtonStyle,
                  backgroundColor: isLoadingMore ? "#e2e8f0" : "#ffffff",
                  color: isLoadingMore ? "#64748b" : "#0f172a",
                  cursor: isLoadingMore ? "not-allowed" : "pointer",
                }}
              >
                {isLoadingMore ? "Loading More..." : "Load More"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
