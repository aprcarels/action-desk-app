import { AssignmentBadge } from "./AssignmentBadge";
import { CollapsibleSection } from "./CollapsibleSection";
import { StatusPill } from "./StatusPill";
import { getRiskLabel, getIntentLabel } from "../services/analysisTaxonomy";
import { ASSIGNED_REP_MISSING_LABEL } from "../services/assignmentLogic";
import { getCustomerMatchSourceLabel } from "../services/customerMatching";
import { TAKE_THREAD_REASON_OPTIONS } from "../services/manualAssignment";
import {
  formatElapsedTime,
  formatMinutesAsDuration,
  getPrimarySlaDisplayState,
  getSlaStateLabel,
  getSlaStateStyle,
} from "../services/sla";
import { getPriorityExplanationReasons } from "../services/priorityExplanation";
import { getAnalysisSourceDisclosure } from "../services/sourceDisclosure";
import { formatAiConfidence } from "../services/aiEmailClassification";
import type {
  AssignmentReason,
  PilotQueueItemState,
  PilotUsefulnessFeedback,
  ProcessedEmail,
  RepProfile,
  WorkflowThread,
  WorkflowThreadSlaStatus,
} from "../types/actionDesk";

type ContextPanelProps = {
  item: ProcessedEmail;
  thread: WorkflowThread;
  reps: RepProfile[];
  currentRep?: RepProfile;
  pilotMode: boolean;
  pilotItemState?: PilotQueueItemState;
  orderDataMessage?: string;
  canTakeThread: boolean;
  takeThreadReason: AssignmentReason;
  onTakeThreadReasonChange: (reason: AssignmentReason) => void;
  onTakeThread: (reason: AssignmentReason) => void;
  onRecomputePriority: () => void;
  onMarkPilotItemActive: () => void;
  onMarkPilotItemDone: () => void;
  onMarkPilotItemNotRelevant: () => void;
  onMarkPilotItemWaitingOnCustomer: () => void;
  onSnoozePilotItemUntilTomorrow: () => void;
  onSetPilotUsefulness: (usefulness: PilotUsefulnessFeedback) => void;
};

function getPriorityLabel(priorityScore: number): "High" | "Medium" | "Low" {
  if (priorityScore >= 70) {
    return "High";
  }

  if (priorityScore >= 40) {
    return "Medium";
  }

  return "Low";
}

function getRepName(reps: RepProfile[], repId?: string): string {
  if (!repId) {
    return "Unassigned";
  }

  return reps.find((rep) => rep.id === repId)?.name ?? ASSIGNED_REP_MISSING_LABEL;
}

function getAssignedRepSummary(thread: WorkflowThread): string {
  const resolution = thread.assignmentResolution;

  if (resolution.assignmentStatus === "unassigned") {
    return "Unassigned";
  }

  if (
    resolution.assignmentSource !== "manual" &&
    resolution.assignedRepNames.length > 1
  ) {
    return `${resolution.assignedRepNames[0]} +${resolution.assignedRepNames.length - 1}`;
  }

  return (
    resolution.primaryRepName ??
    (resolution.primaryRepId ? ASSIGNED_REP_MISSING_LABEL : "Unassigned")
  );
}

function formatSlaTiming(sla: WorkflowThreadSlaStatus): string {
  return `${getSlaStateLabel(sla.state)} - elapsed ${formatMinutesAsDuration(
    sla.elapsedMinutes,
  )} / target ${formatMinutesAsDuration(sla.targetMinutes)}`;
}

function Field({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: React.ReactNode;
  emphasized?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: "4px" }}>
      <span style={fieldLabelStyle}>{label}</span>
      <div
        style={{
          fontSize: emphasized ? "14px" : "13px",
          lineHeight: 1.5,
          fontWeight: emphasized ? 700 : 500,
          color: emphasized ? "#0f172a" : "#334155",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function ContextPanel({
  item,
  thread,
  reps,
  currentRep,
  pilotMode,
  orderDataMessage,
  canTakeThread,
  takeThreadReason,
  onTakeThreadReasonChange,
  onTakeThread,
  onRecomputePriority,
  onMarkPilotItemActive,
  onMarkPilotItemDone,
  onMarkPilotItemNotRelevant,
  onMarkPilotItemWaitingOnCustomer,
  onSnoozePilotItemUntilTomorrow,
  onSetPilotUsefulness,
}: ContextPanelProps) {
  const priorityScore = item.result?.priorityScore ?? 0;
  const assignmentResolution = thread.assignmentResolution;
  const customerOwnerNames =
    assignmentResolution.assignedRepNames.length > 0
      ? assignmentResolution.assignedRepNames
      : (
          item.customerMatch?.ownerRepIds ??
          (item.customerMatch?.ownerRepId ? [item.customerMatch.ownerRepId] : [])
        ).map((repId) => getRepName(reps, repId));
  const assignmentBadgeNames =
    assignmentResolution.assignmentSource === "manual"
      ? assignmentResolution.primaryRepName
        ? [assignmentResolution.primaryRepName]
        : undefined
      : assignmentResolution.assignedRepNames.length > 0
        ? assignmentResolution.assignedRepNames
        : assignmentResolution.primaryRepName
          ? [assignmentResolution.primaryRepName]
          : undefined;
  const currentSlaDisplayState = getPrimarySlaDisplayState(thread.sla.current.state);
  const priorityExplanationReasons = getPriorityExplanationReasons({ item, thread });
  const analysisSourceDisclosure = getAnalysisSourceDisclosure(
    item.result?.analysisSource,
  );
  const aiClassification = item.result?.aiClassification;

  return (
    <aside
      style={{
        display: "grid",
        gap: "12px",
        alignSelf: "start",
      }}
    >
      <CollapsibleSection
        title="Workflow"
        subtitle="Status, ownership, and workflow overrides"
        defaultOpen={true}
      >
        <div style={{ display: "grid", gap: "12px" }}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <StatusPill status={thread.status} />
            <AssignmentBadge
              assignedRepName={
                assignmentResolution.primaryRepName ??
                (assignmentResolution.primaryRepId ? ASSIGNED_REP_MISSING_LABEL : undefined)
              }
              assignedRepInitials={thread.assignedRepInitials}
              assignedRepNames={assignmentBadgeNames}
              assignmentType={assignmentResolution.assignmentSource === "manual" ? "manual" : "auto"}
            />
          </div>
          <Field
            label="Assigned Rep"
            value={getAssignedRepSummary(thread)}
            emphasized={true}
          />
          <Field
            label="Assignment Mode"
            value={
              thread.assignmentType === "manual"
                ? "Manual override"
                : assignmentResolution.assignmentStatus !== "unassigned"
                  ? "Auto-assigned"
                  : "Not assigned yet"
            }
          />
          <Field
            label="Queue Scope"
            value={
              customerOwnerNames.length > 0
                ? `Customer owned by ${customerOwnerNames.join(", ")}`
                : "Shared / unowned work"
            }
          />
          {thread.currentAssignment?.reason && (
            <Field label="Manual Reason" value={thread.currentAssignment.reason} />
          )}
          {thread.updatedAt && (
            <Field
              label="Last Workflow Update"
              value={`${new Date(thread.updatedAt).toLocaleString()}${
                thread.updatedByRepName ? ` by ${thread.updatedByRepName}` : ""
              }`}
            />
          )}
          {currentRep && canTakeThread && (
            <div style={{ display: "grid", gap: "8px" }}>
              <span style={fieldLabelStyle}>Manual Takeover</span>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                <select
                  value={takeThreadReason}
                  onChange={(event) =>
                    onTakeThreadReasonChange(event.target.value as AssignmentReason)
                  }
                  style={secondarySelectStyle}
                >
                  {TAKE_THREAD_REASON_OPTIONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onTakeThread(takeThreadReason)}
                  style={secondaryButtonStyle}
                >
                  Take This
                </button>
              </div>
            </div>
          )}
          {currentRep &&
            !canTakeThread &&
            assignmentResolution.assignedRepIds.includes(currentRep.id) && (
            <Field label="Takeover" value="Already assigned to you" />
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="SLA"
        subtitle="Age, timing, and risk of missing the queue target"
        defaultOpen={true}
      >
        <div style={{ display: "grid", gap: "12px" }}>
          <div
            style={{
              ...getSlaStateStyle(currentSlaDisplayState),
              borderRadius: "12px",
              padding: "10px 12px",
              fontSize: "13px",
              fontWeight: 700,
            }}
          >
            {thread.sla.current.target === "first_response"
              ? `First Response SLA: ${getSlaStateLabel(currentSlaDisplayState)}`
              : `Resolution SLA: ${getSlaStateLabel(currentSlaDisplayState)}`}
          </div>
          <Field label="Received" value={new Date(item.email.receivedAt).toLocaleString()} />
          <Field label="Oldest in Thread" value={formatElapsedTime(thread.oldestReceivedAt)} />
          <Field label="Latest Activity" value={formatElapsedTime(thread.latestActivityAt)} />
          <Field
            label="First Response SLA"
            value={formatSlaTiming(thread.sla.firstResponse)}
            emphasized={thread.sla.firstResponse.state === "at_risk" || thread.sla.firstResponse.state === "breached"}
          />
          <Field
            label="First Reply"
            value={
              thread.firstReplyAt
                ? `${new Date(thread.firstReplyAt).toLocaleString()}${
                    thread.firstReplySource === "thread"
                      ? " (detected in thread)"
                      : ""
                  }`
                : "No reply detected yet"
            }
          />
          <Field
            label="Resolution SLA"
            value={formatSlaTiming(thread.sla.resolution)}
            emphasized={thread.sla.resolution.state === "at_risk" || thread.sla.resolution.state === "breached"}
          />
          <Field
            label="Resolution Target"
            value={
              thread.resolvedAt
                ? `Resolved ${new Date(thread.resolvedAt).toLocaleString()}`
                : `Due ${new Date(thread.sla.resolution.dueAt).toLocaleString()}`
            }
          />
          <Field
            label="Current SLA Window"
            value={
              thread.sla.current.target === "first_response"
                ? "Waiting for first reply"
                : thread.status === "resolved"
                  ? "Measured to resolved time"
                  : "Measured until the issue is resolved"
            }
          />
          <Field
            label="Warning Starts"
            value={formatMinutesAsDuration(thread.sla.current.warningStartsAtMinutes)}
          />
          {thread.snooze && (
            <Field
              label="Snoozed Until"
              value={`${new Date(thread.snooze.until).toLocaleString()} by ${thread.snooze.snoozedByRepName}`}
            />
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Customer"
        subtitle="Match details and assignment context"
        defaultOpen={true}
      >
        <div style={{ display: "grid", gap: "12px" }}>
          <Field
            label="Matched Customer"
            value={item.customerMatch?.customerName ?? "No customer match"}
            emphasized={Boolean(item.customerMatch)}
          />
          <Field
            label="Customer Owner"
            value={
              customerOwnerNames.length > 0
                ? customerOwnerNames.join(", ")
                : "Unassigned"
            }
          />
          <Field
            label="Matched Source"
            value={
              item.customerMatch
                ? getCustomerMatchSourceLabel(item.customerMatch.matchedOn)
                : "Not matched"
            }
          />
          <Field label="Sender" value={`${item.email.senderName} (${item.email.senderEmail})`} />
          <Field label="Thread Label" value={thread.title} />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Order Context"
        subtitle="Order and shipment context surfaced for the current thread"
        defaultOpen={true}
      >
        <div style={{ display: "grid", gap: "12px" }}>
          <Field
            label="Order Number"
            value={item.result?.orderContext?.orderNumber ?? item.result?.analysis.orderNumber ?? "Not provided"}
            emphasized={Boolean(item.result?.orderContext?.orderNumber ?? item.result?.analysis.orderNumber)}
          />
          <Field
            label="Shipment Status"
            value={item.result?.orderContext?.shipmentStatus ?? "Not available"}
          />
          <Field
            label="Order Status"
            value={item.result?.orderContext?.status ?? "Not available"}
          />
          <Field
            label="Last Updated"
            value={item.result?.orderContext?.lastUpdated ?? "Not available"}
          />
          {!item.result?.orderContext && orderDataMessage && (
            <div
              style={{
                border: "1px dashed #cbd5e1",
                borderRadius: "12px",
                padding: "10px 12px",
                fontSize: "12px",
                lineHeight: 1.6,
                color: "#475569",
              }}
            >
              {orderDataMessage}
            </div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Triage Signals"
        subtitle="Priority, intent, urgency, and top issues"
        defaultOpen={true}
      >
        <div style={{ display: "grid", gap: "12px" }}>
          <Field
            label="Analysis Source"
            value={
              <span
                title={analysisSourceDisclosure.detail}
                style={sourceDisclosureBadgeStyle}
              >
                {analysisSourceDisclosure.label}
              </span>
            }
          />
          {aiClassification && (
            <Field
              label="AI Assisted"
              value={`${aiClassification.category} | ${formatAiConfidence(aiClassification.confidence)} confidence`}
            />
          )}
          <Field label="Intent" value={getIntentLabel(item.result?.analysis.intent ?? "general_support")} emphasized={true} />
          <Field label="Urgency" value={item.result?.analysis.urgency ?? "Unknown"} />
          <Field
            label="Priority Score"
            value={`${priorityScore} (${getPriorityLabel(priorityScore)})`}
          />
          <div style={priorityExplanationBoxStyle}>
            <span style={priorityExplanationLabelStyle}>Why prioritized</span>
            {priorityExplanationReasons.length > 0 ? (
              <ul style={priorityExplanationListStyle}>
                {priorityExplanationReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : (
              <div style={priorityExplanationEmptyStyle}>
                No priority drivers available yet.
              </div>
            )}
          </div>
          <Field
            label="Reply Guidance"
            value={item.result?.analysis.replyNeeded ?? "Unknown"}
          />
          <Field
            label="Top Issues"
            value={
              item.result?.analysis.risks.length
                ? item.result.analysis.risks.map((risk) => getRiskLabel(risk)).join(", ")
                : "No major issues flagged"
            }
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Workflow History"
        subtitle="Counts and ownership changes"
        defaultOpen={false}
      >
        <div style={{ display: "grid", gap: "12px" }}>
          <Field label="Messages" value={thread.itemCount} />
          <Field label="Notes" value={thread.noteCount} />
          <Field label="Replies Logged" value={thread.replyCount} />
          {thread.assignmentHistory.length > 0 && (
            <div style={{ display: "grid", gap: "8px" }}>
              <span style={fieldLabelStyle}>Assignment History</span>
              {thread.assignmentHistory.map((record, index) => (
                <div key={`${record.assignedAt}-${index}`} style={historyCardStyle}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
                    {record.assignedRepName}
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>
                    {record.type === "manual" ? "Manual override" : "Auto-assigned"} on{" "}
                    {new Date(record.assignedAt).toLocaleString()}
                  </div>
                  {record.reason && (
                    <div style={{ fontSize: "12px", color: "#334155" }}>
                      Reason: {record.reason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleSection>

      {pilotMode && (
        <CollapsibleSection
          title="Pilot Controls"
          subtitle="Queue-state actions kept out of the main conversation pane"
          defaultOpen={false}
        >
          <div style={{ display: "grid", gap: "10px" }}>
            <button type="button" onClick={onRecomputePriority} style={secondaryButtonStyle}>
              Recompute Priority
            </button>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" onClick={onMarkPilotItemActive} style={secondaryButtonStyle}>
                Back to Active
              </button>
              <button type="button" onClick={onMarkPilotItemDone} style={secondaryButtonStyle}>
                Done
              </button>
              <button
                type="button"
                onClick={onMarkPilotItemWaitingOnCustomer}
                style={secondaryButtonStyle}
              >
                Waiting on Customer
              </button>
              <button
                type="button"
                onClick={onSnoozePilotItemUntilTomorrow}
                style={secondaryButtonStyle}
              >
                Snooze to Tomorrow
              </button>
              <button
                type="button"
                onClick={onMarkPilotItemNotRelevant}
                style={secondaryButtonStyle}
              >
                Not Relevant
              </button>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => onSetPilotUsefulness("helpful")}
                style={secondaryButtonStyle}
              >
                Helpful
              </button>
              <button
                type="button"
                onClick={() => onSetPilotUsefulness("not_helpful")}
                style={secondaryButtonStyle}
              >
                Not Helpful
              </button>
            </div>
          </div>
        </CollapsibleSection>
      )}
    </aside>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const priorityExplanationBoxStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  backgroundColor: "#f8fafc",
  padding: "10px 12px",
  display: "grid",
  gap: "6px",
};

const priorityExplanationLabelStyle: React.CSSProperties = {
  ...fieldLabelStyle,
  textTransform: "none",
  letterSpacing: 0,
};

const priorityExplanationListStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: "18px",
  display: "grid",
  gap: "4px",
  fontSize: "13px",
  lineHeight: 1.5,
  color: "#334155",
};

const priorityExplanationEmptyStyle: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: 1.5,
  color: "#64748b",
};

const sourceDisclosureBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  width: "fit-content",
  fontSize: "12px",
  fontWeight: 700,
  color: "#334155",
  backgroundColor: "#e2e8f0",
  borderRadius: "999px",
  padding: "4px 8px",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#0f172a",
  borderRadius: "10px",
  padding: "8px 12px",
  fontSize: "12px",
  fontWeight: 700,
  cursor: "pointer",
};

const secondarySelectStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#0f172a",
  borderRadius: "10px",
  padding: "8px 12px",
  fontSize: "12px",
  fontWeight: 700,
};

const historyCardStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  backgroundColor: "#f8fafc",
  padding: "10px 12px",
  display: "grid",
  gap: "4px",
};
