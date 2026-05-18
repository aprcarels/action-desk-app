import { useState } from "react";
import { formatElapsedTime } from "../services/sla";
import type { RepWorkloadSummary } from "../services/workflowSelectors";

type RepWorkloadPanelProps = {
  workloads: RepWorkloadSummary[];
  now: Date;
  defaultCollapsed?: boolean;
};

function formatAge(minutes: number, now: Date): string {
  if (minutes <= 0) {
    return "0m";
  }

  return formatElapsedTime(
    new Date(now.getTime() - minutes * 60_000).toISOString(),
    now,
  ).replace(" ago", "");
}

export function RepWorkloadPanel({
  workloads,
  now,
  defaultCollapsed = true,
}: RepWorkloadPanelProps) {
  const [isOpen, setIsOpen] = useState(!defaultCollapsed);
  const safeWorkloads = Array.isArray(workloads) ? workloads : [];

  return (
    <div
      style={{
        border: "1px solid #d8e1ec",
        borderRadius: "14px",
        backgroundColor: "#ffffff",
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.04)",
        marginBottom: "20px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: isOpen ? "1px solid #e5edf5" : "none",
          backgroundColor: "#f8fafc",
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "grid", gap: "4px" }}>
          <h2
            style={{
              margin: 0,
              fontSize: "16px",
              fontWeight: 700,
              color: "#0f172a",
            }}
          >
            Rep Workload
          </h2>
          <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
            Supervisor visibility stays available without crowding the queue.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          style={toggleButtonStyle}
        >
          {isOpen ? "Hide Workload" : "Show Workload"}
        </button>
      </div>
      {isOpen && (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: "620px",
            }}
          >
            <thead>
              <tr>
                {[
                  "Rep",
                  "Open",
                  "Waiting",
                  "Breached",
                  "Oldest Open",
                  "Resolved Today",
                ].map((header) => (
                  <th key={header} style={headerCellStyle}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {safeWorkloads.map((workload) => (
                <tr key={workload.repId}>
                  <td style={bodyCellStyle}>
                    <strong>{workload.repName}</strong>
                    <span style={{ color: "#64748b", fontWeight: 400 }}>
                      {" "}
                      ({workload.repRole === "admin" ? "Admin" : workload.repRole === "supervisor" ? "Supervisor" : "Rep"})
                    </span>
                    {workload.repEmail && (
                      <div style={{ marginTop: "3px", color: "#64748b", fontSize: "12px" }}>
                        {workload.repEmail}
                      </div>
                    )}
                  </td>
                  <td style={bodyCellStyle}>{workload.openThreadCount}</td>
                  <td style={bodyCellStyle}>{workload.waitingOnCustomerCount}</td>
                  <td style={bodyCellStyle}>{workload.breachedCount}</td>
                  <td style={bodyCellStyle}>
                    {formatAge(workload.oldestOpenMinutes, now)}
                  </td>
                  <td style={bodyCellStyle}>{workload.resolvedTodayCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const headerCellStyle: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  fontSize: "11px",
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  borderBottom: "1px solid #e5edf5",
};

const bodyCellStyle: React.CSSProperties = {
  padding: "12px",
  fontSize: "13px",
  color: "#0f172a",
  borderBottom: "1px solid #edf2f7",
};

const toggleButtonStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#0f172a",
  borderRadius: "10px",
  padding: "8px 12px",
  fontSize: "12px",
  fontWeight: 700,
  cursor: "pointer",
};
