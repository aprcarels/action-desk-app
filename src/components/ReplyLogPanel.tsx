import type { ReplyLogEntry } from "../types/actionDesk";

type ReplyLogPanelProps = {
  replyLog: ReplyLogEntry[];
};

export function ReplyLogPanel({ replyLog }: ReplyLogPanelProps) {
  if (replyLog.length === 0) {
    return <p style={emptyStyle}>No replies logged yet.</p>;
  }

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      {replyLog.map((entry) => (
        <div
          key={entry.id}
          style={{
            ...entryStyle,
            backgroundColor: "#eff6ff",
            borderColor: "#bfdbfe",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "13px",
              fontWeight: 700,
              color: "#1e3a8a",
            }}
          >
            {entry.repName} logged a reply
          </p>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#475569" }}>
            {new Date(entry.createdAt).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}

const entryStyle: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  padding: "12px",
};

const emptyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "14px",
  color: "#64748b",
};
