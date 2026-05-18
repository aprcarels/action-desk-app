import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ContextPanel } from "./ContextPanel";
import type {
  AssignmentResolution,
  ProcessedEmail,
  RepProfile,
  WorkflowThread,
} from "../types/actionDesk";

const reps: RepProfile[] = [
  {
    id: "rep-1",
    name: "Mia Johnson",
    initials: "MJ",
    email: "mia@example.com",
    role: "rep",
  },
];

function buildProcessedEmail(): ProcessedEmail {
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
    result: {
      analysis: {
        summary: "Customer needs an order update.",
        intent: "where_is_my_order",
        urgency: "medium",
        confidence: "medium",
        risks: [],
        nextAction: "Check shipment status.",
      },
      analysisSource: "fallback",
      replyDraft: "Reply",
      priorityScore: 50,
    },
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
        state: "at_risk",
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
        state: "at_risk",
        elapsedMinutes: 45,
        targetMinutes: 60,
        warningStartsAtMinutes: 45,
        dueAt: "2026-04-21T12:15:00.000Z",
      },
    },
  };
}

describe("ContextPanel SLA display", () => {
  it("renders detailed first response and resolution SLA timing", () => {
    const item = buildProcessedEmail();
    const markup = renderToStaticMarkup(
      <ContextPanel
        item={item}
        thread={buildThread(item)}
        reps={reps}
        currentRep={reps[0]}
        pilotMode={false}
        canTakeThread={true}
        takeThreadReason="Unassigned"
        onTakeThreadReasonChange={vi.fn()}
        onTakeThread={vi.fn()}
        onRecomputePriority={vi.fn()}
        onMarkPilotItemActive={vi.fn()}
        onMarkPilotItemDone={vi.fn()}
        onMarkPilotItemNotRelevant={vi.fn()}
        onMarkPilotItemWaitingOnCustomer={vi.fn()}
        onSnoozePilotItemUntilTomorrow={vi.fn()}
        onSetPilotUsefulness={vi.fn()}
      />,
    );

    expect(markup).toContain("SLA");
    expect(markup).toContain("First Response SLA: At Risk");
    expect(markup).toContain("First Response SLA");
    expect(markup).toContain("elapsed 45m / target 1h");
    expect(markup).toContain("Resolution SLA");
    expect(markup).toContain("elapsed 45m / target 1d");
    expect(markup).toContain("Warning Starts");
    expect(markup).toContain("Triage Signals");
    expect(markup).toContain("Rules-Based");
    expect(markup).toContain("Why prioritized");
    expect(markup).toContain("First reply SLA at risk.");
  });

  it("shows thread as the matched customer source", () => {
    const item = {
      ...buildProcessedEmail(),
      customerMatch: {
        customerId: "customer-1",
        customerName: "Meliibaby",
        matchedOn: "thread" as const,
        matchedValue: "Meliibaby needs POD",
      },
    };
    const thread = {
      ...buildThread(item),
      title: "Meliibaby",
      customerName: "Meliibaby",
    };
    const markup = renderToStaticMarkup(
      <ContextPanel
        item={item}
        thread={thread}
        reps={reps}
        currentRep={reps[0]}
        pilotMode={false}
        canTakeThread={true}
        takeThreadReason="Unassigned"
        onTakeThreadReasonChange={vi.fn()}
        onTakeThread={vi.fn()}
        onRecomputePriority={vi.fn()}
        onMarkPilotItemActive={vi.fn()}
        onMarkPilotItemDone={vi.fn()}
        onMarkPilotItemNotRelevant={vi.fn()}
        onMarkPilotItemWaitingOnCustomer={vi.fn()}
        onSnoozePilotItemUntilTomorrow={vi.fn()}
        onSetPilotUsefulness={vi.fn()}
      />,
    );

    expect(markup).toContain("Meliibaby");
    expect(markup).toContain("Thread");
  });
});
