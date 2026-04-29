import type {
  QueueDisplayMode,
  QueueScopeView,
  RepRole,
  WorkflowStatusFilter,
} from "../types/actionDesk";

type WorkflowToolbarProps = {
  currentRepRole: RepRole;
  queueScopeView: QueueScopeView;
  queueDisplayMode: QueueDisplayMode;
  canUseGroupedRepView: boolean;
  statusFilter: WorkflowStatusFilter;
  showSnoozed: boolean;
  onQueueScopeViewChange: (value: QueueScopeView) => void;
  onQueueDisplayModeChange: (value: QueueDisplayMode) => void;
  onStatusFilterChange: (value: WorkflowStatusFilter) => void;
  onShowSnoozedChange: (value: boolean) => void;
};

export function WorkflowToolbar({
  currentRepRole,
  queueScopeView,
  queueDisplayMode,
  canUseGroupedRepView,
  statusFilter,
  showSnoozed,
  onQueueScopeViewChange,
  onQueueDisplayModeChange,
  onStatusFilterChange,
  onShowSnoozedChange,
}: WorkflowToolbarProps) {
  const queueScopeOptions = currentRepRole === "supervisor" || currentRepRole === "admin"
    ? [
        { value: "my_queue" as const, label: "My Queue" },
        { value: "unassigned" as const, label: "Unassigned" },
        { value: "all_emails" as const, label: "All Queue" },
      ]
    : [
        { value: "my_queue" as const, label: "My Queue" },
        { value: "unassigned" as const, label: "Unassigned" },
      ];

  return (
    <div
      style={{
        display: "flex",
        gap: "10px",
        flexWrap: "wrap",
        marginBottom: "16px",
        padding: "14px 16px",
        border: "1px solid #d8e1ec",
        borderRadius: "14px",
        backgroundColor: "#ffffff",
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.04)",
      }}
    >
      <div style={segmentedControlStyle}>
        {queueScopeOptions.map((option, index) => (
          <button
            key={option.value}
            type="button"
            onClick={
              queueScopeView === option.value
                ? undefined
                : () => onQueueScopeViewChange(option.value)
            }
            style={{
              ...segmentButtonStyle,
              borderLeft: index === 0 ? "none" : "1px solid #cbd5e1",
              backgroundColor: queueScopeView === option.value ? "#dbeafe" : "#ffffff",
              color: queueScopeView === option.value ? "#1d4ed8" : "#475569",
              cursor: queueScopeView === option.value ? "default" : "pointer",
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      {canUseGroupedRepView && (
        <div style={{ display: "grid", gap: "4px" }}>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            View
          </span>
          <div style={segmentedControlStyle}>
            {[
              { value: "list" as const, label: "List" },
              { value: "grouped_by_rep" as const, label: "Grouped by Rep" },
            ].map((option, index) => (
              <button
                key={option.value}
                type="button"
                onClick={
                  queueDisplayMode === option.value
                    ? undefined
                    : () => onQueueDisplayModeChange(option.value)
                }
                style={{
                  ...segmentButtonStyle,
                  borderLeft: index === 0 ? "none" : "1px solid #cbd5e1",
                  backgroundColor:
                    queueDisplayMode === option.value ? "#dbeafe" : "#ffffff",
                  color: queueDisplayMode === option.value ? "#1d4ed8" : "#475569",
                  cursor: queueDisplayMode === option.value ? "default" : "pointer",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          onClick={
            statusFilter === "resolved"
              ? () => onStatusFilterChange("open")
              : () => onStatusFilterChange("resolved")
          }
          style={{
            ...toggleButtonStyle,
            backgroundColor: statusFilter === "resolved" ? "#dcfce7" : "#ffffff",
            color: statusFilter === "resolved" ? "#166534" : "#475569",
            borderColor: statusFilter === "resolved" ? "#86efac" : "#cbd5e1",
          }}
        >
          {statusFilter === "resolved" ? "Back to Open" : "Resolved"}
        </button>

        <button
          type="button"
          onClick={() => onShowSnoozedChange(!showSnoozed)}
          style={{
            ...toggleButtonStyle,
            backgroundColor: showSnoozed ? "#fef3c7" : "#ffffff",
            color: showSnoozed ? "#92400e" : "#475569",
            borderColor: showSnoozed ? "#fcd34d" : "#cbd5e1",
          }}
        >
          {showSnoozed ? "Hide Snoozed" : "Show Snoozed"}
        </button>

        <select
          value={statusFilter}
          onChange={(event) =>
            onStatusFilterChange(event.target.value as WorkflowStatusFilter)
          }
          style={selectStyle}
        >
          <option value="open">Open</option>
          <option value="all">All Statuses</option>
          <option value="new">New</option>
          <option value="in_progress">In Progress</option>
          <option value="waiting_on_customer">Waiting on Customer</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>
    </div>
  );
}

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
};

const toggleButtonStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#475569",
  borderRadius: "10px",
  padding: "8px 12px",
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
};

const selectStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#0f172a",
  borderRadius: "10px",
  padding: "8px 12px",
  fontSize: "13px",
};
