import { describe, expect, it } from "vitest";
import { computePriorityScore } from "./priorityScore";
import type { EmailAnalysis } from "../types/actionDesk";

function buildAnalysis(overrides?: Partial<EmailAnalysis>): EmailAnalysis {
  return {
    summary: "General support message needs review before taking action.",
    intent: "general_support",
    urgency: "medium",
    confidence: "medium",
    risks: [],
    nextAction: "Review the message.",
    messageType: "general_support",
    actionability: "review_needed",
    replyNeeded: "maybe",
    ...overrides,
  };
}

describe("computePriorityScore", () => {
  it("reduces priority for awareness-only informational messages", () => {
    const score = computePriorityScore(
      buildAnalysis({
        urgency: "low",
        messageType: "informational",
        actionability: "awareness_only",
        replyNeeded: "no",
      }),
    );

    expect(score.score).toBe(0);
  });

  it("keeps customer-impacting issues higher priority", () => {
    const score = computePriorityScore(
      buildAnalysis({
        intent: "damaged_shipment",
        urgency: "high",
        actionability: "action_required",
        replyNeeded: "yes",
        risks: ["damage_reported", "customer_frustration"],
        messageType: "customer_request",
      }),
    );

    expect(score.score).toBeGreaterThanOrEqual(70);
  });

  it("drops suspicious or phishing-related work to low priority", () => {
    const score = computePriorityScore(
      buildAnalysis({
        urgency: "low",
        messageType: "internal_alert",
        actionability: "review_needed",
        replyNeeded: "no",
        workType: "suspicious",
      }),
    );

    expect(score.score).toBe(0);
  });

  it("downgrades short continuation replies without a clear ask", () => {
    const score = computePriorityScore(
      buildAnalysis({
        urgency: "medium",
        actionability: "review_needed",
        replyNeeded: "no",
        hasClearRequest: false,
        isThreadContinuation: true,
      }),
    );

    expect(score.score).toBe(0);
  });

  it("pushes deadline-driven shipping requests into higher priority", () => {
    const score = computePriorityScore(
      buildAnalysis({
        intent: "where_is_my_order",
        urgency: "high",
        actionability: "action_required",
        replyNeeded: "yes",
        hasClearRequest: true,
        hasDeadlineRequest: true,
        workType: "customer_support",
        messageType: "customer_request",
      }),
    );

    expect(score.score).toBeGreaterThanOrEqual(80);
  });

  it("keeps vendor coordination threads de-emphasized even with urgency wording", () => {
    const score = computePriorityScore(
      buildAnalysis({
        urgency: "low",
        actionability: "no_action_needed",
        replyNeeded: "no",
        hasClearRequest: false,
        hasDeadlineRequest: true,
        workType: "vendor",
        messageType: "informational",
      }),
    );

    expect(score.score).toBeLessThan(25);
  });

  it("elevates time-bound operational confirmation requests above generic support", () => {
    const score = computePriorityScore(
      buildAnalysis({
        intent: "operational_confirmation",
        urgency: "high",
        actionability: "action_required",
        replyNeeded: "yes",
        hasClearRequest: true,
        hasConfirmationRequest: true,
        hasLogisticsContext: true,
        hasOperationalTimingSignal: true,
        workType: "customer_support",
        messageType: "customer_request",
      }),
    );

    expect(score.score).toBeGreaterThanOrEqual(80);
  });

  it("keeps operational logistics scheduling medium but below high-priority customer issues", () => {
    const score = computePriorityScore(
      buildAnalysis({
        intent: "operational_logistics_scheduling",
        urgency: "medium",
        actionability: "review_needed",
        replyNeeded: "no",
        hasClearRequest: false,
        hasLogisticsContext: true,
        hasOperationalTimingSignal: true,
        workType: "customer_support",
        messageType: "customer_request",
      }),
    );

    expect(score.score).toBeGreaterThanOrEqual(40);
    expect(score.score).toBeLessThan(70);
  });

  it("keeps missed pickup review work visible in the medium-priority band without a reply", () => {
    const score = computePriorityScore(
      buildAnalysis({
        intent: "missed_pickups_report",
        urgency: "medium",
        actionability: "review_needed",
        replyNeeded: "no",
        hasClearRequest: false,
        hasLogisticsContext: true,
        hasOperationalTimingSignal: true,
        workType: "customer_support",
        messageType: "internal_alert",
      }),
    );

    expect(score.score).toBeGreaterThanOrEqual(40);
    expect(score.score).toBeLessThan(70);
  });
});
