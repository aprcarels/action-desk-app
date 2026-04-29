import { formatElapsedTime } from "../services/sla";

type MetricsBarProps = {
  totalOpen: number;
  unassigned: number;
  avgWaitMinutes: number;
  oldestOpenMinutes: number;
  breached: number;
  atRisk: number;
  resolvedToday: number;
  snoozed: number;
  showSnoozed?: boolean;
};

function formatAverageWait(avgWaitMinutes: number): string {
  const now = new Date();
  const syntheticDate = new Date(now.getTime() - avgWaitMinutes * 60_000).toISOString();

  return avgWaitMinutes > 0 ? formatElapsedTime(syntheticDate, now).replace(" ago", "") : "0m";
}

export function MetricsBar({
  totalOpen,
  unassigned,
  avgWaitMinutes,
  oldestOpenMinutes,
  breached,
  atRisk,
  resolvedToday,
  snoozed,
  showSnoozed,
}: MetricsBarProps) {
  const metrics = [
    { label: "Total Open", value: totalOpen, color: "#0f172a" },
    { label: "Unassigned", value: unassigned, color: "#92400e" },
    {
      label: "Avg. Wait Time",
      value: formatAverageWait(avgWaitMinutes),
      color: "#1d4ed8",
    },
    {
      label: "Oldest Open",
      value: formatAverageWait(oldestOpenMinutes),
      color: oldestOpenMinutes >= 240 ? "#991b1b" : "#475569",
    },
    { label: "Breached", value: breached, color: "#991b1b" },
    { label: "At Risk", value: atRisk, color: "#92400e" },
    { label: "Resolved Today", value: resolvedToday, color: "#166534" },
    ...(showSnoozed
      ? [{ label: "Snoozed", value: snoozed, color: "#475569" }]
      : []),
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: "8px",
        marginBottom: "18px",
      }}
    >
      {metrics.map((metric) => (
        <div
          key={metric.label}
          style={{
            border: "1px solid #d8e1ec",
            borderRadius: "14px",
            backgroundColor: "#ffffff",
            padding: "12px 14px",
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.04)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "11px",
              fontWeight: 700,
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {metric.label}
          </p>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: "22px",
              fontWeight: 700,
              color: metric.color,
            }}
          >
            {metric.value}
          </p>
        </div>
      ))}
    </div>
  );
}
