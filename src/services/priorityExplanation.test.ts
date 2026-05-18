import { describe, expect, it } from "vitest";
import {
  getPriorityExplanationReasons,
  getPriorityExplanationSummary,
} from "./priorityExplanation";
import type { ProcessedEmail, WorkflowThread } from "../types/actionDesk";

function buildProcessedEmail(overrides: Partial<ProcessedEmail> = {}): ProcessedEmail {
  const base: ProcessedEmail = {
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

  return { ...base, ...overrides };
}

const atRiskThread: Pick<WorkflowThread, "sla"> = {
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

describe("priorityExplanation", () => {
  it("explains SLA risk and positive priority breakdown drivers", () => {
    const item = buildProcessedEmail({
      result: {
        analysis: {
          summary: "Customer needs a fast order update.",
          intent: "where_is_my_order",
          urgency: "high",
          confidence: "high",
          risks: ["customer_frustration"],
          nextAction: "Check shipment status.",
        },
        analysisSource: "ai",
        replyDraft: "Reply",
        priorityScore: 80,
        priorityBreakdown: [
          { label: "Customer reply needed", points: 10 },
          { label: "High urgency", points: 40 },
          { label: "Awareness only", points: -10 },
          { label: "Risk: customer_frustration", points: 10 },
        ],
      },
    });

    expect(
      getPriorityExplanationReasons({
        item,
        thread: atRiskThread,
        maxReasons: 4,
      }),
    ).toEqual([
      "First reply SLA at risk.",
      "High urgency.",
      "Customer reply needed.",
      "Customer sounds frustrated and may need a prompt, clear response.",
    ]);
  });

  it("falls back to existing analysis signals when breakdown data is missing", () => {
    const item = buildProcessedEmail({
      result: {
        analysis: {
          summary: "Customer followed up on a delayed shipment.",
          intent: "where_is_my_order",
          urgency: "high",
          confidence: "high",
          risks: ["delay_or_no_tracking_update"],
          nextAction: "Check shipment status.",
          isThreadContinuation: true,
          hasClearRequest: true,
          replyNeeded: "yes",
        },
        analysisSource: "ai",
        replyDraft: "Reply",
        priorityScore: 75,
      },
    });

    const summary = getPriorityExplanationSummary({ item });

    expect(summary).toContain("Thread follow-up with a clear current request.");
    expect(summary).toContain("High urgency.");
    expect(summary).toContain("Customer reply needed.");
    expect(summary).toContain("Delay or no recent tracking update.");
  });

  it("returns no reasons when priority and analysis details are unavailable", () => {
    const item = buildProcessedEmail({
      status: "pending",
      result: undefined,
    });

    expect(getPriorityExplanationReasons({ item })).toEqual([]);
  });
});
