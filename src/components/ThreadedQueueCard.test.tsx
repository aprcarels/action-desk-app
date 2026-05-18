import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ThreadedQueueCard } from "./ThreadedQueueCard";
import type {
  AssignmentResolution,
  ProcessedEmail,
  WorkflowThread,
} from "../types/actionDesk";

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

function buildThread(item = buildProcessedEmail()): WorkflowThread {
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

describe("ThreadedQueueCard SLA display", () => {
  it("renders compact SLA state and waiting time on the queue card", () => {
    const markup = renderToStaticMarkup(
      <ThreadedQueueCard
        thread={buildThread()}
        now={new Date("2026-04-21T12:00:00.000Z")}
        isSelected={false}
        onSelect={vi.fn()}
        onTakeThread={vi.fn()}
        onRetryEmail={vi.fn()}
      />,
    );

    expect(markup).toContain("SLA: At Risk");
    expect(markup).toContain("Waiting 45m");
    expect(markup).toContain("First Reply SLA: At Risk");
    expect(markup).toContain("Rules-Based");
    expect(markup).toContain("Why prioritized: First reply SLA at risk.");
  });

  it("renders primary customer owner with an additional CSR count", () => {
    const markup = renderToStaticMarkup(
      <ThreadedQueueCard
        thread={{
          ...buildThread(),
          assignedRepId: "rep-1",
          assignedRepName: "Mia Johnson",
          assignedRepInitials: "MJ",
          assignmentType: "auto",
          customerAssignedRepIds: ["rep-1", "rep-2"],
          customerAssignedRepNames: ["Mia Johnson", "Alex Rivera"],
          customerAssignedRepInitials: ["MJ", "AR"],
          assignmentResolution: {
            assignmentStatus: "assigned",
            assignmentSource: "customer_email",
            primaryRepId: "rep-1",
            primaryRepName: "Mia Johnson",
            assignedRepIds: ["rep-1", "rep-2"],
            assignedRepNames: ["Mia Johnson", "Alex Rivera"],
            customerId: "customer-1",
            customerName: "Acme Logistics",
            matchType: "email",
          },
        }}
        now={new Date("2026-04-21T12:00:00.000Z")}
        isSelected={false}
        onSelect={vi.fn()}
        onTakeThread={vi.fn()}
        onRetryEmail={vi.fn()}
      />,
    );

    expect(markup).toContain("Assigned to");
    expect(markup).toContain("Mia Johnson +1");
    expect(markup).toContain("Assigned CSRs: Mia Johnson, Alex Rivera");
    expect(markup).not.toContain("Unassigned");
  });

  it("renders missing-body system reports without failed or retry treatment", () => {
    const item: ProcessedEmail = {
      ...buildProcessedEmail(),
      email: {
        ...buildProcessedEmail().email,
        senderName: "AP Express Systems",
        senderEmail: "systems@apexpress.com",
        subject: "OutboundYesterdayTracking_Summary",
        body: "",
        previewText: "",
      },
      status: "failed",
      result: undefined,
      processingError: "This email could not be analyzed because the body is missing.",
      previewText: "",
    };
    const markup = renderToStaticMarkup(
      <ThreadedQueueCard
        thread={buildThread(item)}
        now={new Date("2026-04-21T12:00:00.000Z")}
        isSelected={false}
        onSelect={vi.fn()}
        onTakeThread={vi.fn()}
        onRetryEmail={vi.fn()}
      />,
    );

    expect(markup).toContain("System report");
    expect(markup).not.toContain("Failed");
    expect(markup).not.toContain("Retry");
  });
});
