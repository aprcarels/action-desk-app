import { useState } from "react";
import { ThreadedQueueCard } from "./ThreadedQueueCard";
import { formatElapsedTime } from "../services/sla";
import type { RepGroupedQueueSection } from "../services/workflowSelectors";
import type { AssignmentReason } from "../types/actionDesk";

type RepQueueSectionProps = {
  section: RepGroupedQueueSection;
  now: Date;
  selectedEmailId?: string;
  retryingEmailId?: string;
  currentRepId?: string;
  onSelectEmail: (emailId: string) => void;
  onTakeThread: (threadId: string, reason: AssignmentReason) => void;
  onRetryEmail: (emailId: string) => void;
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

export function RepQueueSection({
  section,
  now,
  selectedEmailId,
  retryingEmailId,
  currentRepId,
  onSelectEmail,
  onTakeThread,
  onRetryEmail,
}: RepQueueSectionProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <section
      style={{
        borderBottom: "1px solid #e5edf5",
        backgroundColor: "#ffffff",
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        style={{
          width: "100%",
          border: "none",
          backgroundColor: "#f8fafc",
          padding: "14px 18px",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: "4px" }}>
            <div
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                {section.repName}
              </h3>
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
                {section.openThreadCount} open
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
              {section.threads.length} visible {section.threads.length === 1 ? "thread" : "threads"}
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "flex-end",
            }}
          >
            <MetricPill label="Waiting" value={section.waitingOnCustomerCount} />
            <MetricPill
              label="Over SLA"
              value={section.overSlaCount}
              accent={section.overSlaCount > 0 ? "#991b1b" : undefined}
              backgroundColor={section.overSlaCount > 0 ? "#fee2e2" : undefined}
            />
            <MetricPill
              label="Oldest Open"
              value={formatAge(section.oldestOpenMinutes, now)}
            />
            <span
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#475569",
              }}
            >
              {isOpen ? "Hide" : "Show"}
            </span>
          </div>
        </div>
      </button>

      {isOpen && (
        <div style={{ display: "grid", paddingBottom: "8px" }}>
          {section.threads.map((thread) => (
            <ThreadedQueueCard
              key={thread.id}
              thread={thread}
              now={now}
              isSelected={thread.items.some((item) => item.email.id === selectedEmailId)}
              retryingEmailId={retryingEmailId}
              currentRepId={currentRepId}
              onSelect={() => onSelectEmail(thread.representativeItem.email.id)}
              onTakeThread={(reason) => onTakeThread(thread.id, reason)}
              onRetryEmail={onRetryEmail}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MetricPill(props: {
  label: string;
  value: number | string;
  accent?: string;
  backgroundColor?: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        gap: "6px",
        alignItems: "center",
        borderRadius: "999px",
        padding: "5px 9px",
        backgroundColor: props.backgroundColor ?? "#ffffff",
        border: "1px solid #d8e1ec",
        color: props.accent ?? "#334155",
        fontSize: "12px",
        fontWeight: 700,
      }}
    >
      <span style={{ color: "#64748b" }}>{props.label}</span>
      <span>{props.value}</span>
    </span>
  );
}
