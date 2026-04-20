"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = TaskPaneApp;
const react_1 = require("react");
const runActionDesk_1 = require("./app/runActionDesk");
const useOutlookShellContext_1 = require("./office/useOutlookShellContext");
const analysisTaxonomy_1 = require("./services/analysisTaxonomy");
const analysisInput_1 = require("./services/analysisInput");
const cleanEmailText_1 = require("./services/cleanEmailText");
function TaskPaneApp() {
    const { currentEmailContext, hasLiveOutlookContext } = (0, useOutlookShellContext_1.useOutlookShellContext)();
    const [taskPaneState, setTaskPaneState] = (0, react_1.useState)({ status: "idle" });
    const [copyFeedback, setCopyFeedback] = (0, react_1.useState)("idle");
    const [queueImportState, setQueueImportState] = (0, react_1.useState)("idle");
    (0, react_1.useEffect)(() => {
        if (!currentEmailContext) {
            return;
        }
        const emailSubject = currentEmailContext.subject.trim();
        const emailBody = currentEmailContext.body.trim();
        if (!emailBody) {
            return;
        }
        const cleanedEmailBody = (0, cleanEmailText_1.cleanEmailText)(emailBody);
        const analysisInput = (0, analysisInput_1.buildAnalysisInput)({
            subject: (0, cleanEmailText_1.cleanEmailText)(emailSubject),
            body: cleanedEmailBody,
        });
        let isMounted = true;
        async function analyzeCurrentEmail() {
            setTaskPaneState({ status: "loading" });
            try {
                const result = await (0, runActionDesk_1.runActionDesk)(analysisInput);
                if (!isMounted) {
                    return;
                }
                setTaskPaneState({
                    status: "ready",
                    result,
                });
            }
            catch {
                if (!isMounted) {
                    return;
                }
                setTaskPaneState({
                    status: "error",
                    message: "Action Desk could not process the current email right now.",
                });
            }
        }
        void analyzeCurrentEmail();
        return () => {
            isMounted = false;
        };
    }, [currentEmailContext]);
    (0, react_1.useEffect)(() => {
        if (copyFeedback === "idle") {
            return;
        }
        const timeoutId = window.setTimeout(() => {
            setCopyFeedback("idle");
        }, 2500);
        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [copyFeedback]);
    (0, react_1.useEffect)(() => {
        if (queueImportState === "idle") {
            return;
        }
        const timeoutId = window.setTimeout(() => {
            setQueueImportState("idle");
        }, 2500);
        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [queueImportState]);
    async function handleCopyReplyDraft() {
        if (taskPaneState.status !== "ready" || !taskPaneState.result.replyDraft.trim()) {
            return;
        }
        if (!navigator.clipboard?.writeText) {
            setCopyFeedback("error");
            return;
        }
        try {
            await navigator.clipboard.writeText(taskPaneState.result.replyDraft);
            setCopyFeedback("success");
        }
        catch {
            setCopyFeedback("error");
        }
    }
    async function handleAddToQueue() {
        if (!currentEmailContext) {
            return;
        }
        const itemId = currentEmailContext.itemId.trim();
        const subject = currentEmailContext.subject.trim();
        const bodyText = currentEmailContext.body.trim();
        const fromName = currentEmailContext.customer.trim() || "Unknown sender";
        const fromEmail = currentEmailContext.from.trim() || "unknown@example.com";
        if (!itemId || !subject || !bodyText) {
            setQueueImportState("error");
            return;
        }
        try {
            const response = await fetch("/api/inbox/import", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    id: itemId,
                    subject,
                    bodyText,
                    fromName,
                    fromEmail,
                    receivedAt: new Date().toISOString(),
                }),
            });
            if (!response.ok) {
                throw new Error("Inbox import failed.");
            }
            setQueueImportState("success");
        }
        catch {
            setQueueImportState("error");
        }
    }
    const pageStyle = {
        minHeight: "100vh",
        margin: 0,
        backgroundColor: "#f3f6fb",
        color: "#1f2937",
        fontFamily: "Arial, sans-serif",
    };
    const shellStyle = {
        padding: "20px",
        boxSizing: "border-box",
    };
    const cardStyle = {
        backgroundColor: "#ffffff",
        border: "1px solid #d8e1ec",
        borderRadius: "16px",
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
        padding: "18px",
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
        padding: "14px",
        borderRadius: "12px",
        border: "1px solid #dbe4ee",
        backgroundColor: "#f8fafc",
        whiteSpace: "pre-wrap",
        fontSize: "13px",
        lineHeight: 1.7,
        color: "#334155",
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
    const currentEmailBody = currentEmailContext?.body.trim() ?? "";
    const hasEmptyCurrentBody = Boolean(currentEmailContext) && currentEmailBody.length === 0;
    if (!hasLiveOutlookContext && !currentEmailContext) {
        return (<div style={pageStyle}>
        <div style={shellStyle}>
          <div style={cardStyle}>
            <h1 style={titleStyle}>Action Desk</h1>
            <p style={{ ...textStyle, marginTop: "8px" }}>
              Open this task pane from an Outlook email to analyze the currently selected message.
            </p>
          </div>
        </div>
      </div>);
    }
    return (<div style={pageStyle}>
      <div style={shellStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>Action Desk</h1>
          <p style={{ ...textStyle, marginTop: "8px" }}>
            Read-only analysis for the currently opened Outlook message.
          </p>
        </div>

        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>Current Email</h2>
          <p style={textStyle}>
            <strong>Subject:</strong> {currentEmailContext?.subject || "No subject"}
          </p>
          <p style={textStyle}>
            <strong>From:</strong> {currentEmailContext?.from || "Unknown sender"}
          </p>
          <div style={{ marginTop: "12px" }}>
            <button type="button" onClick={handleAddToQueue} disabled={!currentEmailContext?.itemId || hasEmptyCurrentBody} style={{
            ...secondaryButtonStyle,
            backgroundColor: !currentEmailContext?.itemId || hasEmptyCurrentBody
                ? "#e2e8f0"
                : queueImportState === "success"
                    ? "#dcfce7"
                    : queueImportState === "error"
                        ? "#fee2e2"
                        : "#ffffff",
            color: !currentEmailContext?.itemId || hasEmptyCurrentBody
                ? "#64748b"
                : queueImportState === "success"
                    ? "#166534"
                    : queueImportState === "error"
                        ? "#991b1b"
                        : "#0f172a",
            cursor: !currentEmailContext?.itemId || hasEmptyCurrentBody ? "not-allowed" : "pointer",
        }}>
              {queueImportState === "success"
            ? "Added to Queue"
            : queueImportState === "error"
                ? "Add Failed"
                : "Add to Action Desk Queue"}
            </button>
            {queueImportState === "error" && (<p style={{ ...textStyle, marginTop: "8px", color: "#991b1b" }}>
                The current email could not be added to the Action Desk queue.
              </p>)}
          </div>
        </div>

        {taskPaneState.status === "loading" && (<div style={cardStyle}>
            <p style={textStyle}>Processing the current email and generating Action Desk output.</p>
          </div>)}

        {hasEmptyCurrentBody && (<div style={cardStyle}>
            <h2 style={sectionTitleStyle}>Status</h2>
            <p style={{ ...textStyle, color: "#991b1b" }}>
              This message body is empty or unavailable in the current Outlook context.
            </p>
          </div>)}

        {!hasEmptyCurrentBody && taskPaneState.status === "error" && (<div style={cardStyle}>
            <h2 style={sectionTitleStyle}>Status</h2>
            <p style={{ ...textStyle, color: "#991b1b" }}>{taskPaneState.message}</p>
          </div>)}

        {!hasEmptyCurrentBody && taskPaneState.status === "ready" && (<>
            <div style={cardStyle}>
              <h2 style={sectionTitleStyle}>Summary</h2>
              <p style={textStyle}>
                {taskPaneState.result.analysis.summary || "No summary available."}
              </p>
            </div>

            <div style={cardStyle}>
              <h2 style={sectionTitleStyle}>Recommended Action</h2>
              <p style={textStyle}>
                {taskPaneState.result.analysis.nextAction ||
                "Review the email and determine the next support step."}
              </p>
            </div>

            <div style={cardStyle}>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                marginBottom: "8px",
                flexWrap: "wrap",
            }}>
                <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Reply Draft</h2>
                <button type="button" onClick={handleCopyReplyDraft} disabled={!taskPaneState.result.replyDraft.trim()} style={{
                ...secondaryButtonStyle,
                backgroundColor: !taskPaneState.result.replyDraft.trim()
                    ? "#e2e8f0"
                    : copyFeedback === "success"
                        ? "#dcfce7"
                        : copyFeedback === "error"
                            ? "#fee2e2"
                            : "#ffffff",
                color: !taskPaneState.result.replyDraft.trim()
                    ? "#64748b"
                    : copyFeedback === "success"
                        ? "#166534"
                        : copyFeedback === "error"
                            ? "#991b1b"
                            : "#0f172a",
                cursor: !taskPaneState.result.replyDraft.trim() ? "not-allowed" : "pointer",
            }}>
                  {!taskPaneState.result.replyDraft.trim()
                ? "No Reply Draft"
                : copyFeedback === "success"
                    ? "Copied"
                    : copyFeedback === "error"
                        ? "Copy Failed"
                        : "Copy Reply Draft"}
                </button>
              </div>
              <pre style={bodyBlockStyle}>
                {taskPaneState.result.replyDraft || "No reply draft available."}
              </pre>
              {copyFeedback === "error" && (<p style={{ ...textStyle, marginTop: "10px", color: "#991b1b" }}>
                  Clipboard access is unavailable in this Outlook context. Copy the draft manually.
                </p>)}
            </div>

            <div style={cardStyle}>
              <h2 style={sectionTitleStyle}>Analysis Details</h2>
              <p style={textStyle}>
                <strong>Intent:</strong> {(0, analysisTaxonomy_1.getIntentLabel)(taskPaneState.result.analysis.intent)}
              </p>
              <p style={textStyle}>
                <strong>Urgency:</strong> {taskPaneState.result.analysis.urgency}
              </p>
              <p style={textStyle}>
                <strong>Order Number:</strong>{" "}
                {taskPaneState.result.analysis.orderNumber ?? "Not provided"}
              </p>
              {taskPaneState.result.analysis.risks.length > 0 && (<div style={{ marginTop: "10px" }}>
                  <p style={{ ...textStyle, fontWeight: 700 }}>Issues</p>
                  <ul style={{ margin: "8px 0 0", paddingLeft: "20px", color: "#334155" }}>
                    {taskPaneState.result.analysis.risks.map((risk) => (<li key={risk} style={{ marginBottom: "6px", lineHeight: 1.6 }}>
                        {(0, analysisTaxonomy_1.getRiskLabel)(risk)}
                      </li>))}
                  </ul>
                </div>)}
            </div>

            {taskPaneState.result.warning && (<div style={{
                    ...cardStyle,
                    borderColor: "#f59e0b",
                    backgroundColor: "#fff7e6",
                }}>
                <h2 style={sectionTitleStyle}>Warning</h2>
                <p style={textStyle}>{taskPaneState.result.warning}</p>
              </div>)}
          </>)}
      </div>
    </div>);
}
