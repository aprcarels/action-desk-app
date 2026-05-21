import { formatElapsedTime } from "../services/sla";
import type { WorkflowProcessingMetrics } from "../services/workflowSelectors";

type MetricsBarProps = {
  totalOpen: number;
  unassigned: number;
  avgWaitMinutes: number;
  oldestOpenMinutes: number;
  breached: number;
  atRisk: number;
  resolvedToday: number;
  snoozed: number;
  processingMetrics?: WorkflowProcessingMetrics;
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
  processingMetrics,
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
    ...(processingMetrics
      ? [
          {
            label: "Loaded Emails",
            value: processingMetrics.totalLoaded,
            color: "#0f172a",
          },
          {
            label: "Processed Emails",
            value: processingMetrics.totalProcessed,
            color: "#0f172a",
          },
          {
            label: "Visible Queue Items",
            value: processingMetrics.visibleQueueItems,
            color: "#1d4ed8",
          },
          {
            label: "Hidden Pilot",
            value: processingMetrics.hiddenByPilotState,
            color: "#64748b",
          },
          {
            label: "Hidden Status",
            value: processingMetrics.hiddenByStatusFilter,
            color: "#64748b",
          },
          {
            label: "Hidden Noise",
            value: processingMetrics.hiddenAsVendorSpamNoise,
            color: "#92400e",
          },
          {
            label: "Hidden No Action",
            value: processingMetrics.hiddenAsNoAction,
            color: "#64748b",
          },
          {
            label: "Reply Recommended",
            value: processingMetrics.replyRecommended,
            color: "#166534",
          },
          {
            label: "Review Needed",
            value: processingMetrics.reviewNeeded,
            color: "#1d4ed8",
          },
          {
            label: "No Action",
            value: processingMetrics.noActionNeeded,
            color: "#64748b",
          },
          {
            label: "Vendor Suppressed",
            value: processingMetrics.vendorSuppressed,
            color: "#92400e",
          },
          {
            label: "Internal Ops",
            value: processingMetrics.internalOperational,
            color: "#475569",
          },
          {
            label: "Operational Logistics",
            value: processingMetrics.operationalLogistics,
            color: "#0f766e",
          },
          {
            label: "Operational Exceptions",
            value: processingMetrics.operationalExceptions,
            color: "#0f766e",
          },
          {
            label: "Operational Reviews",
            value: processingMetrics.reviewNeededOperationalItems,
            color: "#0f766e",
          },
          {
            label: "Assigned Reviews",
            value: processingMetrics.assignedReviewNeededItems,
            color: "#166534",
          },
        ]
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
