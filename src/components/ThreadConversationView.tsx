import type { RefObject } from "react";
import {
  deriveIssueType,
  getIssueTypeDraftExplanation,
  getIssueTypeLabel,
} from "../domain/issueType";
import { CollapsibleSection } from "./CollapsibleSection";
import { InternalNotesPanel } from "./InternalNotesPanel";
import { ReplyLogPanel } from "./ReplyLogPanel";
import { getIntentLabel, getRiskLabel } from "../services/analysisTaxonomy";
import { getWorkTypeLabel } from "../services/customerServiceMail";
import {
  getAnalysisSourceDisclosure,
  getDraftSourceDisclosure,
} from "../services/sourceDisclosure";
import type { ProcessedEmail, WorkflowThread } from "../types/actionDesk";

type ThreadConversationViewProps = {
  item: ProcessedEmail;
  thread: WorkflowThread;
  pilotMode: boolean;
  orderDataMessage?: string;
  hasReplyDraft: boolean;
  copyFeedback: "idle" | "success" | "error";
  caseCopyFeedback: "idle" | "success" | "error";
  rawCaseCopyFeedback: "idle" | "success" | "error";
  regeneratingReply: boolean;
  outlookDraftCreationStatus?: "idle" | "creating" | "success" | "error";
  canCreateOutlookDraft?: boolean;
  replyActionError: string | null;
  notesOpen: boolean;
  replyHistoryOpen: boolean;
  olderMessagesOpen: boolean;
  notesComposerRef: RefObject<HTMLTextAreaElement | null>;
  notesSectionRef: RefObject<HTMLDivElement | null>;
  replyHistorySectionRef: RefObject<HTMLDivElement | null>;
  olderMessagesSectionRef: RefObject<HTMLDivElement | null>;
  onNotesOpenChange: (nextOpen: boolean) => void;
  onReplyHistoryOpenChange: (nextOpen: boolean) => void;
  onOlderMessagesOpenChange: (nextOpen: boolean) => void;
  onCopyReply: () => void;
  onCreateOutlookDraft?: () => void;
  onCopyReplyAndOpenOutlook: () => void;
  onCopyCaseForReview: () => void;
  onCopyRawCaseJson: () => void;
  onRegenerateReply: () => void;
  onAddInternalNote: (body: string) => void;
  canOpenOutlook: boolean;
  showDebugActions?: boolean;
};

function getReplyNeededLabel(
  replyNeeded: NonNullable<ProcessedEmail["result"]>["analysis"]["replyNeeded"],
): string {
  switch (replyNeeded) {
    case "yes":
      return "Reply recommended";
    case "no":
      return "Reply not recommended";
    case "maybe":
    default:
      return "Reply optional";
  }
}

export function ThreadConversationView({
  item,
  thread,
  pilotMode,
  orderDataMessage,
  hasReplyDraft,
  copyFeedback,
  caseCopyFeedback,
  rawCaseCopyFeedback,
  regeneratingReply,
  outlookDraftCreationStatus = "idle",
  canCreateOutlookDraft = false,
  replyActionError,
  notesOpen,
  replyHistoryOpen,
  olderMessagesOpen,
  notesComposerRef,
  notesSectionRef,
  replyHistorySectionRef,
  olderMessagesSectionRef,
  onNotesOpenChange,
  onReplyHistoryOpenChange,
  onOlderMessagesOpenChange,
  onCopyReply,
  onCreateOutlookDraft,
  onCopyReplyAndOpenOutlook,
  onCopyCaseForReview,
  onCopyRawCaseJson,
  onRegenerateReply,
  onAddInternalNote,
  canOpenOutlook,
  showDebugActions = false,
}: ThreadConversationViewProps) {
  const result = item.result;

  if (!result) {
    return null;
  }

  const draftIssueType = deriveIssueType(result.analysis, result.orderContext);
  const analysisSourceDisclosure = getAnalysisSourceDisclosure(result.analysisSource);
  const draftSourceDisclosure = getDraftSourceDisclosure(result.analysisSource);
  const olderMessages = thread.items.filter((threadItem) => threadItem.email.id !== item.email.id);
  const replyDraftUnavailable =
    !hasReplyDraft &&
    (result.analysis.replyNeeded === "no" ||
      result.analysis.messageType === "internal_alert" ||
      result.analysis.messageType === "awareness_only" ||
      Boolean(
        result.analysis.workType &&
          result.analysis.workType !== "customer_support",
      ));

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      {result.warning &&
        !(pilotMode && result.analysis.orderNumber && !result.orderContext) && (
          <div
            style={{
              border: "1px solid #f59e0b",
              backgroundColor: "#fff7e6",
              borderRadius: "14px",
              padding: "14px 16px",
            }}
          >
            <p style={{ ...eyebrowStyle, color: "#92400e" }}>Workflow Alert</p>
            <p style={{ margin: "6px 0 0", fontSize: "14px", lineHeight: 1.6, color: "#78350f" }}>
              {result.warning}
            </p>
          </div>
        )}

      <CollapsibleSection
        title="Customer Conversation"
        subtitle="The main work area stays focused on what the customer said"
        defaultOpen={true}
      >
        <div style={{ display: "grid", gap: "14px" }}>
          <article style={customerMessageCardStyle}>
            <div style={messageMetaRowStyle}>
              <div>
                <p style={eyebrowStyle}>Customer Message</p>
                <p style={messageTitleStyle}>{item.email.subject}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={messageMetaTextStyle}>{item.email.senderName}</p>
                <p style={messageMetaTextStyle}>
                  {new Date(item.email.receivedAt).toLocaleString()}
                </p>
              </div>
            </div>
            <pre style={messageBodyStyle}>
              {item.email.body.trim() || "No email body available for this message."}
            </pre>
          </article>

          {olderMessages.length > 0 && (
            <div ref={olderMessagesSectionRef}>
              <CollapsibleSection
                title="Older Emails"
                subtitle="Grouped thread history for the same customer or sender"
                badge={`${olderMessages.length} ${olderMessages.length === 1 ? "message" : "messages"}`}
                isOpen={olderMessagesOpen}
                onToggle={onOlderMessagesOpenChange}
              >
                <div style={{ display: "grid", gap: "12px" }}>
                  {olderMessages.map((threadItem) => (
                    <article key={threadItem.email.id} style={olderMessageCardStyle}>
                      <div style={messageMetaRowStyle}>
                        <div>
                          <p style={eyebrowStyle}>Earlier Customer Message</p>
                          <p style={messageTitleStyle}>{threadItem.email.subject}</p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p style={messageMetaTextStyle}>{threadItem.email.senderName}</p>
                          <p style={messageMetaTextStyle}>
                            {new Date(threadItem.email.receivedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <pre style={messageBodyStyle}>
                        {threadItem.email.body.trim() || "No email body available for this message."}
                      </pre>
                    </article>
                  ))}
                </div>
              </CollapsibleSection>
            </div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Action Desk Read"
        subtitle="What Action Desk thinks is happening and what to do next"
        defaultOpen={true}
      >
        <div style={{ display: "grid", gap: "14px" }}>
          <div style={sourceDisclosureRowStyle}>
            <span title={analysisSourceDisclosure.detail} style={sourceDisclosureBadgeStyle}>
              Analysis: {analysisSourceDisclosure.label}
            </span>
          </div>

          <div style={analysisCardStyle}>
            <p style={eyebrowStyle}>Triage Summary</p>
            <p style={bodyTextStyle}>{result.analysis.summary || "No summary available."}</p>
          </div>

          <div style={recommendationCardStyle}>
            <div style={recommendationHeaderStyle}>
              <span style={recommendationPillStyle}>Do this next</span>
              <p style={{ ...eyebrowStyle, color: "#1e3a8a" }}>Recommended Next Action</p>
            </div>
            <p style={{ ...bodyTextStyle, color: "#0f172a", fontWeight: 600 }}>
              {result.analysis.nextAction ||
                "Review the message and determine the next support step."}
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <span style={analysisBadgeStyle}>{getIntentLabel(result.analysis.intent)}</span>
            <span style={analysisBadgeStyle}>{result.analysis.urgency} urgency</span>
            <span style={analysisBadgeStyle}>
              {getReplyNeededLabel(result.analysis.replyNeeded ?? "maybe")}
            </span>
            {result.analysis.workType && (
              <span style={analysisBadgeStyle}>{getWorkTypeLabel(result.analysis.workType)}</span>
            )}
          </div>

          {result.analysis.risks.length > 0 && (
            <div>
              <p style={eyebrowStyle}>Top Issues</p>
              <ul style={issuesListStyle}>
                {result.analysis.risks.map((risk) => (
                  <li key={risk}>{getRiskLabel(risk)}</li>
                ))}
              </ul>
            </div>
          )}

          {!result.orderContext && pilotMode && result.analysis.orderNumber && orderDataMessage && (
            <div style={systemEventCardStyle}>
              <p style={{ ...eyebrowStyle, color: "#475569" }}>System Note</p>
              <p style={bodyTextStyle}>{orderDataMessage}</p>
            </div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Reply Draft"
        subtitle="What we are going to say back"
        defaultOpen={true}
      >
        <div style={{ display: "grid", gap: "14px" }}>
          <div style={sourceDisclosureRowStyle}>
            <span title={draftSourceDisclosure.detail} style={sourceDisclosureBadgeStyle}>
              Draft: {draftSourceDisclosure.label}
            </span>
          </div>

          <div style={draftExplanationStyle}>
            <p style={eyebrowStyle}>Why this draft</p>
            <p style={bodyTextStyle}>
              <strong>{getIssueTypeLabel(draftIssueType)}:</strong>{" "}
              {getIssueTypeDraftExplanation(draftIssueType)}
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={onCopyReply}
              disabled={!hasReplyDraft}
              style={{
                ...secondaryButtonStyle,
                backgroundColor: !hasReplyDraft
                  ? "#e2e8f0"
                  : copyFeedback === "success"
                    ? "#dcfce7"
                    : copyFeedback === "error"
                      ? "#fee2e2"
                      : "#ffffff",
                color: !hasReplyDraft
                  ? "#64748b"
                  : copyFeedback === "success"
                    ? "#166534"
                    : copyFeedback === "error"
                      ? "#991b1b"
                      : "#0f172a",
                cursor: !hasReplyDraft ? "not-allowed" : "pointer",
              }}
            >
              {!hasReplyDraft
                ? replyDraftUnavailable
                  ? "No Reply Draft"
                  : "Copy Reply"
                : copyFeedback === "success"
                  ? "Copied!"
                  : copyFeedback === "error"
                    ? "Clipboard Unavailable"
                    : "Copy Reply"}
            </button>
            {canCreateOutlookDraft && (
              <button
                type="button"
                onClick={onCreateOutlookDraft}
                disabled={
                  !hasReplyDraft ||
                  outlookDraftCreationStatus === "creating" ||
                  outlookDraftCreationStatus === "success"
                }
                title="Create a saved Outlook reply draft. Action Desk will not send it."
                style={{
                  ...secondaryButtonStyle,
                  backgroundColor:
                    outlookDraftCreationStatus === "success"
                      ? "#dcfce7"
                      : outlookDraftCreationStatus === "error"
                        ? "#fee2e2"
                        : "#eff6ff",
                  color:
                    outlookDraftCreationStatus === "success"
                      ? "#166534"
                      : outlookDraftCreationStatus === "error"
                        ? "#991b1b"
                        : "#1d4ed8",
                  borderColor:
                    outlookDraftCreationStatus === "success"
                      ? "#86efac"
                      : outlookDraftCreationStatus === "error"
                        ? "#fecaca"
                        : "#93c5fd",
                  cursor:
                    !hasReplyDraft ||
                    outlookDraftCreationStatus === "creating" ||
                    outlookDraftCreationStatus === "success"
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {outlookDraftCreationStatus === "creating"
                  ? "Creating Draft..."
                  : outlookDraftCreationStatus === "success"
                    ? "Draft Created"
                    : "Create Outlook Draft"}
              </button>
            )}
            <button
              type="button"
              onClick={onRegenerateReply}
              disabled={regeneratingReply}
              style={{
                ...secondaryButtonStyle,
                backgroundColor: regeneratingReply ? "#e2e8f0" : "#ffffff",
                color: regeneratingReply ? "#64748b" : "#0f172a",
                cursor: regeneratingReply ? "not-allowed" : "pointer",
              }}
            >
              {regeneratingReply ? "Regenerating..." : "Regenerate Reply"}
            </button>
            <button
              type="button"
              onClick={onCopyReplyAndOpenOutlook}
              disabled={!hasReplyDraft || !canOpenOutlook}
              title={
                canOpenOutlook
                  ? "Copy the reply draft, then open the exact Outlook message."
                  : "Exact Outlook message link is unavailable for this email."
              }
              style={{
                ...secondaryButtonStyle,
                backgroundColor:
                  !hasReplyDraft || !canOpenOutlook ? "#e2e8f0" : "#eff6ff",
                color:
                  !hasReplyDraft || !canOpenOutlook ? "#64748b" : "#1d4ed8",
                borderColor:
                  !hasReplyDraft || !canOpenOutlook ? "#cbd5e1" : "#93c5fd",
                cursor:
                  !hasReplyDraft || !canOpenOutlook ? "not-allowed" : "pointer",
              }}
            >
              {canOpenOutlook ? "Copy & Open Outlook" : "Outlook Link Missing"}
            </button>
            <button
              type="button"
              onClick={onCopyCaseForReview}
              style={{
                ...secondaryButtonStyle,
                backgroundColor:
                  caseCopyFeedback === "success"
                    ? "#dcfce7"
                    : caseCopyFeedback === "error"
                      ? "#fee2e2"
                      : "#ffffff",
                color:
                  caseCopyFeedback === "success"
                    ? "#166534"
                    : caseCopyFeedback === "error"
                      ? "#991b1b"
                      : "#0f172a",
              }}
            >
              {caseCopyFeedback === "success"
                ? "Case Copied!"
                : caseCopyFeedback === "error"
                  ? "Copy Failed"
                  : "Copy Case for Review"}
            </button>
            {showDebugActions && (
              <button
                type="button"
                onClick={onCopyRawCaseJson}
                style={{
                  ...secondaryButtonStyle,
                  backgroundColor:
                    rawCaseCopyFeedback === "success"
                      ? "#dcfce7"
                      : rawCaseCopyFeedback === "error"
                        ? "#fee2e2"
                        : "#ffffff",
                  color:
                    rawCaseCopyFeedback === "success"
                      ? "#166534"
                      : rawCaseCopyFeedback === "error"
                        ? "#991b1b"
                        : "#0f172a",
                }}
              >
                {rawCaseCopyFeedback === "success"
                  ? "JSON Copied!"
                  : rawCaseCopyFeedback === "error"
                    ? "Copy Failed"
                    : "Copy Raw Case JSON"}
              </button>
            )}
          </div>

          {result.replyDraft ? (
            <pre style={replyDraftStyle}>{result.replyDraft}</pre>
          ) : (
            <div style={{ ...replyDraftStyle, fontStyle: "italic", color: "#475569" }}>
              {replyActionError
                ? "Reply draft unavailable."
                : result.analysis.replyNeeded === "no"
                ? "Reply not recommended for this message."
                : replyDraftUnavailable
                  ? "No reply draft available for this message."
                  : "Reply draft pending."}
            </div>
          )}

          {copyFeedback === "error" && (
            <p style={bodyTextStyle}>
              Clipboard access is not available in this browser context. Copy the draft manually.
            </p>
          )}
          {replyActionError && (
            <p style={{ ...bodyTextStyle, color: "#991b1b" }}>{replyActionError}</p>
          )}
        </div>
      </CollapsibleSection>

      <div ref={replyHistorySectionRef}>
        <CollapsibleSection
          title="Reply History"
          subtitle="What the team has already sent or logged"
          badge={`${thread.replyLog.length}`}
          isOpen={replyHistoryOpen}
          onToggle={onReplyHistoryOpenChange}
        >
          <ReplyLogPanel replyLog={thread.replyLog} />
        </CollapsibleSection>
      </div>

      <div ref={notesSectionRef}>
        <CollapsibleSection
          title="Internal Notes"
          subtitle="Team context that should stay internal"
          badge={`${thread.notes.length}`}
          isOpen={notesOpen}
          onToggle={onNotesOpenChange}
        >
          <InternalNotesPanel
            notes={thread.notes}
            composerRef={notesComposerRef}
            onAddNote={onAddInternalNote}
          />
        </CollapsibleSection>
      </div>
    </div>
  );
}

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "11px",
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const bodyTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "14px",
  lineHeight: 1.7,
  color: "#334155",
};

const messageMetaRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "start",
  flexWrap: "wrap",
  marginBottom: "12px",
};

const messageTitleStyle: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: "16px",
  fontWeight: 700,
  color: "#0f172a",
};

const messageMetaTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "12px",
  color: "#64748b",
};

const messageBodyStyle: React.CSSProperties = {
  margin: 0,
  whiteSpace: "pre-wrap",
  fontSize: "13px",
  lineHeight: 1.7,
  color: "#334155",
  fontFamily: "inherit",
};

const customerMessageCardStyle: React.CSSProperties = {
  border: "1px solid #bfdbfe",
  borderRadius: "14px",
  backgroundColor: "#eff6ff",
  padding: "16px",
};

const olderMessageCardStyle: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: "14px",
  backgroundColor: "#ffffff",
  padding: "16px",
};

const analysisCardStyle: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: "14px",
  backgroundColor: "#f8fafc",
  padding: "16px",
};

const recommendationCardStyle: React.CSSProperties = {
  border: "1px solid #93c5fd",
  borderLeft: "4px solid #2563eb",
  borderRadius: "14px",
  backgroundColor: "#eff6ff",
  padding: "16px",
  boxShadow: "0 10px 24px rgba(37, 99, 235, 0.08)",
};

const recommendationHeaderStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: "8px",
};

const recommendationPillStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  color: "#ffffff",
  backgroundColor: "#2563eb",
  borderRadius: "999px",
  padding: "4px 8px",
};

const systemEventCardStyle: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: "14px",
  backgroundColor: "#f8fafc",
  padding: "14px 16px",
};

const analysisBadgeStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  color: "#334155",
  backgroundColor: "#e2e8f0",
  borderRadius: "999px",
  padding: "5px 9px",
};

const sourceDisclosureRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
};

const sourceDisclosureBadgeStyle: React.CSSProperties = {
  ...analysisBadgeStyle,
  backgroundColor: "#f1f5f9",
  color: "#475569",
};

const issuesListStyle: React.CSSProperties = {
  margin: "8px 0 0",
  paddingLeft: "18px",
  fontSize: "14px",
  lineHeight: 1.7,
  color: "#334155",
};

const draftExplanationStyle: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: "14px",
  backgroundColor: "#f8fafc",
  padding: "14px 16px",
};

const replyDraftStyle: React.CSSProperties = {
  margin: 0,
  padding: "16px",
  border: "1px solid #dbe4ee",
  borderRadius: "14px",
  backgroundColor: "#f8fafc",
  whiteSpace: "pre-wrap",
  fontSize: "13px",
  lineHeight: 1.7,
  color: "#334155",
  fontFamily: "inherit",
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
