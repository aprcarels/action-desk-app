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
    hasClearRequest: true,
    isThreadContinuation: false,
    workType: "customer_support",
    ...overrides,
  };
}

function countSentences(text: string): number {
  return (text.match(/[.!?](?=\s|$)/g) ?? []).length;
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

  it("builds a grounded order-status reply when order context exists", () => {
    const order: OrderContext = {
      orderNumber: "ORD-1002",
      status: "Processing",
      shipmentStatus: "In Transit",
      lastUpdated: "2026-04-01T08:00:00.000Z",
    };

    const draft = generateReply(buildAnalysis(), order);

    expect(draft).toContain("Hi,");
    expect(draft).toContain("Order ORD-1002 is currently Processing, and the shipment is In Transit as of Apr 1, 2026.");
    expect(draft).toContain("I will keep an eye on the next carrier update");
    expect(draft).toContain("Best,\nSupport Team");
    expect(countSentences(draft)).toBeLessThanOrEqual(4);
  });

  it("does not hallucinate shipment details when order context is missing", () => {
    const draft = generateReply(
      buildAnalysis({
        orderNumber: "ORD-1002",
      }),
    );

    expect(draft).toContain("I have order ORD-1002, but I cannot confirm the current shipment status from the available record yet.");
    expect(draft).toContain("tracking number or ship confirmation");
    expect(draft).not.toContain("In Transit");
    expect(draft).not.toContain("Delivered");
    expect(draft).not.toContain("Label Created");
  });

  it("handles delivered-not-received with a specific next step", () => {
    const order: OrderContext = {
      orderNumber: "ORD-1002",
      status: "Completed",
      shipmentStatus: "Delivered",
      lastUpdated: "2026-04-03T09:30:00.000Z",
    };

    const draft = generateReply(
      buildAnalysis({
        risks: ["delivered_not_received"],
      }),
      order,
    );

    expect(draft).toContain("Order ORD-1002 shows as Delivered as of Apr 3, 2026.");
    expect(draft).toContain("checked the delivery area");
    expect(draft).toContain("delivery scan and carrier next steps");
  });

  it("asks for the order number when the customer did not provide one", () => {
    const draft = generateReply(
      buildAnalysis({
        orderNumber: undefined,
        caseIdentifiers: [],
      }),
    );

    expect(draft).toContain("I need the order number or tracking number before I can confirm the shipment status.");
    expect(draft).not.toContain("undefined");
  });

  it("builds a damaged-shipment reply without inventing a claim", () => {
    const draft = generateReply(
      buildAnalysis({
        intent: "damaged_shipment",
        orderNumber: undefined,
        caseIdentifiers: [{ value: "ORD-2001", kind: "order", source: "subject" }],
        risks: ["damage_reported"],
      }),
    );

    expect(draft).toContain("I am sorry the shipment arrived damaged.");
    expect(draft).toContain("review it for order ORD-2001");
    expect(draft).toContain("photo of the damage");
    expect(draft).not.toContain("claim has been started");
  });

  it("builds a cancellation reply from known order status", () => {
    const order: OrderContext = {
      orderNumber: "ORD-3001",
      status: "Processing",
      shipmentStatus: "Label Created",
      lastUpdated: "2026-04-02T10:00:00.000Z",
    };

    const draft = generateReply(
      buildAnalysis({
        intent: "cancellation_request",
        orderNumber: "ORD-3001",
      }),
      order,
    );

    expect(draft).toContain("Order ORD-3001 is currently Processing, and the shipment is Label Created as of Apr 2, 2026.");
    expect(draft).toContain("cancellation may still be possible");
    expect(draft).not.toContain("has been canceled");
  });

  it("builds a concise general fallback with a clarifying next step", () => {
    const draft = generateReply(
      buildAnalysis({
        intent: "general_support",
        orderNumber: undefined,
        caseIdentifiers: undefined,
        risks: [],
      }),
    );

    expect(draft).toContain("I can help with that.");
    expect(draft).toContain("Please send the order number or the main detail you want checked");
    expect(countSentences(draft)).toBeLessThanOrEqual(3);
  });

  it("keeps replies concise and avoids generic corporate filler", () => {
    const order: OrderContext = {
      orderNumber: "ORD-1002",
      status: "Processing",
      shipmentStatus: "In Transit",
      lastUpdated: "2026-04-01T08:00:00.000Z",
    };

    const draft = generateReply(buildAnalysis(), order);

    expect(countSentences(draft)).toBeGreaterThanOrEqual(2);
    expect(countSentences(draft)).toBeLessThanOrEqual(4);
    expect(draft).not.toContain("Thank you for reaching out regarding your inquiry");
    expect(draft).not.toContain("We apologize for any inconvenience this may have caused");
  });
});
