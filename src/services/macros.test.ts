import { describe, expect, it } from "vitest";
import { applyBuiltInMacro, getBuiltInMacros } from "./macros";
import { getPresenceConflictWarning } from "./threadPresence";
import {
  getDefaultWorkflowState,
  recordThreadPresence,
  setThreadWorkflowStatus,
} from "./workflowState";
import type { EmailAnalysis, ProcessedEmail } from "../types/actionDesk";

function buildAnalysis(overrides?: Partial<EmailAnalysis>): EmailAnalysis {
  return {
    summary: "Customer needs help with an order.",
    intent: "where_is_my_order",
    urgency: "medium",
    confidence: "medium",
    orderNumber: "ORD-1002",
    risks: [],
    nextAction: "Review the shipment.",
    messageType: "customer_request",
    actionability: "action_required",
    replyNeeded: "yes",
    hasClearRequest: true,
    isThreadContinuation: false,
    workType: "customer_support",
    ...overrides,
  };
}

function buildProcessedEmail(overrides?: Partial<ProcessedEmail>): ProcessedEmail {
  return {
    email: {
      id: "email-1",
      senderName: "Acme Logistics",
      senderEmail: "orders@acme.com",
      subject: "Order help",
      receivedAt: "2026-04-21T08:00:00.000Z",
      body: "Can you help?",
    },
    status: "processed",
    result: {
      analysis: buildAnalysis(),
      analysisSource: "fallback",
      orderContext: {
        orderNumber: "ORD-1002",
        status: "Completed",
        shipmentStatus: "Delivered",
        lastUpdated: "2026-04-03T09:30:00.000Z",
      },
      replyDraft: "Original draft",
      priorityScore: 70,
    },
    issueCount: 1,
    previewText: "Can you help?",
    ...overrides,
  };
}

describe("macros", () => {
  it("exposes the built-in CSR macro list", () => {
    expect(getBuiltInMacros().map((macro) => macro.id)).toEqual([
      "request_order_number",
      "mark_waiting_on_customer",
      "delivered_not_received",
      "send_pod_guidance",
      "acknowledge_delay",
      "cancellation_needs_review",
      "address_change_review",
      "billing_follow_up",
      "close_as_resolved",
    ]);
  });

  it("request-order-number updates the reply and waits on the customer", () => {
    const result = applyBuiltInMacro(
      buildProcessedEmail({
        result: {
          ...buildProcessedEmail().result!,
          analysis: buildAnalysis({
            orderNumber: undefined,
            caseIdentifiers: undefined,
          }),
          orderContext: undefined,
        },
      }),
      "request_order_number",
    );

    expect(result?.status).toBe("waiting_on_customer");
    expect(result?.replyDraft).toContain(
      "I need the order number or tracking number",
    );
    expect(result?.replyDraft).not.toContain("undefined");
  });

  it("delivered-not-received updates the reply and waits on the customer", () => {
    const result = applyBuiltInMacro(
      buildProcessedEmail(),
      "delivered_not_received",
    );

    expect(result?.status).toBe("waiting_on_customer");
    expect(result?.replyDraft).toContain("shows as Delivered");
    expect(result?.replyDraft).toContain("delivery scan and carrier next steps");
  });

  it("close-as-resolved changes status without inventing reply content", () => {
    const result = applyBuiltInMacro(buildProcessedEmail(), "close_as_resolved");

    expect(result?.status).toBe("resolved");
    expect(result?.replyDraft).toBeUndefined();
  });

  it("macro replies stay grounded when order context is missing", () => {
    const result = applyBuiltInMacro(
      buildProcessedEmail({
        result: {
          ...buildProcessedEmail().result!,
          orderContext: undefined,
        },
      }),
      "delivered_not_received",
    );

    expect(result?.replyDraft).toContain("cannot confirm the current shipment status");
    expect(result?.replyDraft).not.toContain("Delivered as of");
    expect(result?.replyDraft).not.toContain("In Transit");
  });

  it("macro status effects preserve normal workflow update metadata", () => {
    const state = getDefaultWorkflowState();
    const rep = state.reps[0];
    const result = applyBuiltInMacro(buildProcessedEmail(), "close_as_resolved");
    const nextState = setThreadWorkflowStatus(
      state,
      "thread-1",
      result!.status!,
      rep,
    );

    expect(nextState.threadStates["thread-1"]).toMatchObject({
      status: "resolved",
      updatedByRepId: rep.id,
      updatedByRepName: rep.name,
    });
  });

  it("macro usage can surface the existing soft-collision warning", () => {
    const state = getDefaultWorkflowState();
    const workingState = recordThreadPresence(
      state,
      "thread-1",
      state.reps[1],
      "working",
      "2026-04-21T12:00:00.000Z",
    );

    expect(
      getPresenceConflictWarning(workingState.threadPresence["thread-1"]?.[0]),
    ).toBe(
      "Alex Rivera is currently working this thread. Please coordinate before making changes.",
    );
  });
});
