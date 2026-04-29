import { describe, expect, it, beforeEach } from "vitest";
import {
  clearProcessedEmailCache,
  getCachedProcessedEmail,
  setCachedProcessedEmail,
  updateProcessedEmailCache,
} from "./processedEmailCache";
import { applyCustomerPriorityToEmail } from "./customerMatching";
import type { ProcessedEmail, SavedCustomer } from "../types/actionDesk";

function buildProcessedEmail(overrides?: Partial<ProcessedEmail>): ProcessedEmail {
  return {
    email: {
      id: "email-1",
      senderName: "Acme Team",
      senderEmail: "orders@acme.com",
      subject: "Order follow-up",
      receivedAt: "2026-04-01T10:00:00Z",
      body: "Can you help with this Acme order?",
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
      replyDraft: "Original reply draft",
      priorityScore: 65,
    },
    issueCount: 0,
    previewText: "Customer needs an order update.",
    ...overrides,
  };
}

describe("updateProcessedEmailCache", () => {
  const customers: SavedCustomer[] = [
    {
      id: "customer-1",
      name: "Acme",
      emails: ["orders@acme.com"],
      domains: ["acme.com"],
    },
  ];

  beforeEach(() => {
    clearProcessedEmailCache();
  });

  it("refreshes cached customer-match metadata without losing analysis data", () => {
    setCachedProcessedEmail(buildProcessedEmail());

    updateProcessedEmailCache((item) =>
      applyCustomerPriorityToEmail(item, customers),
    );

    expect(getCachedProcessedEmail("email-1")).toMatchObject({
      isCustomerPriority: true,
      customerMatch: {
        customerId: "customer-1",
        customerName: "Acme",
        matchedOn: "sender_email",
      },
      result: {
        priorityScore: 65,
        replyDraft: "Original reply draft",
        analysis: {
          summary: "Customer needs an order update.",
        },
      },
    });
  });
});
