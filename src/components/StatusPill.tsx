import type { WorkflowStatus } from "../types/actionDesk";

type StatusPillProps = {
  status: WorkflowStatus;
};

function getStatusLabel(status: WorkflowStatus): string {
  switch (status) {
    case "new":
      return "New";
    case "in_progress":
      return "In Progress";
    case "waiting_on_customer":
      return "Waiting on Customer";
    case "resolved":
      return "Resolved";
  }
}

function getStatusStyle(status: WorkflowStatus): React.CSSProperties {
  switch (status) {
    case "new":
      return {
        color: "#475569",
        backgroundColor: "#e2e8f0",
      };
    case "in_progress":
      return {
        color: "#1d4ed8",
        backgroundColor: "#dbeafe",
      };
    case "waiting_on_customer":
      return {
        color: "#92400e",
        backgroundColor: "#fef3c7",
      };
    case "resolved":
      return {
        color: "#166534",
        backgroundColor: "#dcfce7",
      };
  }
}

export function StatusPill({ status }: StatusPillProps) {
  return (
    <span
      style={{
        ...getStatusStyle(status),
        fontSize: "12px",
        fontWeight: 700,
        borderRadius: "999px",
        padding: "4px 8px",
      }}
    >
      {getStatusLabel(status)}
    </span>
  );
}
