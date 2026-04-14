import { describe, expect, it } from "vitest";
import { generateReply } from "./generateReply";
import type { EmailAnalysis, OrderContext } from "../types/actionDesk";

function buildAnalysis(overrides?: Partial<EmailAnalysis>): EmailAnalysis {
  return {
    summary: "Customer is requesting a status update for order ORD-1002.",
    intent: "where_is_my_order",
    urgency: "medium",
    confidence: "medium",
    orderNumber: "ORD-1002",
    risks: [],
    nextAction: "Verify the latest shipment status.",
    messageType: "customer_request",
    actionability: "action_required",
    replyNeeded: "yes",
    ...overrides,
  };
}

describe("generateReply", () => {
  it("suppresses reply drafts for awareness-only emails", () => {
    const draft = generateReply(
      buildAnalysis({
        intent: "general_support",
        messageType: "awareness_only",
        actionability: "awareness_only",
        replyNeeded: "no",
      }),
    );

    expect(draft).toBe("");
  });

  it("suppresses reply drafts for non-customer-service work types", () => {
    const draft = generateReply(
      buildAnalysis({
        intent: "general_support",
        workType: "vendor",
        actionability: "no_action_needed",
        replyNeeded: "no",
      }),
    );

    expect(draft).toBe("");
  });

  it("suppresses reply drafts for short continuation replies without a clear ask", () => {
    const draft = generateReply(
      buildAnalysis({
        summary: "Short thread continuation with limited standalone context.",
        actionability: "review_needed",
        replyNeeded: "maybe",
        workType: "customer_support",
        hasClearRequest: false,
        isThreadContinuation: true,
      }),
    );

    expect(draft).toBe("");
  });

  it("produces a usable draft for a clear cancellation request without order identifiers", () => {
    const draft = generateReply(
      buildAnalysis({
        summary: "Customer wants to cancel an order and is asking for confirmation.",
        intent: "cancellation_request",
        orderNumber: undefined,
        workType: "customer_support",
        actionability: "action_required",
        replyNeeded: "yes",
        hasClearRequest: true,
        isThreadContinuation: false,
      }),
    );

    expect(draft).toContain("reviewing the cancellation request");
    expect(draft).not.toContain("undefined");
  });

  it("still produces a reply draft for actionable customer emails", () => {
    const order: OrderContext = {
      orderNumber: "ORD-1002",
      status: "Processing",
      shipmentStatus: "In Transit",
      lastUpdated: "2026-04-01T08:00:00.000Z",
    };

    const draft = generateReply(
      buildAnalysis({
        hasClearRequest: true,
        workType: "customer_support",
      }),
      order,
    );

    expect(draft).toContain("I checked on order ORD-1002.");
  });

  it("does not ask for an order number again when subject identifiers are already present", () => {
    const draft = generateReply(
      buildAnalysis({
        summary: "Customer is requesting a status update for orders 162702 and 162740.",
        orderNumber: "162702",
        caseIdentifiers: [
          { value: "162702", kind: "order", source: "subject" },
          { value: "162740", kind: "order", source: "subject" },
        ],
        nextAction: "Verify the latest shipment status for orders 162702 and 162740.",
        hasClearRequest: true,
        workType: "customer_support",
      }),
    );

    expect(draft).toContain("checking the latest status tied to orders 162702 and 162740");
    expect(draft).not.toContain("Please send over your order number");
  });

  it("uses neutral wording for non-order identifiers and blocks order undefined", () => {
    const draft = generateReply(
      buildAnalysis({
        summary: "Customer is requesting a status update for transfer 1001-009313.",
        orderNumber: undefined,
        caseIdentifiers: [
          { value: "1001-009313", kind: "transfer", source: "subject" },
        ],
        nextAction: "Review the referenced transfer/rework details.",
        hasClearRequest: true,
        workType: "customer_support",
      }),
    );

    expect(draft).toContain("reviewing the referenced transfer/rework details");
    expect(draft).not.toContain("undefined");
    expect(draft).not.toContain("Please send over your order number");
  });

  it("still asks for identifiers when none are present", () => {
    const draft = generateReply(
      buildAnalysis({
        summary: "Customer is asking for an order update but did not provide a usable identifier.",
        orderNumber: undefined,
        caseIdentifiers: [],
        hasClearRequest: true,
        workType: "customer_support",
      }),
    );

    expect(draft).toContain("Please send over your order number");
  });

  it("acknowledges operational confirmation requests without inventing shipment status", () => {
    const draft = generateReply(
      buildAnalysis({
        summary: "Customer provided inbound or logistics details and requested confirmation of receipt or follow-up once the event occurs.",
        intent: "operational_confirmation",
        orderNumber: undefined,
        hasClearRequest: true,
        workType: "customer_support",
        hasConfirmationRequest: true,
        hasLogisticsContext: true,
        hasOperationalTimingSignal: true,
        nextAction: "Acknowledge receipt and confirm back once the container or delivery event occurs.",
      }),
    );

    expect(draft).toContain("received the inbound logistics details");
    expect(draft).toContain("confirm back once the container or delivery event is completed");
    expect(draft).not.toContain("delivered");
    expect(draft).not.toContain("in transit");
  });
});
