import type { ProcessedEmail } from "../types/actionDesk";

type InboxQueueProps = {
  items: ProcessedEmail[];
  totalCount: number;
  selectedEmailId?: string;
  searchQuery: string;
  urgencyFilter: "all" | "high" | "medium" | "low";
  intentFilter: string;
  intentOptions: string[];
  onSelectEmail: (emailId: string) => void;
  onSearchQueryChange: (value: string) => void;
  onUrgencyFilterChange: (value: "all" | "high" | "medium" | "low") => void;
  onIntentFilterChange: (value: string) => void;
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
  urgency: ProcessedEmail["result"]["analysis"]["urgency"],
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

export function InboxQueue({
  items,
  totalCount,
  selectedEmailId,
  searchQuery,
  urgencyFilter,
  intentFilter,
  intentOptions,
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

  const subtitleStyle: React.CSSProperties = {
    margin: "4px 0 0",
    fontSize: "13px",
    color: "#475569",
  };

  const controlsStyle: React.CSSProperties = {
    display: "grid",
    gap: "10px",
    marginTop: "14px",
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

  const emptyStateStyle: React.CSSProperties = {
    padding: "28px 20px",
    fontSize: "14px",
    lineHeight: 1.6,
    color: "#64748b",
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h2 style={titleStyle}>Inbox Queue</h2>
        <p style={subtitleStyle}>
          Showing {items.length} of {totalCount} emails
        </p>
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
              onChange={(event) => onIntentFilterChange(event.target.value)}
              style={inputStyle}
            >
              <option value="all">All intents</option>
              {intentOptions.map((intent) => (
                <option key={intent} value={intent}>
                  {intent}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={listStyle}>
        {items.length === 0 && (
          <div style={emptyStateStyle}>
            No emails are in the queue yet. Add mock emails or load a new dataset to begin
            triage.
          </div>
        )}

        {items.map((item) => {
          const isSelected = item.email.id === selectedEmailId;

          return (
            <button
              key={item.email.id}
              type="button"
              onClick={() => onSelectEmail(item.email.id)}
              style={{
                border: "none",
                borderBottom: "1px solid #e5edf5",
                borderLeft: isSelected ? "4px solid #2563eb" : "4px solid transparent",
                backgroundColor: isSelected ? "#eff6ff" : "#ffffff",
                padding: "16px 20px",
                textAlign: "left",
                cursor: "pointer",
                boxShadow: isSelected ? "inset 0 0 0 1px rgba(37, 99, 235, 0.12)" : "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  alignItems: "start",
                  marginBottom: "8px",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "#0f172a",
                      marginBottom: "3px",
                    }}
                  >
                    {item.email.senderName}
                  </div>
                  <div
                    style={{
                      fontSize: "13px",
                      color: "#334155",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.email.subject}
                  </div>
                  <div
                    style={{
                      marginTop: "6px",
                      fontSize: "12px",
                      color: "#64748b",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.previewText}
                  </div>
                </div>

                <div
                  style={{
                    flexShrink: 0,
                    fontSize: "12px",
                    color: "#64748b",
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
                }}
              >
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
                  {item.result.analysis.intent}
                </span>
                <span style={getUrgencyBadgeStyle(item.result.analysis.urgency)}>
                  {item.result.analysis.urgency}
                </span>
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
          );
        })}
      </div>
    </div>
  );
}
