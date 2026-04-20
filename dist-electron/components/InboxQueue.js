"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InboxQueue = InboxQueue;
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
function getUrgencyBadgeStyle(urgency) {
    return {
        fontSize: "12px",
        fontWeight: 700,
        color: urgency === "high" ? "#991b1b" : urgency === "low" ? "#166534" : "#92400e",
        backgroundColor: urgency === "high" ? "#fee2e2" : urgency === "low" ? "#dcfce7" : "#fef3c7",
        borderRadius: "999px",
        padding: "4px 8px",
        textTransform: "capitalize",
    };
}
function getPriorityLevel(priorityScore) {
    if (priorityScore >= 70) {
        return "High";
    }
    if (priorityScore >= 40) {
        return "Medium";
    }
    return "Low";
}
function getPriorityBadgeStyle(priorityScore) {
    const level = getPriorityLevel(priorityScore);
    return {
        fontSize: "12px",
        fontWeight: 700,
        color: level === "High" ? "#991b1b" : level === "Medium" ? "#92400e" : "#166534",
        backgroundColor: level === "High" ? "#fee2e2" : level === "Medium" ? "#fef3c7" : "#dcfce7",
        borderRadius: "999px",
        padding: "4px 8px",
    };
}
function getAgeBadgeStyle(label) {
    if (label.startsWith("Overdue")) {
        return {
            fontSize: "12px",
            fontWeight: 700,
            color: "#991b1b",
            backgroundColor: "#fee2e2",
            borderRadius: "999px",
            padding: "4px 8px",
        };
    }
    if (label.startsWith("Stale")) {
        return {
            fontSize: "12px",
            fontWeight: 700,
            color: "#9a3412",
            backgroundColor: "#ffedd5",
            borderRadius: "999px",
            padding: "4px 8px",
        };
    }
    if (label.startsWith("Aging") || label.startsWith("Waiting")) {
        return {
            fontSize: "12px",
            fontWeight: 700,
            color: "#92400e",
            backgroundColor: "#fef3c7",
            borderRadius: "999px",
            padding: "4px 8px",
        };
    }
    return {
        fontSize: "12px",
        fontWeight: 700,
        color: "#166534",
        backgroundColor: "#dcfce7",
        borderRadius: "999px",
        padding: "4px 8px",
    };
}
function getPilotQueueViewLabel(view) {
    switch (view) {
        case "active":
            return "Active";
        case "waiting_on_customer":
            return "Waiting";
        case "snoozed":
            return "Snoozed";
        case "done":
            return "Done";
        case "not_relevant":
            return "Not Relevant";
        case "all":
            return "All";
    }
}
function getActionabilityBadge(actionability) {
    if (actionability === "awareness_only") {
        return {
            label: "Awareness Only",
            style: {
                fontSize: "12px",
                fontWeight: 700,
                color: "#475569",
                backgroundColor: "#e2e8f0",
                borderRadius: "999px",
                padding: "4px 8px",
            },
        };
    }
    if (actionability === "no_action_needed") {
        return {
            label: "No Action Needed",
            style: {
                fontSize: "12px",
                fontWeight: 700,
                color: "#166534",
                backgroundColor: "#dcfce7",
                borderRadius: "999px",
                padding: "4px 8px",
            },
        };
    }
    return null;
}
function getRowSurfaceStyle(options) {
    const { isSelected, isFailed, isPending, isHighPriority } = options;
    if (isSelected) {
        return {
            borderLeft: "4px solid #2563eb",
            backgroundColor: "#eff6ff",
            boxShadow: "inset 0 0 0 1px rgba(37, 99, 235, 0.12)",
        };
    }
    if (isFailed) {
        return {
            borderLeft: "4px solid #dc2626",
            backgroundColor: "#fff4f4",
            boxShadow: "inset 0 0 0 1px rgba(220, 38, 38, 0.1)",
        };
    }
    if (isHighPriority) {
        return {
            borderLeft: "4px solid #dc2626",
            backgroundColor: "#fff8f6",
            boxShadow: "inset 0 0 0 1px rgba(220, 38, 38, 0.06)",
        };
    }
    if (isPending) {
        return {
            borderLeft: "4px solid #f59e0b",
            backgroundColor: "#fffdf5",
            boxShadow: "inset 0 0 0 1px rgba(245, 158, 11, 0.08)",
        };
    }
    return {
        borderLeft: "4px solid transparent",
        backgroundColor: "#ffffff",
        boxShadow: "none",
    };
}
function InboxQueue({ items, totalCount, summary, topIssues, activeIssueFilter, selectedEmailId, hasActiveFilters, pilotMode, pilotEmptyStateMessage, pilotQueueView, pilotItemStates, queueView, showProblemsOnly, isLoadingInbox, isLoadingMore, nextCursor, loadMoreError, lastLoadedAt, searchQuery, urgencyFilter, intentFilter, intentOptions, onRefreshInbox, onLoadMore, retryingEmailId, onRetryEmail, onToggleProblemsOnly, onIssueFilterChange, onClearIssueFilter, onSelectEmail, onPilotQueueViewChange, onQueueViewChange, onSearchQueryChange, onUrgencyFilterChange, onIntentFilterChange, }) {
    function isOutlookEmailSource(source) {
        return source === "outlook_import" || source === "outlook_graph";
    }
    const containerStyle = {
        backgroundColor: "#ffffff",
        border: "1px solid #d8e1ec",
        borderRadius: "16px",
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
        overflow: "hidden",
    };
    const headerStyle = {
        padding: "18px 20px",
        borderBottom: "1px solid #e5edf5",
        backgroundColor: "#f8fafc",
    };
    const titleStyle = {
        margin: 0,
        fontSize: "18px",
        fontWeight: 700,
        color: "#0f172a",
    };
    const headerRowStyle = {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "12px",
        flexWrap: "wrap",
    };
    const subtitleStyle = {
        margin: "4px 0 0",
        fontSize: "13px",
        color: "#475569",
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
    const controlsStyle = {
        display: "grid",
        gap: "10px",
        marginTop: "14px",
    };
    const segmentedControlStyle = {
        display: "inline-flex",
        border: "1px solid #cbd5e1",
        borderRadius: "10px",
        overflow: "hidden",
        backgroundColor: "#ffffff",
    };
    const segmentButtonStyle = {
        border: "none",
        backgroundColor: "#ffffff",
        color: "#475569",
        padding: "8px 12px",
        fontSize: "13px",
        fontWeight: 700,
        cursor: "pointer",
    };
    const inputStyle = {
        width: "100%",
        padding: "10px 12px",
        border: "1px solid #cbd5e1",
        borderRadius: "10px",
        boxSizing: "border-box",
        fontSize: "13px",
        backgroundColor: "#ffffff",
        color: "#0f172a",
    };
    const filterRowStyle = {
        display: "grid",
        gridTemplateColumns: pilotMode
            ? "repeat(3, minmax(0, 1fr))"
            : "repeat(2, minmax(0, 1fr))",
        gap: "10px",
    };
    const listStyle = {
        display: "grid",
    };
    const topIssuesPanelStyle = {
        padding: "14px 20px",
        borderBottom: "1px solid #e5edf5",
        backgroundColor: "#f8fafc",
    };
    const topIssuesRowStyle = {
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        marginTop: "10px",
    };
    const topIssueBadgeStyle = {
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        border: "1px solid #dbe5f0",
        borderRadius: "999px",
        padding: "6px 10px",
        backgroundColor: "#ffffff",
        fontSize: "12px",
        fontWeight: 700,
        color: "#334155",
        cursor: "pointer",
    };
    const summaryBarStyle = {
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: "8px",
        padding: "12px 20px",
        borderBottom: "1px solid #e5edf5",
        backgroundColor: "#fcfdff",
    };
    const summaryCardStyle = {
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        padding: "10px 12px",
        backgroundColor: "#ffffff",
    };
    const summaryLabelStyle = {
        margin: 0,
        fontSize: "11px",
        fontWeight: 700,
        color: "#64748b",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
    };
    const summaryValueStyle = {
        margin: "4px 0 0",
        fontSize: "20px",
        fontWeight: 700,
        color: "#0f172a",
    };
    const emptyStateStyle = {
        padding: "28px 20px",
        fontSize: "14px",
        lineHeight: 1.6,
        color: "#64748b",
    };
    const footerStyle = {
        padding: "16px 20px 20px",
        borderTop: "1px solid #e5edf5",
        backgroundColor: "#fcfdff",
    };
    const sourceBadgeStyle = {
        fontSize: "12px",
        fontWeight: 700,
        color: "#0f766e",
        backgroundColor: "#ccfbf1",
        borderRadius: "999px",
        padding: "4px 8px",
    };
    const inlineActionButtonStyle = {
        border: "1px solid #cbd5e1",
        backgroundColor: "#ffffff",
        color: "#0f172a",
        borderRadius: "8px",
        padding: "4px 8px",
        fontSize: "12px",
        fontWeight: 700,
        cursor: "pointer",
    };
    return (<div style={containerStyle}>
      <div style={headerStyle}>
        <div style={headerRowStyle}>
          <div>
            <h2 style={titleStyle}>
              {queueView === "customer_service" ? "Customer Service Queue" : "All Inbox"}
            </h2>
            <p style={subtitleStyle}>
              Showing {items.length} of {totalCount} emails
              {lastLoadedAt ? ` | Last loaded ${lastLoadedAt}` : ""}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div style={segmentedControlStyle}>
              <button type="button" onClick={queueView === "customer_service" ? undefined : () => onQueueViewChange("customer_service")} aria-pressed={queueView === "customer_service"} style={{
            ...segmentButtonStyle,
            backgroundColor: queueView === "customer_service" ? "#dbeafe" : "#ffffff",
            color: queueView === "customer_service" ? "#1d4ed8" : "#475569",
            cursor: queueView === "customer_service" ? "default" : "pointer",
        }}>
                Customer Service Queue
              </button>
              <button type="button" onClick={queueView === "all_inbox" ? undefined : () => onQueueViewChange("all_inbox")} aria-pressed={queueView === "all_inbox"} style={{
            ...segmentButtonStyle,
            backgroundColor: queueView === "all_inbox" ? "#dbeafe" : "#ffffff",
            color: queueView === "all_inbox" ? "#1d4ed8" : "#475569",
            cursor: queueView === "all_inbox" ? "default" : "pointer",
            borderLeft: "1px solid #cbd5e1",
        }}>
                All Inbox
              </button>
            </div>
            <div style={segmentedControlStyle}>
              <button type="button" onClick={showProblemsOnly ? onToggleProblemsOnly : undefined} aria-pressed={!showProblemsOnly} style={{
            ...segmentButtonStyle,
            backgroundColor: showProblemsOnly ? "#ffffff" : "#dbeafe",
            color: showProblemsOnly ? "#475569" : "#1d4ed8",
            cursor: showProblemsOnly ? "pointer" : "default",
        }}>
                All Emails
              </button>
              <button type="button" onClick={showProblemsOnly ? undefined : onToggleProblemsOnly} aria-pressed={showProblemsOnly} style={{
            ...segmentButtonStyle,
            backgroundColor: showProblemsOnly ? "#fee2e2" : "#ffffff",
            color: showProblemsOnly ? "#991b1b" : "#475569",
            cursor: showProblemsOnly ? "default" : "pointer",
            borderLeft: "1px solid #cbd5e1",
        }}>
                Problems First
              </button>
            </div>
            <button type="button" onClick={onRefreshInbox} disabled={isLoadingInbox} style={{
            ...secondaryButtonStyle,
            backgroundColor: isLoadingInbox ? "#e2e8f0" : "#ffffff",
            color: isLoadingInbox ? "#64748b" : "#0f172a",
            cursor: isLoadingInbox ? "not-allowed" : "pointer",
        }}>
              {isLoadingInbox ? "Refreshing Queue..." : "Refresh Queue"}
            </button>
          </div>
        </div>
        <div style={controlsStyle}>
          <input type="text" value={searchQuery} onChange={(event) => onSearchQueryChange(event.target.value)} placeholder="Search sender or subject" style={inputStyle}/>
          <div style={filterRowStyle}>
            <select value={urgencyFilter} onChange={(event) => onUrgencyFilterChange(event.target.value)} style={inputStyle}>
              <option value="all">All urgency</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select value={intentFilter} onChange={(event) => onIntentFilterChange(event.target.value)} style={inputStyle}>
              <option value="all">All intents</option>
              {intentOptions.map((intent) => (<option key={intent} value={intent}>
                  {(0, analysisTaxonomy_1.getIntentLabel)(intent)}
                </option>))}
            </select>
            {pilotMode && (<select value={pilotQueueView} onChange={(event) => onPilotQueueViewChange(event.target.value)} style={inputStyle}>
                {["active", "waiting_on_customer", "snoozed", "done", "not_relevant", "all"].map((view) => (<option key={view} value={view}>
                    {getPilotQueueViewLabel(view)}
                  </option>))}
              </select>)}
          </div>
        </div>
      </div>

      <div style={listStyle}>
        <div style={topIssuesPanelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <p style={{ ...summaryLabelStyle, fontSize: "12px" }}>Top Issues</p>
            <button type="button" onClick={onClearIssueFilter} disabled={activeIssueFilter === null} style={{
            border: "none",
            background: "transparent",
            color: activeIssueFilter ? "#1d4ed8" : "#94a3b8",
            fontSize: "12px",
            fontWeight: 700,
            cursor: activeIssueFilter ? "pointer" : "default",
            padding: 0,
        }}>
              All Issues
            </button>
          </div>
          {topIssues.length > 0 ? (<div style={topIssuesRowStyle}>
              {topIssues.map((issue) => (<button key={issue.code} type="button" onClick={() => onIssueFilterChange(issue.code)} aria-pressed={activeIssueFilter === issue.code} style={{
                    ...topIssueBadgeStyle,
                    backgroundColor: activeIssueFilter === issue.code ? "#dbeafe" : "#ffffff",
                    borderColor: activeIssueFilter === issue.code ? "#93c5fd" : "#dbe5f0",
                    color: activeIssueFilter === issue.code ? "#1d4ed8" : "#334155",
                }}>
                  {issue.label}
                  <span style={{ color: "#64748b" }}>
                    ({issue.count} {issue.count === 1 ? "email" : "emails"})
                  </span>
                </button>))}
            </div>) : (<p style={{ ...subtitleStyle, marginTop: "8px" }}>No urgent issues right now.</p>)}
        </div>

        <div style={summaryBarStyle}>
          <div style={summaryCardStyle}>
            <p style={summaryLabelStyle}>Total Loaded</p>
            <p style={summaryValueStyle}>{summary.totalLoaded}</p>
          </div>
          <div style={{
            ...summaryCardStyle,
            backgroundColor: summary.highPriority > 0 ? "#fff7f7" : "#ffffff",
            borderColor: summary.highPriority > 0 ? "#fecaca" : "#e2e8f0",
        }}>
            <p style={summaryLabelStyle}>High Priority</p>
            <p style={{ ...summaryValueStyle, color: "#991b1b" }}>{summary.highPriority}</p>
          </div>
          <div style={{
            ...summaryCardStyle,
            backgroundColor: summary.failed > 0 ? "#fff7f7" : "#ffffff",
            borderColor: summary.failed > 0 ? "#fecaca" : "#e2e8f0",
        }}>
            <p style={summaryLabelStyle}>Failed</p>
            <p style={{ ...summaryValueStyle, color: "#991b1b" }}>{summary.failed}</p>
          </div>
          <div style={{
            ...summaryCardStyle,
            backgroundColor: summary.processing > 0 ? "#fffbeb" : "#ffffff",
            borderColor: summary.processing > 0 ? "#fde68a" : "#e2e8f0",
        }}>
            <p style={summaryLabelStyle}>Processing</p>
            <p style={{ ...summaryValueStyle, color: "#92400e" }}>{summary.processing}</p>
          </div>
        </div>

        {items.length === 0 && (<div style={emptyStateStyle}>
            {pilotMode && !hasActiveFilters && pilotEmptyStateMessage
                ? pilotEmptyStateMessage
                : pilotMode && pilotQueueView !== "active"
                    ? `No ${getPilotQueueViewLabel(pilotQueueView).toLowerCase()} emails match the current filters.`
                    : queueView === "customer_service"
                        ? "No likely customer-service emails match the current filters. Switch to All Inbox to review everything."
                        : showProblemsOnly
                            ? "No urgent issues right now."
                            : hasActiveFilters
                                ? "No emails match the current filters. Try clearing the search or urgency filter."
                                : "Inbox is empty right now. New emails will appear here when available."}
          </div>)}

        {items.map((item) => {
            const pilotItemState = (0, pilotQueueState_1.getPilotQueueItemState)(pilotItemStates, item.email.id);
            const pilotItemView = (0, pilotQueueState_1.getPilotQueueViewForItem)(pilotItemState);
            const isSelected = item.email.id === selectedEmailId;
            const isFailed = item.status === "failed";
            const isPending = item.status === "pending";
            const isRetrying = retryingEmailId === item.email.id;
            const priorityLevel = getPriorityLevel(item.result?.priorityScore ?? 0);
            const isHighPriority = priorityLevel === "High";
            const actionabilityBadge = item.result
                ? getActionabilityBadge(item.result.analysis.actionability)
                : null;
            const canOpenOutlook = (0, openInOutlook_1.canOpenInOutlook)(item);
            const queueAge = (0, queueAging_1.getQueueAgeInfo)({
                receivedAt: item.email.receivedAt,
                pilotItemState: pilotMode ? pilotItemState : undefined,
            });
            const rowSurfaceStyle = getRowSurfaceStyle({
                isSelected,
                isFailed,
                isPending,
                isHighPriority,
            });
            return (<div key={item.email.id} style={{
                    borderBottom: "1px solid #e5edf5",
                    transition: "background-color 120ms ease, box-shadow 120ms ease",
                    ...rowSurfaceStyle,
                }}>
              <button type="button" onClick={() => onSelectEmail(item.email.id)} style={{
                    width: "100%",
                    border: "none",
                    background: "transparent",
                    padding: "18px 20px",
                    textAlign: "left",
                    cursor: "pointer",
                }}>
                <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    alignItems: "start",
                    marginBottom: "10px",
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    color: isFailed ? "#7f1d1d" : "#334155",
                    marginBottom: "5px",
                    letterSpacing: "0.01em",
                }}>
                      {item.email.senderName}
                    </div>
                    <div style={{
                    fontSize: isHighPriority || isFailed ? "15px" : "14px",
                    fontWeight: isHighPriority || isFailed ? 700 : 600,
                    lineHeight: 1.4,
                    color: isFailed ? "#991b1b" : "#0f172a",
                    marginBottom: "2px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                }}>
                      {item.email.subject}
                    </div>
                    <div style={{
                    marginTop: "8px",
                    fontSize: "12px",
                    lineHeight: 1.5,
                    color: isFailed ? "#b91c1c" : isPending ? "#92400e" : "#64748b",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                }}>
                      {isFailed
                    ? item.processingError ?? "This email could not be processed."
                    : isPending
                        ? "Processing this email..."
                        : item.previewText}
                    </div>
                  </div>

                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flexShrink: 0,
                }}>
                    <span style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: isFailed ? "#991b1b" : isPending ? "#92400e" : "#64748b",
                }}>
                      {formatReceivedTime(item.email.receivedAt)}
                    </span>
                    <button type="button" disabled={!canOpenOutlook} onClick={(event) => {
                    event.stopPropagation();
                    if (!canOpenOutlook) {
                        return;
                    }
                    window.open((0, openInOutlook_1.buildOutlookSearchUrl)(item), "_blank");
                }} style={{
                    ...inlineActionButtonStyle,
                    backgroundColor: canOpenOutlook ? "#ffffff" : "#e2e8f0",
                    color: canOpenOutlook ? "#0f172a" : "#64748b",
                    cursor: canOpenOutlook ? "pointer" : "not-allowed",
                }}>
                      Open in Outlook
                    </button>
                  </div>
                </div>

                <div style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    alignItems: "center",
                }}>
                  {item.status === "processed" && (<span style={{
                        ...getPriorityBadgeStyle(item.result?.priorityScore ?? 0),
                        boxShadow: isHighPriority
                            ? "inset 0 0 0 1px rgba(153, 27, 27, 0.12)"
                            : "none",
                    }}>
                      {priorityLevel} Priority
                    </span>)}
                  {item.status === "failed" && (<span style={{
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "#991b1b",
                        backgroundColor: "#fee2e2",
                        boxShadow: "inset 0 0 0 1px rgba(153, 27, 27, 0.12)",
                        borderRadius: "999px",
                        padding: "4px 8px",
                    }}>
                      Failed
                    </span>)}
                  {item.status === "pending" && (<span style={{
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "#92400e",
                        backgroundColor: "#fef3c7",
                        boxShadow: "inset 0 0 0 1px rgba(146, 64, 14, 0.1)",
                        borderRadius: "999px",
                        padding: "4px 8px",
                    }}>
                      Processing
                    </span>)}
                  {item.status === "processed" && item.result && (<>
                      {isOutlookEmailSource(item.email.source) && (<span style={sourceBadgeStyle}>From Outlook</span>)}
                      {pilotMode && pilotItemView === "waiting_on_customer" && (<span style={getAgeBadgeStyle(queueAge.label)}>{queueAge.label}</span>)}
                      {pilotMode && pilotItemView === "snoozed" && (<span style={{
                            fontSize: "12px",
                            fontWeight: 700,
                            color: "#1d4ed8",
                            backgroundColor: "#dbeafe",
                            borderRadius: "999px",
                            padding: "4px 8px",
                        }}>
                          {queueAge.label}
                        </span>)}
                      {pilotMode && pilotItemView === "done" && (<span style={{
                            fontSize: "12px",
                            fontWeight: 700,
                            color: "#166534",
                            backgroundColor: "#dcfce7",
                            borderRadius: "999px",
                            padding: "4px 8px",
                        }}>
                          Done
                        </span>)}
                      {pilotMode && pilotItemView === "not_relevant" && (<span style={{
                            fontSize: "12px",
                            fontWeight: 700,
                            color: "#475569",
                            backgroundColor: "#e2e8f0",
                            borderRadius: "999px",
                            padding: "4px 8px",
                        }}>
                          Not Relevant
                        </span>)}
                      {(!pilotMode || pilotItemView === "active") && (<span style={getAgeBadgeStyle(queueAge.label)}>{queueAge.label}</span>)}
                      <span style={{
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "#1d4ed8",
                        backgroundColor: "#dbeafe",
                        borderRadius: "999px",
                        padding: "4px 8px",
                    }}>
                        {(0, analysisTaxonomy_1.getIntentLabel)(item.result.analysis.intent)}
                      </span>
                      {item.result.analysis.workType && item.result.analysis.workType !== "customer_support" && (<span style={{
                            fontSize: "12px",
                            fontWeight: 700,
                            color: "#475569",
                            backgroundColor: "#e2e8f0",
                            borderRadius: "999px",
                            padding: "4px 8px",
                        }}>
                          {(0, customerServiceMail_1.getWorkTypeLabel)(item.result.analysis.workType)}
                        </span>)}
                      <span style={getUrgencyBadgeStyle(item.result.analysis.urgency)}>
                        {item.result.analysis.urgency}
                      </span>
                      {actionabilityBadge && (<span style={actionabilityBadge.style}>
                          {actionabilityBadge.label}
                        </span>)}
                    </>)}
                  <span style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#334155",
                    backgroundColor: "#e2e8f0",
                    borderRadius: "999px",
                    padding: "4px 8px",
                }}>
                    {item.issueCount} issues
                  </span>
                  {item.status !== "processed" && isOutlookEmailSource(item.email.source) && (<span style={sourceBadgeStyle}>From Outlook</span>)}
                </div>
              </button>

              {isFailed && (<div style={{ padding: "0 20px 16px" }}>
                  <button type="button" onClick={() => onRetryEmail(item.email.id)} disabled={isRetrying} style={{
                        ...secondaryButtonStyle,
                        backgroundColor: isRetrying ? "#e2e8f0" : "#ffffff",
                        color: isRetrying ? "#64748b" : "#0f172a",
                        cursor: isRetrying ? "not-allowed" : "pointer",
                    }}>
                    {isRetrying ? "Retrying..." : "Retry"}
                  </button>
                </div>)}
            </div>);
        })}

        {(nextCursor || loadMoreError) && (<div style={footerStyle}>
            {loadMoreError && (<p style={{ ...subtitleStyle, marginBottom: "10px", color: "#991b1b" }}>
                {loadMoreError}
              </p>)}
            {nextCursor && (<button type="button" onClick={onLoadMore} disabled={isLoadingMore} style={{
                    ...secondaryButtonStyle,
                    backgroundColor: isLoadingMore ? "#e2e8f0" : "#ffffff",
                    color: isLoadingMore ? "#64748b" : "#0f172a",
                    cursor: isLoadingMore ? "not-allowed" : "pointer",
                }}>
                {isLoadingMore ? "Loading More..." : "Load More"}
              </button>)}
          </div>)}
      </div>
    </div>);
}
