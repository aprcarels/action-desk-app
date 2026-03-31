import { getIntentLabel, getRiskLabel } from "../services/analysisTaxonomy";
import type { ProcessedEmail } from "../types/actionDesk";

type EmailDetailProps = {
  item?: ProcessedEmail;
  hasReplyDraft: boolean;
  copyFeedback: "idle" | "success" | "error";
  regeneratingReply: boolean;
  replyActionError: string | null;
  onCopyReply: () => void;
  onRegenerateReply: () => void;
};

function formatReceivedTime(receivedAt: string) {
  return new Date(receivedAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getPriorityLabel(priorityScore: number): "High" | "Medium" | "Low" {
  if (priorityScore >= 70) {
    return "High";
  }

  if (priorityScore >= 40) {
    return "Medium";
  }

  return "Low";
}

function formatPriorityBreakdownLabel(label: string) {
  if (!label.startsWith("Risk: ")) {
    return label;
  }

  const riskCode = label.slice("Risk: ".length) as NonNullable<
    ProcessedEmail["result"]
  >["analysis"]["risks"][number];
  return `Risk: ${getRiskLabel(riskCode)}`;
}

export function EmailDetail({
  item,
  hasReplyDraft,
  copyFeedback,
  regeneratingReply,
  replyActionError,
  onCopyReply,
  onRegenerateReply,
}: EmailDetailProps) {
  const panelStyle: React.CSSProperties = {
    backgroundColor: "#ffffff",
    border: "1px solid #d8e1ec",
    borderRadius: "16px",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
    minHeight: "100%",
    padding: "24px",
    boxSizing: "border-box",
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: "20px",
  };

  const sectionCardStyle: React.CSSProperties = {
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    backgroundColor: "#fcfdff",
    padding: "16px",
    marginBottom: "16px",
  };

  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: "24px",
    fontWeight: 700,
    color: "#0f172a",
  };

  const sectionTitleStyle: React.CSSProperties = {
    margin: "0 0 8px",
    fontSize: "15px",
    fontWeight: 700,
    color: "#0f172a",
  };

  const textStyle: React.CSSProperties = {
    margin: 0,
    fontSize: "14px",
    lineHeight: 1.7,
    color: "#334155",
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
  };

  const actionCalloutStyle: React.CSSProperties = {
    border: "1px solid #bfdbfe",
    backgroundColor: "#eff6ff",
    borderRadius: "12px",
    padding: "16px",
  };

  const replyActionsStyle: React.CSSProperties = {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    alignItems: "center",
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

  if (!item) {
    return (
      <div style={panelStyle}>
        <h2 style={titleStyle}>Email Detail</h2>
        <p style={{ ...textStyle, marginTop: "10px" }}>
          Select an email from the queue to view the analysis and reply draft.
        </p>
      </div>
    );
  }

  if (item.status === "failed") {
    return (
      <div style={panelStyle}>
        <div style={sectionStyle}>
          <h2 style={titleStyle}>{item.email.subject}</h2>
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
      </div>
    );
  }

  if (item.status === "pending" || !item.result) {
    return (
      <div style={panelStyle}>
        <div style={sectionStyle}>
          <h2 style={titleStyle}>{item.email.subject}</h2>
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
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <div style={sectionStyle}>
        <h2 style={titleStyle}>{item.email.subject}</h2>
        <p style={{ ...textStyle, marginTop: "8px" }}>
          <strong>Sender:</strong> {item.email.senderName} ({item.email.senderEmail})
        </p>
        <p style={textStyle}>
          <strong>Received:</strong> {formatReceivedTime(item.email.receivedAt)}
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "12px",
            marginBottom: "14px",
          }}
        >
          <div>
            <p style={{ ...textStyle, fontWeight: 700 }}>Intent</p>
            <p style={textStyle}>{getIntentLabel(item.result.analysis.intent)}</p>
          </div>
          <div>
            <p style={{ ...textStyle, fontWeight: 700 }}>Urgency</p>
            <p style={textStyle}>{item.result.analysis.urgency}</p>
          </div>
          <div>
            <p style={{ ...textStyle, fontWeight: 700 }}>Order Number</p>
            <p style={textStyle}>{item.result.analysis.orderNumber ?? "Not provided"}</p>
          </div>
        </div>

        <h4 style={{ ...sectionTitleStyle, fontSize: "14px" }}>Issues</h4>
        {item.result.analysis.risks.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: "20px", color: "#334155" }}>
            {item.result.analysis.risks.map((risk) => (
              <li key={risk} style={{ marginBottom: "8px", lineHeight: 1.6 }}>
                {getRiskLabel(risk)}
              </li>
            ))}
          </ul>
        ) : (
          <p style={textStyle}>No significant issues identified.</p>
        )}
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
        {item.result.priorityBreakdown && item.result.priorityBreakdown.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: "20px", color: "#334155" }}>
            {item.result.priorityBreakdown.map((entry, index) => (
              <li key={`${entry.label}-${index}`} style={{ marginBottom: "8px", lineHeight: 1.6 }}>
                {formatPriorityBreakdownLabel(entry.label)} (+{entry.points})
              </li>
            ))}
          </ul>
        ) : (
          <p style={textStyle}>No priority breakdown available.</p>
        )}
      </div>

      {item.result.orderContext && (
        <div style={sectionCardStyle}>
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
        </div>
      )}

      <div style={sectionCardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            marginBottom: "8px",
            flexWrap: "wrap",
          }}
        >
          <h3 style={{ ...sectionTitleStyle, margin: 0 }}>Reply Draft</h3>
          <div style={replyActionsStyle}>
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
                ? "No Reply Draft"
                : copyFeedback === "success"
                ? "Copied!"
                : copyFeedback === "error"
                  ? "Clipboard Unavailable"
                  : "Copy Reply"}
            </button>
          </div>
        </div>
        <pre style={bodyBlockStyle}>{item.result.replyDraft || "No draft reply available."}</pre>
        {copyFeedback === "error" && (
          <p style={{ ...textStyle, marginTop: "10px" }}>
            Clipboard access is not available in this browser context. Copy the draft manually.
          </p>
        )}
        {replyActionError && (
          <p style={{ ...textStyle, marginTop: "10px", color: "#991b1b" }}>
            {replyActionError}
          </p>
        )}
      </div>

      {item.result.warning && (
        <div
          style={{
            border: "1px solid #f59e0b",
            backgroundColor: "#fff7e6",
            borderRadius: "12px",
            padding: "14px 16px",
            marginBottom: "20px",
          }}
        >
          <h3 style={sectionTitleStyle}>Warning</h3>
          <p style={textStyle}>{item.result.warning}</p>
        </div>
      )}
    </div>
  );
}
