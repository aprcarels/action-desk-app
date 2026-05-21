import { describe, expect, it } from "vitest";
import { generateRecommendedAction } from "./generateRecommendedAction";
import type { EmailAnalysis, OrderContext } from "../types/actionDesk";

type ActionInput = Parameters<typeof generateRecommendedAction>[0];

function buildInput(overrides: Partial<ActionInput> = {}): ActionInput {
  return {
    intent: "where_is_my_order",
    urgency: "medium",
    risks: [],
    orderNumber: "ORD-1001",
    actionability: "action_required",
    replyNeeded: "yes",
    workType: "customer_support",
    ...overrides,
  };
}

function buildOrderContext(overrides: Partial<OrderContext> = {}): OrderContext {
  return {
    orderNumber: "ORD-1001",
    status: "Shipped",
    shipmentStatus: "In Transit",
    lastUpdated: "2026-04-21T12:00:00.000Z",
    ...overrides,
  };
}

describe("generateRecommendedAction", () => {
  it("asks for a missing shipment identifier and tells the rep to wait on the customer", () => {
    const action = generateRecommendedAction(
      buildInput({
        orderNumber: undefined,
        caseIdentifiers: undefined,
      }),
    );

    expect(action).toContain("Request the order number or usable reference");
    expect(action).toContain("mark waiting on customer");
  });

  it("uses warehouse and carrier scan guidance for delayed shipments", () => {
    const action = generateRecommendedAction(
      buildInput({
        orderContext: buildOrderContext({
          status: "Delayed",
          shipmentStatus: "Exception",
        }),
      }),
    );

    expect(action).toContain("Check carrier and warehouse scans");
    expect(action).toContain("escalate to warehouse");
    expect(action).toContain("send a delay update");
  });

  it("uses delivery proof and investigation language for delivered-not-received cases", () => {
    const action = generateRecommendedAction(
      buildInput({
        risks: ["delivered_not_received"],
        orderContext: buildOrderContext({
          status: "Delivered",
          shipmentStatus: "Delivered",
        }),
      }),
    );

    expect(action).toContain("Review delivery scan and carrier proof");
    expect(action).toContain("check for misdelivery");
    expect(action).toContain("investigation update");
  });

  it("gives address-change guidance distinct from status-update guidance", () => {
    const action = generateRecommendedAction(
      buildInput({
        intent: "address_change",
        orderContext: buildOrderContext({
          status: "Processing",
          shipmentStatus: "Label Created",
        }),
      }),
    );

    expect(action).toContain("Confirm the corrected address");
    expect(action).toContain("ship-to");
    expect(action).toContain("reply with the outcome");
  });

  it("tells reps to stop fulfillment for eligible cancellation requests", () => {
    const action = generateRecommendedAction(
      buildInput({
        intent: "cancellation_request",
        risks: ["cancellation_review_needed"],
        orderContext: buildOrderContext({
          status: "Processing",
          shipmentStatus: "Label Created",
        }),
      }),
    );

    expect(action).toContain("Check fulfillment status");
    expect(action).toContain("escalate to warehouse");
    expect(action).toContain("stop shipment");
  });

  it("gives billing/refund guidance when billing fields support it", () => {
    const action = generateRecommendedAction(
      buildInput({
        intent: "billing_question",
        risks: ["billing_discrepancy"],
      }),
    );

    expect(action).toContain("Verify invoice, refund, or charge details");
    expect(action).toContain("reply with the correction or explanation");
  });

  it("uses scheduling guidance for operational logistics emails even when no reply is recommended", () => {
    const action = generateRecommendedAction(
      buildInput({
        intent: "operational_logistics_scheduling",
        actionability: "review_needed",
        replyNeeded: "no",
        orderNumber: undefined,
        risks: [],
        hasLogisticsContext: true,
        hasOperationalTimingSignal: true,
      }),
    );

    expect(action).toBe(
      "Review pickup/scheduling details. Reply only if schedule conflict or missing pickup details.",
    );
    expect(action.toLowerCase()).not.toContain("invoice");
    expect(action.toLowerCase()).not.toContain("order number");
  });

  it("uses review guidance for missed pickup reports without generic reply instructions", () => {
    const action = generateRecommendedAction(
      buildInput({
        intent: "missed_pickups_report",
        actionability: "review_needed",
        replyNeeded: "no",
        orderNumber: undefined,
        risks: [],
        workType: "customer_support",
      }),
    );

    expect(action).toBe(
      "Review missed pickup list, confirm affected shipments/customers, and assign follow-up where needed.",
    );
    expect(action.toLowerCase()).not.toContain("order number");
    expect(action.toLowerCase()).not.toContain("invoice");
  });

  it("falls back to a concise operational next step for uncertain high-urgency work", () => {
    const action = generateRecommendedAction(
      buildInput({
        intent: "general_support",
        urgency: "high",
        orderNumber: undefined,
        risks: [],
      }),
    );

    expect(action).toContain("Identify the missing customer/order details");
    expect(action).toContain("send a clear next step today");
  });

  it("keeps non-customer work out of customer reply guidance", () => {
    const action = generateRecommendedAction(
      buildInput({
        workType: "system",
        actionability: "no_action_needed" as EmailAnalysis["actionability"],
        replyNeeded: "no",
      }),
    );

    expect(action).toContain("No customer-service reply recommended");
  });
});
