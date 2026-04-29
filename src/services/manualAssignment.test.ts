import { describe, expect, it } from "vitest";
import {
  canCurrentUserTakeThread,
  getDefaultTakeThreadReason,
} from "./manualAssignment";
import { getDefaultWorkflowState, takeThreadAssignment } from "./workflowState";
import { buildWorkflowThreads } from "./workflowSelectors";
import type { ProcessedEmail } from "../types/actionDesk";

function buildProcessedEmail(overrides?: Partial<ProcessedEmail>): ProcessedEmail {
  return {
    email: {
      id: "email-1",
      senderName: "Acme Logistics",
      senderEmail: "orders@acme.com",
      subject: "Need update",
      receivedAt: "2026-04-21T08:00:00.000Z",
      body: "Where is my order?",
    },
    status: "processed",
    result: {
      analysis: {
        summary: "Summary",
        intent: "where_is_my_order",
        urgency: "medium",
        confidence: "medium",
        risks: [],
        nextAction: "Check status",
      },
      analysisSource: "fallback",
      replyDraft: "Reply",
      priorityScore: 60,
    },
    issueCount: 0,
    previewText: "Where is my order?",
    ...overrides,
  };
}

describe("manualAssignment", () => {
  const baseState = getDefaultWorkflowState();
  const rep = baseState.reps[0];
  const otherRep = baseState.reps[1];

  function buildThread(state = baseState) {
    return buildWorkflowThreads({
      items: [buildProcessedEmail()],
      workflowState: state,
      customers: [],
      now: new Date("2026-04-21T12:00:00.000Z"),
    })[0]!;
  }

  it("shows Take This for an unassigned thread", () => {
    const thread = buildThread();

    expect(canCurrentUserTakeThread(thread, rep)).toBe(true);
    expect(getDefaultTakeThreadReason(thread)).toBe("Unassigned");
  });

  it("shows Take This for a thread assigned to another rep", () => {
    const state = takeThreadAssignment(
      baseState,
      "sender:orders@acme.com",
      otherRep,
      "Overflow",
      otherRep.id,
    );
    const thread = buildThread(state);

    expect(canCurrentUserTakeThread(thread, rep)).toBe(true);
    expect(getDefaultTakeThreadReason(thread)).toBe("Covering for colleague");
  });

  it("hides Take This for the current user's own thread", () => {
    const state = takeThreadAssignment(
      baseState,
      "sender:orders@acme.com",
      rep,
      "Overflow",
      rep.id,
    );
    const thread = buildThread(state);

    expect(canCurrentUserTakeThread(thread, rep)).toBe(false);
  });
});
