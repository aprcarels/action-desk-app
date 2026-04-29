import { describe, expect, it } from "vitest";
import {
  filterProcessedEmails,
  rematchLoadedQueueItems,
  sortProcessedEmails,
} from "./processEmails";
import type { ProcessedEmail, SavedCustomer } from "../types/actionDesk";

function buildProcessedEmail(overrides?: Partial<ProcessedEmail>): ProcessedEmail {
  return {
    email: {
      id: "email-1",
      senderName: "Customer",
      senderEmail: "customer@example.com",
      subject: "Where is my order?",
      receivedAt: "2026-04-01T10:00:00Z",
      body: "Please help with ORD-1001.",
      previewText: "Please help with ORD-1001.",
      provider: "outlook_graph",
      source: "outlook_graph",
    },
    status: "processed",
    result: {
      analysis: {
        summary: "Customer is requesting a status update for order ORD-1001.",
        intent: "where_is_my_order",
        urgency: "medium",
        confidence: "medium",
        orderNumber: "ORD-1001",
        risks: [],
        nextAction: "Verify the latest shipment status.",
        messageType: "customer_request",
        actionability: "action_required",
        replyNeeded: "yes",
        workType: "customer_support",
        hasClearRequest: true,
        isThreadContinuation: false,
      },
      analysisSource: "fallback",
      replyDraft: "Hello",
      priorityScore: 60,
    },
    issueCount: 0,
    previewText: "Customer is requesting a status update for order ORD-1001.",
    ...overrides,
  };
}

describe("filterProcessedEmails", () => {
  it("shows only likely customer-service work in the default queue view", () => {
    const items = [
      buildProcessedEmail(),
      buildProcessedEmail({
        email: {
          ...buildProcessedEmail().email,
          id: "email-2",
          subject: "Vendor portal maintenance",
          senderEmail: "accounts@vendorco.com",
        },
        result: {
          ...buildProcessedEmail().result!,
          analysis: {
            ...buildProcessedEmail().result!.analysis,
            workType: "vendor",
            replyNeeded: "no",
            actionability: "no_action_needed",
            intent: "general_support",
          },
          replyDraft: "",
          priorityScore: 0,
        },
      }),
    ];

    const filtered = filterProcessedEmails(items, {
      searchQuery: "",
      urgency: "all",
      intent: "all",
      customerPriority: "all",
      queueView: "customer_service",
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].email.id).toBe("email-1");
  });

  it("keeps all items accessible in the all inbox view", () => {
    const items = [
      buildProcessedEmail(),
      buildProcessedEmail({
        email: {
          ...buildProcessedEmail().email,
          id: "email-2",
        },
        result: {
          ...buildProcessedEmail().result!,
          analysis: {
            ...buildProcessedEmail().result!.analysis,
            workType: "internal",
            replyNeeded: "no",
            actionability: "no_action_needed",
            intent: "general_support",
          },
          replyDraft: "",
          priorityScore: 0,
        },
      }),
    ];

    const filtered = filterProcessedEmails(items, {
      searchQuery: "",
      urgency: "all",
      intent: "all",
      customerPriority: "all",
      queueView: "all_inbox",
    });

    expect(filtered).toHaveLength(2);
  });

  it("can filter to matched customer emails only", () => {
    const items = [
      buildProcessedEmail({
        email: {
          ...buildProcessedEmail().email,
          id: "email-priority",
        },
        isCustomerPriority: true,
        customerMatch: {
          customerId: "customer-1",
          customerName: "Acme",
          matchedOn: "sender_email",
          matchedValue: "customer@example.com",
        },
      }),
      buildProcessedEmail({
        email: {
          ...buildProcessedEmail().email,
          id: "email-standard",
        },
      }),
    ];

    const filtered = filterProcessedEmails(items, {
      searchQuery: "",
      urgency: "all",
      intent: "all",
      customerPriority: "matched_only",
      queueView: "all_inbox",
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].email.id).toBe("email-priority");
  });
});

describe("sortProcessedEmails", () => {
  it("surfaces processed matched customers before other items", () => {
    const items = [
      buildProcessedEmail({
        email: {
          ...buildProcessedEmail().email,
          id: "processed-standard",
          receivedAt: "2026-04-01T10:00:00Z",
        },
        result: {
          ...buildProcessedEmail().result!,
          priorityScore: 95,
        },
      }),
      buildProcessedEmail({
        email: {
          ...buildProcessedEmail().email,
          id: "failed-email",
        },
        status: "failed",
        result: undefined,
      }),
      buildProcessedEmail({
        email: {
          ...buildProcessedEmail().email,
          id: "processed-matched",
          receivedAt: "2026-04-01T09:00:00Z",
        },
        result: {
          ...buildProcessedEmail().result!,
          priorityScore: 40,
        },
        isCustomerPriority: true,
        customerMatch: {
          customerId: "customer-1",
          customerName: "Acme",
          matchedOn: "sender_email",
          matchedValue: "customer@example.com",
        },
      }),
      buildProcessedEmail({
        email: {
          ...buildProcessedEmail().email,
          id: "pending-email",
        },
        status: "pending",
        result: undefined,
      }),
    ];

    expect(sortProcessedEmails(items).map((item) => item.email.id)).toEqual([
      "processed-matched",
      "processed-standard",
      "pending-email",
      "failed-email",
    ]);
  });
});

describe("rematchLoadedQueueItems", () => {
  const customers: SavedCustomer[] = [
    {
      id: "customer-1",
      name: "Acme",
      emails: ["customer@example.com"],
      domains: ["example.com"],
    },
  ];

  it("re-matches loaded queue items and preserves analysis and reply data", () => {
    const items = [
      buildProcessedEmail({
        email: {
          ...buildProcessedEmail().email,
          id: "email-standard",
          senderEmail: "customer@example.com",
        },
        result: {
          ...buildProcessedEmail().result!,
          replyDraft: "Keep this reply draft",
          priorityScore: 88,
        },
      }),
    ];

    const rematchedItems = rematchLoadedQueueItems(items, customers);

    expect(rematchedItems[0]).toMatchObject({
      email: {
        id: "email-standard",
        senderEmail: "customer@example.com",
      },
      isCustomerPriority: true,
      customerMatch: {
        customerId: "customer-1",
        customerName: "Acme",
        matchedOn: "sender_email",
      },
      result: {
        priorityScore: 88,
        replyDraft: "Keep this reply draft",
        analysis: {
          summary:
            "Customer is requesting a status update for order ORD-1001.",
        },
      },
    });
  });

  it("re-sorts loaded queue items after rematching", () => {
    const items = [
      buildProcessedEmail({
        email: {
          ...buildProcessedEmail().email,
          id: "non-matched-high-score",
          senderEmail: "other@different.com",
        },
        result: {
          ...buildProcessedEmail().result!,
          priorityScore: 95,
        },
      }),
      buildProcessedEmail({
        email: {
          ...buildProcessedEmail().email,
          id: "matched-lower-score",
          senderEmail: "customer@example.com",
        },
        result: {
          ...buildProcessedEmail().result!,
          priorityScore: 40,
        },
      }),
    ];

    expect(rematchLoadedQueueItems(items, customers).map((item) => item.email.id)).toEqual([
      "matched-lower-score",
      "non-matched-high-score",
    ]);
  });

  it("lets matched-only filtering update immediately from rematched items", () => {
    const items = rematchLoadedQueueItems(
      [
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "matched-item",
            senderEmail: "customer@example.com",
          },
        }),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "non-matched-item",
            senderEmail: "other@different.com",
          },
        }),
      ],
      customers,
    );

    const filtered = filterProcessedEmails(items, {
      searchQuery: "",
      urgency: "all",
      intent: "all",
      customerPriority: "matched_only",
      queueView: "all_inbox",
    });

    expect(filtered.map((item) => item.email.id)).toEqual(["matched-item"]);
  });
});
