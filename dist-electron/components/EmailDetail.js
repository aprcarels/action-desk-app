"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailDetail = EmailDetail;
const issueType_1 = require("../domain/issueType");
const analysisTaxonomy_1 = require("../services/analysisTaxonomy");
const customerServiceMail_1 = require("../services/customerServiceMail");
const openInOutlook_1 = require("../services/openInOutlook");
const pilotQueueState_1 = require("../services/pilotQueueState");
const queueAging_1 = require("../services/queueAging");
function formatReceivedTime(receivedAt) {
    return new Date(receivedAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}
function getPriorityLabel(priorityScore) {
    if (priorityScore >= 70) {
        return "High";
    }
    if (priorityScore >= 40) {
        return "Medium";
    }
    return "Low";
}
function formatPriorityBreakdownLabel(label) {
    if (!label.startsWith("Risk: ")) {
        return label;
    }
    const riskCode = label.slice("Risk: ".length);
    return `Risk: ${(0, analysisTaxonomy_1.getRiskLabel)(riskCode)}`;
}
function getActionabilityLabel(actionability) {
    switch (actionability) {
        case "action_required":
            return "Action required";
        case "awareness_only":
            return "Awareness only";
        case "no_action_needed":
            return "No action needed";
        case "review_needed":
            return "Review needed";
        default:
            return "Review needed";
    }
}
function getReplyNeededLabel(replyNeeded) {
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
function EmailDetail({ item, pilotMode, pilotItemState, orderDataMessage, hasReplyDraft, copyFeedback, caseCopyFeedback, rawCaseCopyFeedback, regeneratingReply, replyActionError, onCopyReply, onCopyCaseForReview, onCopyRawCaseJson, onRegenerateReply, onRecomputePriority, onMarkPilotItemActive, onMarkPilotItemDone, onMarkPilotItemNotRelevant, onMarkPilotItemWaitingOnCustomer, onSnoozePilotItemUntilTomorrow, onSetPilotUsefulness, }) {
    function isOutlookEmailSource(source) {
        return source === "outlook_import" || source === "outlook_graph";
    }
    const panelStyle = {
        backgroundColor: "#ffffff",
        border: "1px solid #d8e1ec",
        borderRadius: "16px",
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
        minHeight: "100%",
        padding: "24px",
        boxSizing: "border-box",
    };
    const sectionStyle = {
        marginBottom: "20px",
    };
    const sectionCardStyle = {
        border: "1px solid #e2e8f0",
        borderRadius: "14px",
        backgroundColor: "#fcfdff",
        padding: "16px",
        marginBottom: "16px",
    };
    const titleStyle = {
        margin: 0,
        fontSize: "24px",
        fontWeight: 700,
        color: "#0f172a",
    };
    const sectionTitleStyle = {
        margin: "0 0 8px",
        fontSize: "15px",
        fontWeight: 700,
        color: "#0f172a",
    };
    const textStyle = {
        margin: 0,
        fontSize: "14px",
        lineHeight: 1.7,
        color: "#334155",
    };
    const bodyBlockStyle = {
        margin: 0,
        padding: "16px",
        borderRadius: "12px",
        border: "1px solid #dbe4ee",
        backgroundColor: "#f8fafc",
        whiteSpace: "pre-wrap",
        fontSize: "13px",
        lineHeight: 1.7,
        color: "#334155",
    };
    const actionCalloutStyle = {
        border: "1px solid #bfdbfe",
        backgroundColor: "#eff6ff",
        borderRadius: "12px",
        padding: "16px",
    };
    const replyActionsStyle = {
        display: "flex",
        gap: "10px",
        flexWrap: "wrap",
        alignItems: "center",
    };
    const secondaryButtonStyle = {
        border: "1px solid #cbd5e1",
        backgroundColor: "#ffffff",
        color: "#0f172a",
        borderRadius: "10px",
        padding: "8px 12px",
        fontSize: "13px",
        fontWeight: 700,
        cursor: "pointer",
    };
    const sourceBadgeStyle = {
        display: "inline-flex",
        alignItems: "center",
        fontSize: "12px",
        fontWeight: 700,
        color: "#0f766e",
        backgroundColor: "#ccfbf1",
        borderRadius: "999px",
        padding: "4px 8px",
        marginTop: "8px",
    };
    const pilotItemView = pilotItemState ? (0, pilotQueueState_1.getPilotQueueViewForItem)(pilotItemState) : "active";
    if (!item) {
        return (<div style={panelStyle}>
        <h2 style={titleStyle}>Email Detail</h2>
        <p style={{ ...textStyle, marginTop: "10px" }}>
          Select an email from the queue to view the analysis and reply draft.
        </p>
      </div>);
    }
    if (item.status === "failed") {
        return (<div style={panelStyle}>
        <div style={sectionStyle}>
          <h2 style={titleStyle}>{item.email.subject}</h2>
          {isOutlookEmailSource(item.email.source) && (<div style={sourceBadgeStyle}>Imported from Outlook</div>)}
          <p style={{ ...textStyle, marginTop: "8px" }}>
            <strong>Sender:</strong> {item.email.senderName} ({item.email.senderEmail})
          </p>
          <p style={textStyle}>
            <strong>Received:</strong> {formatReceivedTime(item.email.receivedAt)}
          </p>
        </div>

        <div style={sectionCardStyle}>
          <h3 style={sectionTitleStyle}>Processing Status</h3>
          <p style={{ ...textStyle, color: "#991b1b" }}>
            {item.processingError ?? "This email could not be processed."}
          </p>
        </div>

        <div style={sectionCardStyle}>
          <h3 style={sectionTitleStyle}>Customer Email</h3>
          <pre style={bodyBlockStyle}>
            {item.email.body.trim() || "No email body available for this message."}
          </pre>
        </div>
      </div>);
    }
    if (item.status === "pending" || !item.result) {
        return (<div style={panelStyle}>
        <div style={sectionStyle}>
          <h2 style={titleStyle}>{item.email.subject}</h2>
          {isOutlookEmailSource(item.email.source) && (<div style={sourceBadgeStyle}>Imported from Outlook</div>)}
          <p style={{ ...textStyle, marginTop: "8px" }}>
            <strong>Sender:</strong> {item.email.senderName} ({item.email.senderEmail})
          </p>
          <p style={textStyle}>
            <strong>Received:</strong> {formatReceivedTime(item.email.receivedAt)}
          </p>
        </div>

        <div style={sectionCardStyle}>
          <h3 style={sectionTitleStyle}>Processing Status</h3>
          <p style={textStyle}>This email is currently being processed.</p>
        </div>

        <div style={sectionCardStyle}>
          <h3 style={sectionTitleStyle}>Customer Email</h3>
          <pre style={bodyBlockStyle}>
            {item.email.body.trim() || "No email body available for this message."}
          </pre>
        </div>
      </div>);
    }
    const draftIssueType = (0, issueType_1.deriveIssueType)(item.result.analysis, item.result.orderContext);
    const canOpenOutlook = (0, openInOutlook_1.canOpenInOutlook)(item);
    const queueAge = (0, queueAging_1.getQueueAgeInfo)({
        receivedAt: item.email.receivedAt,
        pilotItemState: pilotMode ? pilotItemState : undefined,
    });
    return (<div style={panelStyle}>
      <div style={sectionStyle}>
        <h2 style={titleStyle}>{item.email.subject}</h2>
        {isOutlookEmailSource(item.email.source) && (<div style={sourceBadgeStyle}>Imported from Outlook</div>)}
        <p style={{ ...textStyle, marginTop: "8px" }}>
          <strong>Sender:</strong> {item.email.senderName} ({item.email.senderEmail})
        </p>
        <p style={textStyle}>
          <strong>Received:</strong> {formatReceivedTime(item.email.receivedAt)}
        </p>
        <p style={textStyle}>
          <strong>Queue Age:</strong> {queueAge.label}
        </p>
      </div>

      <div style={sectionCardStyle}>
        <h3 style={sectionTitleStyle}>Customer Email</h3>
        <pre style={bodyBlockStyle}>
          {item.email.body.trim() || "No email body available for this message."}
        </pre>
      </div>

      <div style={sectionCardStyle}>
        <h3 style={sectionTitleStyle}>AI Summary</h3>
        <p style={textStyle}>{item.result.analysis.summary || "No summary available."}</p>
      </div>

      <div style={sectionCardStyle}>
        <h3 style={sectionTitleStyle}>AI Analysis</h3>
        <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "12px",
            marginBottom: "14px",
        }}>
          <div>
            <p style={{ ...textStyle, fontWeight: 700 }}>Intent</p>
            <p style={textStyle}>{(0, analysisTaxonomy_1.getIntentLabel)(item.result.analysis.intent)}</p>
          </div>
          <div>
            <p style={{ ...textStyle, fontWeight: 700 }}>Urgency</p>
            <p style={textStyle}>{item.result.analysis.urgency}</p>
          </div>
          <div>
            <p style={{ ...textStyle, fontWeight: 700 }}>Order Number</p>
            <p style={textStyle}>{item.result.analysis.orderNumber ?? "Not provided"}</p>
          </div>
          <div>
            <p style={{ ...textStyle, fontWeight: 700 }}>Actionability</p>
            <p style={textStyle}>
              {getActionabilityLabel(item.result.analysis.actionability)}
            </p>
          </div>
          <div>
            <p style={{ ...textStyle, fontWeight: 700 }}>Reply</p>
            <p style={textStyle}>{getReplyNeededLabel(item.result.analysis.replyNeeded)}</p>
          </div>
          {item.result.analysis.workType && (<div>
              <p style={{ ...textStyle, fontWeight: 700 }}>Work Type</p>
              <p style={textStyle}>{(0, customerServiceMail_1.getWorkTypeLabel)(item.result.analysis.workType)}</p>
            </div>)}
        </div>

        <h4 style={{ ...sectionTitleStyle, fontSize: "14px" }}>Issues</h4>
        {item.result.analysis.risks.length > 0 ? (<ul style={{ margin: 0, paddingLeft: "20px", color: "#334155" }}>
            {item.result.analysis.risks.map((risk) => (<li key={risk} style={{ marginBottom: "8px", lineHeight: 1.6 }}>
                {(0, analysisTaxonomy_1.getRiskLabel)(risk)}
              </li>))}
          </ul>) : (<p style={textStyle}>No significant issues identified.</p>)}
      </div>

      <div style={sectionCardStyle}>
        <h3 style={sectionTitleStyle}>Recommended Action</h3>
        <div style={actionCalloutStyle}>
          <p style={{ ...textStyle, color: "#0f172a", fontWeight: 600 }}>
            {item.result.analysis.nextAction || "Review the message and determine the next support step."}
          </p>
        </div>
      </div>

      <div style={sectionCardStyle}>
        <h3 style={sectionTitleStyle}>Priority Debug</h3>
        <p style={{ ...textStyle, marginBottom: "10px", color: "#64748b", fontSize: "12px" }}>
          Internal scoring info for triage tuning.
        </p>
        <p style={textStyle}>
          <strong>Priority:</strong> {getPriorityLabel(item.result.priorityScore)}
        </p>
        <p style={{ ...textStyle, marginBottom: "10px" }}>
          <strong>Score:</strong> {item.result.priorityScore}
        </p>
        {item.result.priorityBreakdown && item.result.priorityBreakdown.length > 0 ? (<ul style={{ margin: 0, paddingLeft: "20px", color: "#334155" }}>
            {item.result.priorityBreakdown.map((entry, index) => (<li key={`${entry.label}-${index}`} style={{ marginBottom: "8px", lineHeight: 1.6 }}>
                {formatPriorityBreakdownLabel(entry.label)} (+{entry.points})
              </li>))}
          </ul>) : (<p style={textStyle}>No priority breakdown available.</p>)}
      </div>

      {item.result.orderContext && (<div style={sectionCardStyle}>
          <h3 style={sectionTitleStyle}>Order Context</h3>
          <p style={textStyle}>
            <strong>Order Number:</strong> {item.result.orderContext.orderNumber}
          </p>
          <p style={textStyle}>
            <strong>Status:</strong> {item.result.orderContext.status}
          </p>
          <p style={textStyle}>
            <strong>Shipment Status:</strong> {item.result.orderContext.shipmentStatus}
          </p>
          <p style={textStyle}>
            <strong>Last Updated:</strong> {item.result.orderContext.lastUpdated}
          </p>
        </div>)}

      {!item.result.orderContext && pilotMode && item.result.analysis.orderNumber && (<div style={sectionCardStyle}>
          <h3 style={sectionTitleStyle}>Order Context</h3>
          <p style={textStyle}>
            {orderDataMessage ?? "Order data not connected yet. Verify in WMS."}
          </p>
        </div>)}

      {pilotMode && (<div style={sectionCardStyle}>
          <h3 style={sectionTitleStyle}>Queue Actions</h3>
          <div style={{ ...replyActionsStyle, marginBottom: "12px" }}>
            {pilotItemView !== "active" && (<button type="button" onClick={onMarkPilotItemActive} style={secondaryButtonStyle}>
                Back to Active
              </button>)}
            <button type="button" onClick={onRecomputePriority} style={secondaryButtonStyle}>
              Recompute Priority
            </button>
            <button type="button" onClick={onMarkPilotItemDone} style={{
                ...secondaryButtonStyle,
                backgroundColor: pilotItemView === "done" ? "#dcfce7" : "#ffffff",
                color: pilotItemView === "done" ? "#166534" : "#0f172a",
            }}>
              Done
            </button>
            <button type="button" onClick={onMarkPilotItemNotRelevant} style={{
                ...secondaryButtonStyle,
                backgroundColor: pilotItemView === "not_relevant" ? "#e2e8f0" : "#ffffff",
                color: pilotItemView === "not_relevant" ? "#475569" : "#0f172a",
            }}>
              Not Relevant
            </button>
            <button type="button" onClick={onSnoozePilotItemUntilTomorrow} style={{
                ...secondaryButtonStyle,
                backgroundColor: pilotItemView === "snoozed" ? "#dbeafe" : "#ffffff",
                color: pilotItemView === "snoozed" ? "#1d4ed8" : "#0f172a",
            }}>
              Snooze to Tomorrow
            </button>
            <button type="button" onClick={onMarkPilotItemWaitingOnCustomer} style={{
                ...secondaryButtonStyle,
                backgroundColor: pilotItemView === "waiting_on_customer" ? "#fef3c7" : "#ffffff",
                color: pilotItemView === "waiting_on_customer" ? "#92400e" : "#0f172a",
            }}>
              Waiting on Customer
            </button>
          </div>
          <p style={{ ...textStyle, fontSize: "12px", color: "#64748b" }}>
            Current state:{" "}
            {pilotItemView === "waiting_on_customer"
                ? "Waiting on Customer"
                : pilotItemView === "not_relevant"
                    ? "Not Relevant"
                    : pilotItemView === "snoozed"
                        ? "Snoozed"
                        : pilotItemView === "done"
                            ? "Done"
                            : "Active"}
          </p>
        </div>)}

      <div style={sectionCardStyle}>
        <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            marginBottom: "8px",
            flexWrap: "wrap",
        }}>
          <h3 style={{ ...sectionTitleStyle, margin: 0 }}>Reply Draft</h3>
          <div style={replyActionsStyle}>
            <button type="button" onClick={() => {
            if (!canOpenOutlook) {
                return;
            }
            window.open((0, openInOutlook_1.buildOutlookSearchUrl)(item), "_blank");
        }} disabled={!canOpenOutlook} style={{
            ...secondaryButtonStyle,
            backgroundColor: canOpenOutlook ? "#ffffff" : "#e2e8f0",
            color: canOpenOutlook ? "#0f172a" : "#64748b",
            cursor: canOpenOutlook ? "pointer" : "not-allowed",
        }}>
              Open in Outlook
            </button>
            <button type="button" onClick={onCopyCaseForReview} style={{
            ...secondaryButtonStyle,
            backgroundColor: caseCopyFeedback === "success"
                ? "#dcfce7"
                : caseCopyFeedback === "error"
                    ? "#fee2e2"
                    : "#ffffff",
            color: caseCopyFeedback === "success"
                ? "#166534"
                : caseCopyFeedback === "error"
                    ? "#991b1b"
                    : "#0f172a",
        }}>
              {caseCopyFeedback === "success"
            ? "Case Copied!"
            : caseCopyFeedback === "error"
                ? "Copy Failed"
                : "Copy Case for Review"}
            </button>
            <button type="button" onClick={onCopyRawCaseJson} style={{
            ...secondaryButtonStyle,
            backgroundColor: rawCaseCopyFeedback === "success"
                ? "#dcfce7"
                : rawCaseCopyFeedback === "error"
                    ? "#fee2e2"
                    : "#ffffff",
            color: rawCaseCopyFeedback === "success"
                ? "#166534"
                : rawCaseCopyFeedback === "error"
                    ? "#991b1b"
                    : "#0f172a",
        }}>
              {rawCaseCopyFeedback === "success"
            ? "JSON Copied!"
            : rawCaseCopyFeedback === "error"
                ? "Copy Failed"
                : "Copy Raw Case JSON"}
            </button>
            <button type="button" onClick={onRegenerateReply} disabled={regeneratingReply} style={{
            ...secondaryButtonStyle,
            backgroundColor: regeneratingReply ? "#e2e8f0" : "#ffffff",
            color: regeneratingReply ? "#64748b" : "#0f172a",
            cursor: regeneratingReply ? "not-allowed" : "pointer",
        }}>
              {regeneratingReply ? "Regenerating..." : "Regenerate Reply"}
            </button>
            <button type="button" onClick={onCopyReply} disabled={!hasReplyDraft} style={{
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
        }}>
              {!hasReplyDraft
            ? "No Reply Draft"
            : copyFeedback === "success"
                ? "Copied!"
                : copyFeedback === "error"
                    ? "Clipboard Unavailable"
                    : "Copy Reply"}
            </button>
          </div>
        </div>
        {item.result.replyDraft && (<div style={{
                marginBottom: "12px",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                backgroundColor: "#f8fafc",
                padding: "12px 14px",
            }}>
            <p style={{ ...textStyle, fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
              Why this draft?
            </p>
            <p style={{ ...textStyle, marginTop: "4px" }}>
              <strong>{(0, issueType_1.getIssueTypeLabel)(draftIssueType)}:</strong>{" "}
              {(0, issueType_1.getIssueTypeDraftExplanation)(draftIssueType)}
            </p>
          </div>)}
        {item.result.replyDraft ? (<pre style={bodyBlockStyle}>{item.result.replyDraft}</pre>) : (<div style={{
                ...bodyBlockStyle,
                fontStyle: "italic",
                color: "#475569",
            }}>
            {item.result.analysis.replyNeeded === "no"
                ? "Reply not recommended for this message."
                : "No draft reply available."}
          </div>)}
        {copyFeedback === "error" && (<p style={{ ...textStyle, marginTop: "10px" }}>
            Clipboard access is not available in this browser context. Copy the draft manually.
          </p>)}
        {replyActionError && (<p style={{ ...textStyle, marginTop: "10px", color: "#991b1b" }}>
            {replyActionError}
          </p>)}
      </div>

      {pilotMode && (<div style={sectionCardStyle}>
          <h3 style={sectionTitleStyle}>Was this helpful?</h3>
          <div style={replyActionsStyle}>
            <button type="button" onClick={() => onSetPilotUsefulness("helpful")} style={{
                ...secondaryButtonStyle,
                backgroundColor: pilotItemState?.usefulness === "helpful" ? "#dcfce7" : "#ffffff",
                color: pilotItemState?.usefulness === "helpful" ? "#166534" : "#0f172a",
            }}>
              Helpful
            </button>
            <button type="button" onClick={() => onSetPilotUsefulness("not_helpful")} style={{
                ...secondaryButtonStyle,
                backgroundColor: pilotItemState?.usefulness === "not_helpful" ? "#fee2e2" : "#ffffff",
                color: pilotItemState?.usefulness === "not_helpful" ? "#991b1b" : "#0f172a",
            }}>
              Not Helpful
            </button>
          </div>
        </div>)}

      {item.result.warning && !(pilotMode && item.result.analysis.orderNumber && !item.result.orderContext) && (<div style={{
                border: "1px solid #f59e0b",
                backgroundColor: "#fff7e6",
                borderRadius: "12px",
                padding: "14px 16px",
                marginBottom: "20px",
            }}>
          <h3 style={sectionTitleStyle}>Warning</h3>
          <p style={textStyle}>{item.result.warning}</p>
        </div>)}
    </div>);
}
