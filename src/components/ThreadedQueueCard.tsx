import { AssignmentBadge } from "./AssignmentBadge";
import { StatusPill } from "./StatusPill";
import { getIntentLabel } from "../services/analysisTaxonomy";
import { ASSIGNED_REP_MISSING_LABEL } from "../services/assignmentLogic";
import {
  formatElapsedTime,
  getPrimarySlaDisplayState,
  getSlaStateLabel,
  getSlaStateStyle,
} from "../services/sla";
import { getPriorityExplanationSummary } from "../services/priorityExplanation";
import { getAnalysisSourceDisclosure } from "../services/sourceDisclosure";
import {
  isSuppressibleSystemReportMissingBodyFailure,
  isSystemReportEmailItem,
} from "../services/systemReportEmail";
import { formatAiConfidence } from "../services/aiEmailClassification";
import {
  getAssistiveAiTaskSuggestion,
  getReviewTaskLabels,
} from "../services/taskReviewLabels";
import type {
  AssignmentReason,
  WorkflowThread,
} from "../types/actionDesk";

type ThreadedQueueCardProps = {
  thread: WorkflowThread;
  now: Date;
  isSelected: boolean;
  retryingEmailId?: string;
  currentRepId?: string;
  onSelect: () => void;
  onTakeThread: (reason: AssignmentReason) => void;
  onRetryEmail?: (emailId: string) => void;
};

function getPriorityAccent(thread: WorkflowThread): {
  borderColor: string;
  backgroundColor: string;
  shadowColor: string;
} {
  const primarySlaState = getPrimarySlaDisplayState(thread.sla.current.state);

  if (primarySlaState === "breached") {
    return {
      borderColor: "#fca5a5",
      backgroundColor: "#fff7f7",
      shadowColor: "rgba(220, 38, 38, 0.12)",
    };
  }

  if (primarySlaState === "at_risk") {
    return {
      borderColor: "#fcd34d",
      backgroundColor: "#fffbeb",
      shadowColor: "rgba(245, 158, 11, 0.12)",
    };
  }

  const priorityScore = thread.representativeItem.result?.priorityScore ?? 0;

  if (thread.status !== "resolved" && priorityScore >= 70) {
    return {
      borderColor: "#fca5a5",
      backgroundColor: "#fff7f7",
      shadowColor: "rgba(220, 38, 38, 0.12)",
    };
  }

  return {
    borderColor: "#dbe4ee",
    backgroundColor: "#ffffff",
    shadowColor: "rgba(15, 23, 42, 0.04)",
  };
}

function truncateInlineText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

export function ThreadedQueueCard({
  thread,
  now,
  isSelected,
  retryingEmailId,
  currentRepId,
  onSelect,
  onTakeThread,
  onRetryEmail,
}: ThreadedQueueCardProps) {
  const representativeItem = thread.representativeItem;
  const analysis = representativeItem.result?.analysis;
  const aiClassification = representativeItem.result?.aiClassification;
  const reviewTaskLabels = getReviewTaskLabels(analysis);
  const aiTaskSuggestion = getAssistiveAiTaskSuggestion(aiClassification);
  const analysisSourceDisclosure = getAnalysisSourceDisclosure(
    representativeItem.result?.analysisSource,
  );
  const priorityExplanationSummary = getPriorityExplanationSummary({
    item: representativeItem,
    thread,
    maxReasons: 4,
  });
  const isSuppressedSystemReportFailure =
    isSuppressibleSystemReportMissingBodyFailure(representativeItem);
  const isSystemReport = isSystemReportEmailItem(representativeItem);
  const isFailed =
    representativeItem.status === "failed" && !isSuppressedSystemReportFailure;
  const isRetrying = retryingEmailId === representativeItem.email.id;
  const presence =
    [...thread.activePresenceRecords]
      .filter((record) => !currentRepId || record.activeUserId !== currentRepId)
      .sort((left, right) => {
        if (left.presenceType !== right.presenceType) {
          return left.presenceType === "working" ? -1 : 1;
        }

        return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      })[0] ?? thread.activePresence;
  const showPresence =
    presence && (!currentRepId || presence.activeUserId !== currentRepId);
  const accent = getPriorityAccent(thread);
  const primarySlaState = getPrimarySlaDisplayState(thread.sla.current.state);
  const isOverSla = primarySlaState === "breached";
  const slaTargetLabel =
    thread.sla.current.target === "first_response" ? "First Reply" : "Resolution";
  const preview = representativeItem.previewText || representativeItem.email.body;
  const customerAssignedRepNames = thread.customerAssignedRepNames?.filter(
    (name) => name.trim().length > 0,
  );
  const assignmentResolution = thread.assignmentResolution;
  const assignmentBadgeNames =
    assignmentResolution.assignmentSource === "manual"
      ? assignmentResolution.primaryRepName
        ? [assignmentResolution.primaryRepName]
        : undefined
      : customerAssignedRepNames && customerAssignedRepNames.length > 0
        ? customerAssignedRepNames
        : assignmentResolution.primaryRepName
          ? [assignmentResolution.primaryRepName]
          : undefined;
  const displayAssignedRepName =
    assignmentResolution.primaryRepName ??
    assignmentBadgeNames?.[0] ??
    (assignmentResolution.primaryRepId ? ASSIGNED_REP_MISSING_LABEL : undefined);
  const displayAssignedRepInitials =
    thread.assignedRepInitials ?? thread.customerAssignedRepInitials?.[0];
  const displayAssignmentType =
    thread.assignmentType ??
    (displayAssignedRepName ? "auto" : undefined);

  return (
    <div
      style={{
        padding: "10px 12px",
        borderBottom: "1px solid #edf2f7",
        backgroundColor: isSelected ? "#eff6ff" : "#ffffff",
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={isSelected}
        title={
          priorityExplanationSummary
            ? `Why prioritized: ${priorityExplanationSummary}`
            : undefined
        }
        style={{
          width: "100%",
          border: `1px solid ${isSelected ? "#93c5fd" : accent.borderColor}`,
          backgroundColor: isSelected ? "#eff6ff" : accent.backgroundColor,
          boxShadow: isSelected
            ? "0 12px 24px rgba(37, 99, 235, 0.16)"
            : `0 8px 20px ${accent.shadowColor}`,
          borderRadius: "16px",
          textAlign: "left",
          padding: "16px",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "start",
            marginBottom: "12px",
          }}
        >
          <div style={{ minWidth: 0, display: "grid", gap: "6px" }}>
            <div
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#334155",
                }}
              >
                {thread.title}
              </span>
              {assignmentResolution.assignmentStatus === "unassigned" && (
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#92400e",
                    backgroundColor: "#fef3c7",
                    borderRadius: "999px",
                    padding: "3px 8px",
                  }}
                >
                  Unassigned
                </span>
              )}
              {showPresence && (
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: presence.presenceType === "working" ? "#92400e" : "#1d4ed8",
                    backgroundColor:
                      presence.presenceType === "working" ? "#fef3c7" : "#dbeafe",
                    borderRadius: "999px",
                    padding: "3px 8px",
                  }}
                >
                  {presence.presenceType === "working" ? "Working" : "Viewing"}:{" "}
                  {presence.activeUserName}
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "#0f172a",
                lineHeight: 1.35,
              }}
            >
              {representativeItem.email.subject}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "#64748b",
                lineHeight: 1.6,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {preview}
            </div>
          </div>

          <div style={{ display: "grid", gap: "6px", justifyItems: "end", flexShrink: 0 }}>
            <span
              style={{
                ...getSlaStateStyle(primarySlaState),
                fontSize: "12px",
                fontWeight: 700,
                borderRadius: "999px",
                padding: "5px 9px",
              }}
            >
              SLA: {getSlaStateLabel(primarySlaState)}
            </span>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#475569",
              }}
            >
              Waiting {formatElapsedTime(thread.oldestReceivedAt, now).replace(" ago", "")}
            </span>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: primarySlaState === "at_risk" ? "#92400e" : isOverSla ? "#991b1b" : "#166534",
              }}
            >
              {slaTargetLabel}
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: "12px",
          }}
        >
          <StatusPill status={thread.status} />
          <AssignmentBadge
            assignedRepName={displayAssignedRepName}
            assignedRepInitials={displayAssignedRepInitials}
            assignedRepNames={assignmentBadgeNames}
            assignmentType={displayAssignmentType}
          />
          {analysis && (
            <>
              <span style={badgeStyle}>{analysis.urgency} urgency</span>
              <span style={badgeStyle}>{getIntentLabel(analysis.intent)}</span>
              <span title={analysisSourceDisclosure.detail} style={badgeStyle}>
                {analysisSourceDisclosure.label}
              </span>
              {aiClassification && (
                <span
                  title="Assistive only. Action Desk rules remain authoritative."
                  style={badgeStyle}
                >
                  AI: {aiClassification.category} ({formatAiConfidence(aiClassification.confidence)})
                </span>
              )}
              {reviewTaskLabels.map((label) => (
                <span key={label} style={taskBadgeStyle}>
                  {label}
                </span>
              ))}
              {aiTaskSuggestion && (
                <span
                  title={`AI suggested task, assistive only: ${aiTaskSuggestion}`}
                  style={aiTaskBadgeStyle}
                >
                  AI task: {truncateInlineText(aiTaskSuggestion, 72)}
                </span>
              )}
            </>
          )}
          <span
            style={{
              ...badgeStyle,
              ...getSlaStateStyle(primarySlaState),
            }}
          >
            {slaTargetLabel} SLA: {getSlaStateLabel(primarySlaState)}
          </span>
          {thread.itemCount > 1 && <span style={badgeStyle}>{thread.itemCount} emails</span>}
          {thread.noteCount > 0 && <span style={badgeStyle}>{thread.noteCount} notes</span>}
          {thread.replyCount > 0 && <span style={badgeStyle}>{thread.replyCount} replies</span>}
          {thread.representativeItem.customerMatch && (
            <span
              style={{
                ...badgeStyle,
                backgroundColor: "#ccfbf1",
                color: "#0f766e",
              }}
            >
              {thread.representativeItem.customerMatch.customerName}
            </span>
          )}
          {isSystemReport && (
            <span
              style={{
                ...badgeStyle,
                backgroundColor: "#f1f5f9",
                color: "#475569",
              }}
            >
              System report
            </span>
          )}
          {isFailed && (
            <span
              style={{
                ...badgeStyle,
                backgroundColor: "#fee2e2",
                color: "#991b1b",
              }}
            >
              Failed
            </span>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "10px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: "12px", color: "#64748b" }}>
            {thread.subtitle}
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {currentRepId && !assignmentResolution.assignedRepIds.includes(currentRepId) && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onTakeThread(
                    assignmentResolution.assignmentStatus === "unassigned"
                      ? "Unassigned"
                      : "Covering for colleague",
                  );
                }}
                style={secondaryButtonStyle}
              >
                Take This
              </button>
            )}
            {isFailed && onRetryEmail && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRetryEmail(representativeItem.email.id);
                }}
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
            )}
          </div>
        </div>
      </button>
    </div>
  );
}

const badgeStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  color: "#334155",
  backgroundColor: "#e2e8f0",
  borderRadius: "999px",
  padding: "4px 8px",
};

const taskBadgeStyle: React.CSSProperties = {
  ...badgeStyle,
  backgroundColor: "#dcfce7",
  color: "#166534",
};

const aiTaskBadgeStyle: React.CSSProperties = {
  ...badgeStyle,
  backgroundColor: "#dbeafe",
  color: "#1d4ed8",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#0f172a",
  borderRadius: "8px",
  padding: "5px 9px",
  fontSize: "12px",
  fontWeight: 700,
  cursor: "pointer",
};
