import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GroupedRepQueue } from "./GroupedRepQueue";
import type { RepGroupedQueueSection } from "../services/workflowSelectors";

const baseThread = {
  groupKey: "sender:test@example.com",
  title: "Acme Logistics",
  subtitle: "orders@acme.com",
  latestReceivedAt: "2026-04-21T10:00:00.000Z",
  oldestReceivedAt: "2026-04-21T08:00:00.000Z",
  latestActivityAt: "2026-04-21T10:00:00.000Z",
  itemCount: 1,
  assignmentHistory: [],
  status: "new" as const,
  notes: [],
  replyLog: [],
  isSnoozed: false,
  noteCount: 0,
  replyCount: 0,
  activePresenceRecords: [],
  slaMinutes: 120,
  sla: {
    firstResponse: {
      target: "first_response" as const,
      state: "breached" as const,
      elapsedMinutes: 120,
      targetMinutes: 60,
      warningStartsAtMinutes: 45,
      dueAt: "2026-04-21T09:00:00.000Z",
    },
    resolution: {
      target: "resolution" as const,
      state: "on_track" as const,
      elapsedMinutes: 120,
      targetMinutes: 1440,
      warningStartsAtMinutes: 1080,
      dueAt: "2026-04-22T08:00:00.000Z",
    },
    current: {
      target: "first_response" as const,
      state: "breached" as const,
      elapsedMinutes: 120,
      targetMinutes: 60,
      warningStartsAtMinutes: 45,
      dueAt: "2026-04-21T09:00:00.000Z",
    },
  },
};

const sections: RepGroupedQueueSection[] = [
  {
    groupId: "rep-1",
    repId: "rep-1",
    repName: "Mia Johnson",
    openThreadCount: 1,
    waitingOnCustomerCount: 0,
    overSlaCount: 0,
    oldestOpenMinutes: 120,
    threads: [
     {
  ...baseThread,
  id: "thread-1",
  representativeItem: {
    email: {
      id: "email-1",
      senderName: "Acme Logistics",
      senderEmail: "orders@acme.com",
      subject: "Need update",
      receivedAt: "2026-04-21T10:00:00.000Z",
      body: "Where is my order?",
    },
    status: "processed" as const,
    result: {
      analysis: {
        summary: "Summary",
        intent: "where_is_my_order" as const,
        urgency: "medium" as const,
        confidence: "medium" as const,
        risks: [],
        nextAction: "Check status",
      },
      analysisSource: "fallback" as const,
      replyDraft: "Reply",
      priorityScore: 50,
    },
    issueCount: 0,
    previewText: "Where is my order?",
  },
  items: [
    {
      email: {
        id: "email-1",
        senderName: "Acme Logistics",
        senderEmail: "orders@acme.com",
        subject: "Need update",
        receivedAt: "2026-04-21T10:00:00.000Z",
        body: "Where is my order?",
      },
      status: "processed" as const,
      result: {
        analysis: {
          summary: "Summary",
          intent: "where_is_my_order" as const,
          urgency: "medium" as const,
          confidence: "medium" as const,
          risks: [],
          nextAction: "Check status",
        },
        analysisSource: "fallback" as const,
        replyDraft: "Reply",
        priorityScore: 50,
      },
      issueCount: 0,
      previewText: "Where is my order?",
    },
  ],
}, 
    ],
  },
];

describe("GroupedRepQueue", () => {
  it("renders rep sections and preserves selected card state", () => {
    const markup = renderToStaticMarkup(
      createElement(GroupedRepQueue, {
        sections,
        now: new Date("2026-04-21T12:00:00.000Z"),
        selectedEmailId: "email-1",
        onSelectEmail: vi.fn(),
        onTakeThread: vi.fn(),
        onRetryEmail: vi.fn(),
      }),
    );

    expect(markup).toContain("Mia Johnson");
    expect(markup).toContain("1 open");
    expect(markup).toContain("Waiting");
    expect(markup).toContain("Over SLA");
    expect(markup).toContain("Oldest Open");
    expect(markup).toContain("Need update");
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-pressed="true"');
  });
});
