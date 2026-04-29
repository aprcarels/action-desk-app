import { MacroMenu } from "./MacroMenu";
import { SnoozeMenu } from "./SnoozeMenu";
import { TAKE_THREAD_REASON_OPTIONS } from "../services/manualAssignment";
import type { MacroDefinition, MacroId } from "../services/macros";
import type {
  AssignmentReason,
  RepProfile,
  WorkflowStatus,
  WorkflowThread,
} from "../types/actionDesk";

type DetailActionBarProps = {
  thread: WorkflowThread;
  currentRep?: RepProfile;
  macros: MacroDefinition[];
  currentRepAvailable: boolean;
  hasExactOutlookLink: boolean;
  outlookStatusMessage?: string | null;
  canTakeThread: boolean;
  takeThreadReason: AssignmentReason;
  onTakeThreadReasonChange: (reason: AssignmentReason) => void;
  onOpenInOutlook: () => void;
  onThreadStatusChange: (status: WorkflowStatus) => void;
  onApplyMacro: (macroId: MacroId) => void;
  onLogReply: () => void;
  onJumpToNotes: () => void;
  onSnooze: (
    mode: "1h" | "4h" | "tomorrow" | "custom",
    customValue?: string,
  ) => void;
  onUnsnooze: () => void;
  onTakeThread: (reason: AssignmentReason) => void;
};

export function DetailActionBar({
  thread,
  currentRep,
  macros,
  currentRepAvailable,
  hasExactOutlookLink,
  outlookStatusMessage,
  canTakeThread,
  takeThreadReason,
  onTakeThreadReasonChange,
  onOpenInOutlook,
  onThreadStatusChange,
  onApplyMacro,
  onLogReply,
  onJumpToNotes,
  onSnooze,
  onUnsnooze,
  onTakeThread,
}: DetailActionBarProps) {
  return (
    <div
      style={{
        position: "sticky",
        top: "12px",
        zIndex: 1,
        border: "1px solid #d8e1ec",
        borderRadius: "16px",
        backgroundColor: "rgba(255, 255, 255, 0.96)",
        boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
        padding: "14px 16px",
        backdropFilter: "blur(10px)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: "12px",
        }}
      >
        <div style={{ display: "grid", gap: "4px" }}>
          <span style={eyebrowStyle}>Action Bar</span>
          <span style={{ fontSize: "13px", color: "#475569" }}>
            Keep status, quick actions, notes, and snooze controls in one place.
          </span>
        </div>
        <div style={{ display: "grid", gap: "6px", justifyItems: "end" }}>
          {canTakeThread && currentRep && (
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={takeThreadReason}
                onChange={(event) =>
                  onTakeThreadReasonChange(event.target.value as AssignmentReason)
                }
                style={selectStyle}
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
          )}
          {!canTakeThread && thread.assignedRepId === currentRep?.id && (
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#166534" }}>
              Assigned to you
            </span>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: "12px",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            alignItems: "end",
          }}
        >
          <label style={{ display: "grid", gap: "6px", minWidth: "180px" }}>
            <span style={eyebrowStyle}>Status</span>
            <select
              value={thread.status}
              onChange={(event) =>
                onThreadStatusChange(event.target.value as WorkflowStatus)
              }
              style={selectStyle}
            >
              <option value="new">New</option>
              <option value="in_progress">In Progress</option>
              <option value="waiting_on_customer">Waiting on Customer</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>

          <div style={{ display: "grid", gap: "6px", minWidth: "260px", flex: "1 1 280px" }}>
            <span style={eyebrowStyle}>Quick Actions</span>
            <MacroMenu
              macros={macros}
              disabled={!currentRepAvailable}
              compact={true}
              onApplyMacro={onApplyMacro}
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <button
            type="button"
            onClick={onOpenInOutlook}
            style={{
              ...secondaryButtonStyle,
              backgroundColor: hasExactOutlookLink ? "#ffffff" : "#fff7ed",
              color: hasExactOutlookLink ? "#0f172a" : "#9a3412",
            }}
          >
            Open in Outlook
          </button>
          <button type="button" onClick={onLogReply} style={secondaryButtonStyle}>
            Log Reply
          </button>
          <button type="button" onClick={onJumpToNotes} style={secondaryButtonStyle}>
            Add Note
          </button>
          <div style={{ display: "grid", gap: "6px", flex: "1 1 320px" }}>
            <span style={eyebrowStyle}>Snooze</span>
            <SnoozeMenu
              compact={true}
              hasActiveSnooze={Boolean(thread.snooze)}
              onSnooze={onSnooze}
              onUnsnooze={onUnsnooze}
            />
          </div>
        </div>
        {outlookStatusMessage && (
          <div
            style={{
              border: "1px solid #fed7aa",
              backgroundColor: "#fff7ed",
              borderRadius: "12px",
              padding: "10px 12px",
              fontSize: "13px",
              lineHeight: 1.6,
              color: "#9a3412",
            }}
          >
            {outlookStatusMessage}
          </div>
        )}
      </div>
    </div>
  );
}

const eyebrowStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const selectStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#0f172a",
  borderRadius: "10px",
  padding: "9px 12px",
  fontSize: "13px",
  fontWeight: 700,
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#0f172a",
  borderRadius: "10px",
  padding: "9px 12px",
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
};
