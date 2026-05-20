import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ThreadConversationView } from "./ThreadConversationView";
import type {
  ActionDeskResult,
  AssignmentResolution,
  ProcessedEmail,
  WorkflowThread,
} from "../types/actionDesk";
import { getOutlookReplyDraftText } from "../services/outlookDraftContent";

function buildResult(
  overrides: Partial<ActionDeskResult> = {},
): ActionDeskResult {
  return {
    analysis: {
      summary: "Customer needs an order update.",
      intent: "where_is_my_order",
      urgency: "medium",
      confidence: "medium",
      risks: [],
      nextAction: "Check shipment status.",
      replyNeeded: "yes",
      actionability: "action_required",
      workType: "customer_support",
    },
    analysisSource: "fallback",
    replyDraft: "Hi,\n\nI will check the shipment status.\n\nBest,\nSupport Team",
    priorityScore: 50,
    ...overrides,
  };
}

function buildProcessedEmail(
  result: ActionDeskResult = buildResult(),
): ProcessedEmail {
  return {
    email: {
      id: "email-1",
      senderName: "Acme Logistics",
      senderEmail: "orders@acme.com",
      subject: "Need shipment update",
      receivedAt: "2026-04-21T11:15:00.000Z",
      body: "Where is my order?",
    },
    status: "processed",
    result,
    issueCount: 0,
    previewText: "Where is my order?",
  };
}

function buildThread(item: ProcessedEmail): WorkflowThread {
  const assignmentResolution: AssignmentResolution = {
    assignmentStatus: "unassigned",
    assignmentSource: "none",
    assignedRepIds: [],
    assignedRepNames: [],
    matchType: "none",
  };

  return {
    id: "sender:orders@acme.com",
    groupKey: "sender:orders@acme.com",
    title: "Acme Logistics",
    subtitle: "orders@acme.com",
    items: [item],
    representativeItem: item,
    latestReceivedAt: "2026-04-21T11:15:00.000Z",
    oldestReceivedAt: "2026-04-21T11:15:00.000Z",
    latestActivityAt: "2026-04-21T11:15:00.000Z",
    itemCount: 1,
    assignmentResolution,
    assignmentHistory: [],
    status: "new",
    notes: [],
    replyLog: [],
    isSnoozed: false,
    noteCount: 0,
    replyCount: 0,
    activePresenceRecords: [],
    slaMinutes: 45,
    sla: {
      firstResponse: {
        target: "first_response",
        state: "on_track",
        elapsedMinutes: 45,
        targetMinutes: 60,
        warningStartsAtMinutes: 45,
        dueAt: "2026-04-21T12:15:00.000Z",
      },
      resolution: {
        target: "resolution",
        state: "on_track",
        elapsedMinutes: 45,
        targetMinutes: 24 * 60,
        warningStartsAtMinutes: 1080,
        dueAt: "2026-04-22T11:15:00.000Z",
      },
      current: {
        target: "first_response",
        state: "on_track",
        elapsedMinutes: 45,
        targetMinutes: 60,
        warningStartsAtMinutes: 45,
        dueAt: "2026-04-21T12:15:00.000Z",
      },
    },
  };
}

function renderConversation(
  item: ProcessedEmail,
  options: {
    canCreateOutlookDraft?: boolean;
    canOpenOutlook?: boolean;
  } = {},
): string {
  return renderToStaticMarkup(
    <ThreadConversationView
      item={item}
      thread={buildThread(item)}
      pilotMode={false}
      hasReplyDraft={Boolean(item.result?.replyDraft)}
      copyFeedback="idle"
      caseCopyFeedback="idle"
      rawCaseCopyFeedback="idle"
      regeneratingReply={false}
      outlookDraftCreationStatus="idle"
      canCreateOutlookDraft={options.canCreateOutlookDraft ?? false}
      replyActionError={null}
      notesOpen={false}
      replyHistoryOpen={false}
      olderMessagesOpen={false}
      notesComposerRef={createRef<HTMLTextAreaElement>()}
      notesSectionRef={createRef<HTMLDivElement>()}
      replyHistorySectionRef={createRef<HTMLDivElement>()}
      olderMessagesSectionRef={createRef<HTMLDivElement>()}
      onNotesOpenChange={vi.fn()}
      onReplyHistoryOpenChange={vi.fn()}
      onOlderMessagesOpenChange={vi.fn()}
      onCopyReply={vi.fn()}
      onCreateOutlookDraft={vi.fn()}
      onCopyReplyAndOpenOutlook={vi.fn()}
      onCopyCaseForReview={vi.fn()}
      onCopyRawCaseJson={vi.fn()}
      onRegenerateReply={vi.fn()}
      onAddInternalNote={vi.fn()}
      canOpenOutlook={options.canOpenOutlook ?? false}
    />,
  );
}

describe("ThreadConversationView source disclosure", () => {
  it("labels fallback analysis and drafts as rules-based", () => {
    const markup = renderConversation(buildProcessedEmail());

    expect(markup).toContain("Analysis: Rules-Based");
    expect(markup).toContain("Draft: Rules-Based");
    expect(markup).toContain("Triage Summary");
    expect(markup).toContain("Do this next");
    expect(markup).toContain("Outlook Link Missing");
    expect(markup).not.toContain("AI Summary");
  });

  it("labels existing AI-backed source data as AI assisted", () => {
    const item = buildProcessedEmail(
      buildResult({
        analysisSource: "ai",
      }),
    );
    const markup = renderConversation(item);

    expect(markup).toContain("Analysis: AI Assisted");
    expect(markup).toContain("Draft: AI Assisted");
    expect(markup).not.toContain("AI Generated");
  });

  it("shows assistive AI classification with confidence separately from rules output", () => {
    const item = buildProcessedEmail(
      buildResult({
        analysisSource: "hybrid",
        aiClassification: {
          category: "order/shipment issue",
          actionable: true,
          urgency: "medium",
          summary: "Customer is asking for current shipment status.",
          confidence: 0.86,
          aiSource: "ollama",
        },
      }),
    );
    const markup = renderConversation(item);

    expect(markup).toContain("Analysis: AI Assisted");
    expect(markup).toContain("Draft: Rules-Based");
    expect(markup).toContain("AI Assisted");
    expect(markup).toContain("order/shipment issue | 86% confidence");
    expect(markup).toContain("Assistive only. Action Desk rules remain authoritative.");
  });

  it("shows the combined copy and open action when an exact Outlook link is available", () => {
    const markup = renderConversation(buildProcessedEmail(), {
      canOpenOutlook: true,
    });

    expect(markup).toContain("Copy Reply");
    expect(markup).toContain("Copy &amp; Open Outlook");
  });

  it("shows Outlook draft creation only when Graph draft identity is available", () => {
    const item = buildProcessedEmail();

    expect(renderConversation(item)).not.toContain("Create Outlook Draft");

    const markup = renderConversation(item, {
      canCreateOutlookDraft: true,
    });

    expect(markup).toContain("Create Outlook Draft");
  });

  it("renders the same live reply draft text used for Outlook draft creation", () => {
    const liveReplyDraft =
      "Hi Casey,\n\nThis is the live Action Desk generated reply.\nLine two stays on its own line.\n\nBest,\nSupport Team";
    const item = buildProcessedEmail(buildResult({ replyDraft: liveReplyDraft }));
    const markup = renderConversation(item, {
      canCreateOutlookDraft: true,
    });

    expect(markup).toContain(liveReplyDraft);
    expect(getOutlookReplyDraftText(item)).toBe(liveReplyDraft);
    expect(getOutlookReplyDraftText(item)).not.toContain("Reply draft");
  });
});
