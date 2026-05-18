import { useEffect, useRef, useState } from "react";
import { ContextPanel } from "./ContextPanel";
import { DetailActionBar } from "./DetailActionBar";
import { QueueNavigationControls } from "./QueueNavigationControls";
import { StatusPill } from "./StatusPill";
import { ThreadConversationView } from "./ThreadConversationView";
import { getCustomerMatchSourceLabel } from "../services/customerMatching";
import {
  canCurrentUserTakeThread,
  getDefaultTakeThreadReason,
} from "../services/manualAssignment";
import { canAccessLocation } from "../services/locations";
import {
  getOutlookOpenTarget,
  hasExactOutlookMessageLink,
} from "../services/openInOutlook";
import { getQueueAgeInfo } from "../services/queueAging";
import {
  isSuppressibleSystemReportMissingBodyFailure,
  isSystemReportEmailItem,
} from "../services/systemReportEmail";
import type { MacroDefinition, MacroId } from "../services/macros";
import type {
  AssignmentReason,
  PilotQueueItemState,
  PilotUsefulnessFeedback,
  ProcessedEmail,
  RepProfile,
  WorkflowStatus,
  WorkflowThread,
} from "../types/actionDesk";

type EmailDetailProps = {
  item?: ProcessedEmail;
  thread?: WorkflowThread;
  reps: RepProfile[];
  currentRep?: RepProfile;
  pilotMode: boolean;
  pilotItemState?: PilotQueueItemState;
  orderDataMessage?: string;
  hasReplyDraft: boolean;
  copyFeedback: "idle" | "success" | "error";
  caseCopyFeedback: "idle" | "success" | "error";
  rawCaseCopyFeedback: "idle" | "success" | "error";
  regeneratingReply: boolean;
  replyActionError: string | null;
  macros: MacroDefinition[];
  showBackButton?: boolean;
  isCompactWorkspace?: boolean;
  navigation?: {
    currentPosition?: number;
    total: number;
    hasPrevious: boolean;
    hasNext: boolean;
    onPrevious: () => void;
    onNext: () => void;
  };
  onBackToQueue?: () => void;
  onCopyReply: () => boolean | Promise<boolean>;
  onCopyCaseForReview: () => void;
  onCopyRawCaseJson: () => void;
  onRegenerateReply: () => void;
  onThreadStatusChange: (threadId: string, status: WorkflowStatus) => void;
  onAddInternalNote: (threadId: string, body: string) => void;
  onLogReply: (threadId: string) => void;
  onSnoozeThread: (
    threadId: string,
    mode: "1h" | "4h" | "tomorrow" | "custom",
    customValue?: string,
  ) => void;
  onUnsnoozeThread: (threadId: string) => void;
  onTakeThread: (threadId: string, reason: AssignmentReason) => void;
  onAssignThread: (threadId: string, repId: string) => void;
  onApplyMacro: (threadId: string, macroId: MacroId) => void;
  onRecomputePriority: () => void;
  onMarkPilotItemActive: () => void;
  onMarkPilotItemDone: () => void;
  onMarkPilotItemNotRelevant: () => void;
  onMarkPilotItemWaitingOnCustomer: () => void;
  onSnoozePilotItemUntilTomorrow: () => void;
  onSetPilotUsefulness: (usefulness: PilotUsefulnessFeedback) => void;
  showDebugActions?: boolean;
};

function formatReceivedTime(receivedAt: string) {
  return new Date(receivedAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isOutlookEmailSource(source?: ProcessedEmail["email"]["source"]) {
  return source === "outlook_import" || source === "outlook_graph";
}

function renderStateCard(
  title: string,
  body: React.ReactNode,
  emphasisColor = "#334155",
) {
  return (
    <div style={panelStyle}>
      <h2 style={titleStyle}>{title}</h2>
      <div
        style={{
          border: "1px solid #dbe4ee",
          borderRadius: "14px",
          backgroundColor: "#fcfdff",
          padding: "16px",
          fontSize: "14px",
          lineHeight: 1.7,
          color: emphasisColor,
        }}
      >
        {body}
      </div>
    </div>
  );
}

export function EmailDetail({
  item,
  thread,
  reps,
  currentRep,
  pilotMode,
  pilotItemState,
  orderDataMessage,
  hasReplyDraft,
  copyFeedback,
  caseCopyFeedback,
  rawCaseCopyFeedback,
  regeneratingReply,
  replyActionError,
  macros,
  showBackButton,
  isCompactWorkspace = false,
  navigation,
  onBackToQueue,
  onCopyReply,
  onCopyCaseForReview,
  onCopyRawCaseJson,
  onRegenerateReply,
  onThreadStatusChange,
  onAddInternalNote,
  onLogReply,
  onSnoozeThread,
  onUnsnoozeThread,
  onTakeThread,
  onAssignThread,
  onApplyMacro,
  onRecomputePriority,
  onMarkPilotItemActive,
  onMarkPilotItemDone,
  onMarkPilotItemNotRelevant,
  onMarkPilotItemWaitingOnCustomer,
  onSnoozePilotItemUntilTomorrow,
  onSetPilotUsefulness,
  showDebugActions = false,
}: EmailDetailProps) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [replyHistoryOpen, setReplyHistoryOpen] = useState(false);
  const [olderMessagesOpen, setOlderMessagesOpen] = useState(false);
  const [showContextPanel, setShowContextPanel] = useState(!isCompactWorkspace);
  const [outlookStatusMessage, setOutlookStatusMessage] = useState<string | null>(
    null,
  );
  const [takeThreadReason, setTakeThreadReason] = useState<AssignmentReason>(
    "Unassigned",
  );
  const notesComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const notesSectionRef = useRef<HTMLDivElement | null>(null);
  const replyHistorySectionRef = useRef<HTMLDivElement | null>(null);
  const olderMessagesSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!thread) {
      return;
    }

    setNotesOpen(thread.notes.length > 0);
    setReplyHistoryOpen(thread.replyLog.length > 0);
    setOlderMessagesOpen(false);
    setTakeThreadReason(getDefaultTakeThreadReason(thread));
  }, [thread?.id]);

  useEffect(() => {
    setShowContextPanel(!isCompactWorkspace);
  }, [isCompactWorkspace]);

  useEffect(() => {
    setOutlookStatusMessage(null);
  }, [item?.email.id]);

  const isSystemReport = item ? isSystemReportEmailItem(item) : false;
  const suppressMissingBodyFailure = item
    ? isSuppressibleSystemReportMissingBodyFailure(item)
    : false;

  useEffect(() => {
    if (!item || !isSystemReport) {
      return;
    }

    console.info("[Action Desk diagnostics] renderedSystemReportEmail", {
      emailId: item.email.id,
      senderEmail: item.email.senderEmail,
      subject: item.email.subject,
      status: item.status,
      workType: item.result?.analysis.workType,
    });
  }, [
    isSystemReport,
    item?.email.id,
    item?.email.senderEmail,
    item?.email.subject,
    item?.result?.analysis.workType,
    item?.status,
  ]);

  useEffect(() => {
    if (!item || !suppressMissingBodyFailure) {
      return;
    }

    console.info("[Action Desk diagnostics] suppressedMissingBodyFailure", {
      emailId: item.email.id,
      senderEmail: item.email.senderEmail,
      subject: item.email.subject,
      processingError: item.processingError,
    });
  }, [
    item?.email.id,
    item?.email.senderEmail,
    item?.email.subject,
    item?.processingError,
    suppressMissingBodyFailure,
  ]);

  if (!item) {
    return renderStateCard(
      "Support Workspace",
      "Select a queue item to review the conversation, draft the response, and update the workflow context.",
    );
  }

  if (suppressMissingBodyFailure) {
    return renderStateCard(
      item.email.subject,
      <>
        <p style={{ margin: 0 }}>
          <strong>Sender:</strong> {item.email.senderName} ({item.email.senderEmail})
        </p>
        <p style={{ margin: "8px 0 0" }}>
          System/report email. No customer-service analysis or reply is needed.
        </p>
        <pre style={{ ...bodyBlockStyle, marginTop: "16px" }}>
          {item.email.body.trim() || item.email.previewText?.trim() ||
            "No readable message body was provided by Outlook for this system report."}
        </pre>
      </>,
      "#475569",
    );
  }

  if (item.status === "failed") {
    return renderStateCard(
      item.email.subject,
      <>
        <p style={{ margin: 0 }}>
          <strong>Sender:</strong> {item.email.senderName} ({item.email.senderEmail})
        </p>
        <p style={{ margin: "8px 0 0", color: "#991b1b" }}>
          {item.processingError ?? "This email could not be processed."}
        </p>
        <pre style={{ ...bodyBlockStyle, marginTop: "16px" }}>
          {item.email.body.trim() || "No email body available for this message."}
        </pre>
      </>,
      "#991b1b",
    );
  }

  if (item.status === "pending" || !item.result) {
    return renderStateCard(
      item.email.subject,
      <>
        <p style={{ margin: 0 }}>
          <strong>Sender:</strong> {item.email.senderName} ({item.email.senderEmail})
        </p>
        <p style={{ margin: "8px 0 0" }}>This email is currently being processed.</p>
        <pre style={{ ...bodyBlockStyle, marginTop: "16px" }}>
          {item.email.body.trim() || "No email body available for this message."}
        </pre>
      </>,
    );
  }

  if (!thread) {
    return renderStateCard(
      item.email.subject,
      "The selected email is available, but the thread context could not be built right now.",
    );
  }

  const currentItem = item;
  const hasExactOutlookLink = hasExactOutlookMessageLink(item);
  const canTakeThread = canCurrentUserTakeThread(thread, currentRep);
  const assignableReps = reps.filter((rep) => {
    if (rep.role !== "rep" || rep.isActive === false) {
      return false;
    }

    if (!currentRep) {
      return false;
    }

    if (currentRep.role === "admin") {
      return true;
    }

    if (currentRep.role === "supervisor") {
      return canAccessLocation(currentRep, rep.locationId);
    }

    return rep.id === currentRep.id;
  });
  const queueAge = getQueueAgeInfo({
    receivedAt: thread.oldestReceivedAt,
    pilotItemState: pilotMode ? pilotItemState : undefined,
  });
  const presence = thread.activePresence;
  const presenceCopy = presence
    ? presence.activeUserId === currentRep?.id
      ? `You are ${presence.presenceType === "working" ? "working" : "viewing"} this thread`
      : `${presence.activeUserName} is ${
          presence.presenceType === "working" ? "actively working" : "viewing"
        } this thread`
    : undefined;

  function openCurrentItemInOutlook(options?: { draftCopied?: boolean }) {
    const outlookTarget = getOutlookOpenTarget(currentItem);

    if (outlookTarget.type === "missing_exact_link") {
      setOutlookStatusMessage(
        options?.draftCopied
          ? `Reply draft copied, but ${outlookTarget.message}`
          : outlookTarget.message,
      );
      return false;
    }

    setOutlookStatusMessage(null);
    window.open(outlookTarget.url, "_blank", "noopener,noreferrer");
    return true;
  }

  async function copyReplyAndOpenOutlook() {
    if (!hasReplyDraft) {
      return;
    }

    const copied = await onCopyReply();

    if (!copied) {
      setOutlookStatusMessage(
        "Reply draft could not be copied. Outlook was not opened because there is no draft on your clipboard.",
      );
      return;
    }

    openCurrentItemInOutlook({ draftCopied: true });
  }

  function jumpToNotes() {
    setNotesOpen(true);
    window.setTimeout(() => {
      notesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      notesComposerRef.current?.focus();
    }, 0);
  }

  return (
    <div style={panelStyle}>
      <div style={{ display: "grid", gap: "16px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "start",
            flexWrap: "wrap",
          }}
        >
          <QueueNavigationControls
            currentPosition={navigation?.currentPosition}
            total={navigation?.total ?? 0}
            hasPrevious={navigation?.hasPrevious ?? false}
            hasNext={navigation?.hasNext ?? false}
            onPrevious={navigation?.onPrevious ?? (() => undefined)}
            onNext={navigation?.onNext ?? (() => undefined)}
            onBackToQueue={showBackButton ? onBackToQueue : undefined}
          />
          <button
            type="button"
            onClick={() => setShowContextPanel((current) => !current)}
            style={secondaryButtonStyle}
          >
            {showContextPanel ? "Hide Context" : "Show Context"}
          </button>
        </div>

        <header style={{ display: "grid", gap: "12px" }}>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={eyebrowStyle}>Conversation Workspace</span>
            <StatusPill status={thread.status} />
            <span
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#334155",
                backgroundColor: "#e2e8f0",
                borderRadius: "999px",
                padding: "4px 8px",
              }}
            >
              {queueAge.label}
            </span>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#334155",
                backgroundColor: "#e2e8f0",
                borderRadius: "999px",
                padding: "4px 8px",
              }}
            >
              {thread.itemCount} {thread.itemCount === 1 ? "email" : "emails"}
            </span>
            {item.customerMatch && (
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#0f766e",
                  backgroundColor: "#ccfbf1",
                  borderRadius: "999px",
                  padding: "4px 8px",
                }}
              >
                Matched via {getCustomerMatchSourceLabel(item.customerMatch.matchedOn)}
              </span>
            )}
          </div>

          <div style={{ display: "grid", gap: "8px" }}>
            <h2 style={titleStyle}>{item.email.subject}</h2>
            <p style={subtitleStyle}>
              {item.email.senderName} ({item.email.senderEmail}) | Received{" "}
              {formatReceivedTime(item.email.receivedAt)}
            </p>
            {isOutlookEmailSource(item.email.source) && (
              <span style={sourceBadgeStyle}>Imported from Outlook</span>
            )}
          </div>
        </header>

        {presenceCopy && (
          <div
            style={{
              border: `1px solid ${
                presence?.presenceType === "working" ? "#f59e0b" : "#93c5fd"
              }`,
              backgroundColor:
                presence?.presenceType === "working" ? "#fff7ed" : "#eff6ff",
              borderRadius: "14px",
              padding: "12px 14px",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "14px",
                fontWeight: 700,
                color: presence?.presenceType === "working" ? "#92400e" : "#1d4ed8",
              }}
            >
              {presenceCopy}
            </p>
          </div>
        )}

        <DetailActionBar
          thread={thread}
          currentRep={currentRep}
          assignableReps={assignableReps}
          macros={macros}
          currentRepAvailable={Boolean(currentRep)}
          hasExactOutlookLink={hasExactOutlookLink}
          outlookStatusMessage={outlookStatusMessage}
          canTakeThread={canTakeThread}
          takeThreadReason={takeThreadReason}
          onTakeThreadReasonChange={setTakeThreadReason}
          onOpenInOutlook={() => {
            openCurrentItemInOutlook();
          }}
          onThreadStatusChange={(status) => onThreadStatusChange(thread.id, status)}
          onAssignThread={(repId) => onAssignThread(thread.id, repId)}
          onApplyMacro={(macroId) => onApplyMacro(thread.id, macroId)}
          onLogReply={() => onLogReply(thread.id)}
          onJumpToNotes={jumpToNotes}
          onSnooze={(mode, customValue) => onSnoozeThread(thread.id, mode, customValue)}
          onUnsnooze={() => onUnsnoozeThread(thread.id)}
          onTakeThread={(reason) => onTakeThread(thread.id, reason)}
        />

        <div
          style={{
            display: "grid",
            gap: "16px",
            gridTemplateColumns:
              showContextPanel && !isCompactWorkspace
                ? "minmax(0, 1fr) minmax(260px, 300px)"
                : "minmax(0, 1fr)",
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: "16px" }}>
            <ThreadConversationView
              item={item}
              thread={thread}
              pilotMode={pilotMode}
              orderDataMessage={orderDataMessage}
              hasReplyDraft={hasReplyDraft}
              copyFeedback={copyFeedback}
              caseCopyFeedback={caseCopyFeedback}
              rawCaseCopyFeedback={rawCaseCopyFeedback}
              regeneratingReply={regeneratingReply}
              replyActionError={replyActionError}
              notesOpen={notesOpen}
              replyHistoryOpen={replyHistoryOpen}
              olderMessagesOpen={olderMessagesOpen}
              notesComposerRef={notesComposerRef}
              notesSectionRef={notesSectionRef}
              replyHistorySectionRef={replyHistorySectionRef}
              olderMessagesSectionRef={olderMessagesSectionRef}
              onNotesOpenChange={setNotesOpen}
              onReplyHistoryOpenChange={setReplyHistoryOpen}
              onOlderMessagesOpenChange={setOlderMessagesOpen}
              onCopyReply={onCopyReply}
              onCopyReplyAndOpenOutlook={copyReplyAndOpenOutlook}
              onCopyCaseForReview={onCopyCaseForReview}
              onCopyRawCaseJson={onCopyRawCaseJson}
              canOpenOutlook={hasExactOutlookLink}
              showDebugActions={showDebugActions}
              onRegenerateReply={onRegenerateReply}
              onAddInternalNote={(body) => onAddInternalNote(thread.id, body)}
            />
          </div>

          {showContextPanel && (
            <ContextPanel
              item={item}
              thread={thread}
              reps={reps}
              currentRep={currentRep}
              pilotMode={pilotMode}
              pilotItemState={pilotItemState}
              orderDataMessage={orderDataMessage}
              canTakeThread={canTakeThread}
              takeThreadReason={takeThreadReason}
              onTakeThreadReasonChange={setTakeThreadReason}
              onTakeThread={(reason) => onTakeThread(thread.id, reason)}
              onRecomputePriority={onRecomputePriority}
              onMarkPilotItemActive={onMarkPilotItemActive}
              onMarkPilotItemDone={onMarkPilotItemDone}
              onMarkPilotItemNotRelevant={onMarkPilotItemNotRelevant}
              onMarkPilotItemWaitingOnCustomer={onMarkPilotItemWaitingOnCustomer}
              onSnoozePilotItemUntilTomorrow={onSnoozePilotItemUntilTomorrow}
              onSetPilotUsefulness={onSetPilotUsefulness}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid #d8e1ec",
  borderRadius: "18px",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
  minHeight: "100%",
  padding: "20px",
  boxSizing: "border-box",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "28px",
  fontWeight: 700,
  color: "#0f172a",
};

const subtitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "14px",
  color: "#475569",
  lineHeight: 1.6,
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const sourceBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  fontSize: "12px",
  fontWeight: 700,
  color: "#0f766e",
  backgroundColor: "#ccfbf1",
  borderRadius: "999px",
  padding: "4px 8px",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#0f172a",
  borderRadius: "10px",
  padding: "8px 12px",
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
};

const bodyBlockStyle: React.CSSProperties = {
  margin: 0,
  padding: "16px",
  borderRadius: "12px",
  border: "1px solid #dbe4ee",
  backgroundColor: "#f8fafc",
  whiteSpace: "pre-wrap",
  fontSize: "13px",
  lineHeight: 1.7,
  color: "#334155",
  fontFamily: "inherit",
};
