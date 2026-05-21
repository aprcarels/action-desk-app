import { describe, expect, it } from "vitest";
import {
  canRequestAiReplyDraft,
  normalizeAiReplyDraft,
  type AiDraftReplyRequest,
} from "./aiReplyDraft";
import type { EmailAnalysis } from "../types/actionDesk";

function buildAnalysis(overrides: Partial<EmailAnalysis> = {}): EmailAnalysis {
  return {
    summary: "Customer is asking for shipment status.",
    intent: "where_is_my_order",
    urgency: "medium",
    confidence: "medium",
    risks: [],
    nextAction: "Review the latest confirmed shipment context and reply with the next step.",
    actionability: "action_required",
    replyNeeded: "yes",
    workType: "customer_support",
    messageType: "customer_request",
    ...overrides,
  };
}

function buildRequest(
  overrides: Partial<AiDraftReplyRequest> = {},
): AiDraftReplyRequest {
  return {
    subject: "Shipment status for ORD-1002",
    from: "customer@example.com",
    body: "Can you send the current shipment status for order ORD-1002?",
    analysis: buildAnalysis({
      orderNumber: "ORD-1002",
    }),
    orderContext: {
      orderNumber: "ORD-1002",
      status: "Processing",
      shipmentStatus: "In Transit",
      lastUpdated: "2026-04-01T08:00:00.000Z",
    },
    recommendedNextAction:
      "Review the latest confirmed shipment context and reply with the next step.",
    ...overrides,
  };
}

describe("AI reply draft guardrails", () => {
  it("allows replyNeeded recommended for customer-support work", () => {
    expect(
      canRequestAiReplyDraft(
        buildAnalysis({
          replyNeeded: "recommended",
          actionability: "review_needed",
        }),
        "Hi,\n\nI can help review this request.\n\nBest,\nSupport Team",
      ),
    ).toBe(true);
  });

  it("keeps vendor and no-action work ineligible", () => {
    expect(
      canRequestAiReplyDraft(
        buildAnalysis({
          workType: "vendor",
          actionability: "no_action_needed",
          replyNeeded: "no",
          messageType: "awareness_only",
        }),
        "Hi,\n\nThanks.\n\nBest,\nSupport Team",
      ),
    ).toBe(false);
  });

  it("allows confirmed shipment status from order context", () => {
    const draft = normalizeAiReplyDraft(
      {
        aiSource: "ollama",
        replyDraft:
          "Hi,\n\nOrder ORD-1002 is In Transit based on the confirmed order context. I will review the next update and follow up once confirmed.\n\nBest,\nSupport Team",
      },
      buildRequest(),
    );

    expect(draft?.replyDraft).toContain("In Transit");
  });

  it("rejects invented delivery timing and tracking facts", () => {
    const draft = normalizeAiReplyDraft(
      {
        aiSource: "ollama",
        replyDraft:
          "Hi,\n\nYour order will arrive by Friday with tracking number 1Z9999999999999999.\n\nBest,\nSupport Team",
      },
      buildRequest({
        body: "Where is my order?",
        analysis: buildAnalysis(),
        orderContext: undefined,
      }),
    );

    expect(draft).toBeNull();
  });
});
