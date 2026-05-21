import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EMAIL_PROCESSING_CONCURRENCY,
  filterProcessedEmails,
  processEmails,
  processEmailsProgressively,
  rematchLoadedQueueItems,
  sortProcessedEmails,
} from "./processEmails";
import * as actionDeskRunner from "./runActionDesk";
import type {
  ActionDeskResult,
  EmailItem,
  ProcessedEmail,
  SavedCustomer,
} from "../types/actionDesk";

function buildEmailItem(index: number): EmailItem {
  return {
    id: `email-${index}`,
    senderName: `Customer ${index}`,
    senderEmail: `customer-${index}@example.com`,
    subject: `Where is order ${index}?`,
    receivedAt: `2026-04-01T10:00:${String(index).padStart(2, "0")}Z`,
    body: `Please help with ORD-${1000 + index}.`,
    previewText: `Please help with ORD-${1000 + index}.`,
    provider: "outlook_graph",
    source: "outlook_graph",
  };
}

function buildActionDeskResult(index: number): ActionDeskResult {
  return {
    analysis: {
      summary: `Customer ${index} is requesting an order update.`,
      intent: "where_is_my_order",
      urgency: "medium",
      confidence: "medium",
      orderNumber: `ORD-${1000 + index}`,
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
  };
}

function getOrderIndexFromAnalysisInput(input: string): number {
  const match = input.match(/ORD-(\d+)/);
  const orderNumber = match ? Number(match[1]) : 1000;

  return orderNumber - 1000;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

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

  it("keeps no-reply operational review work visible in default and review views", () => {
    const operationalReview = buildProcessedEmail({
      email: {
        ...buildProcessedEmail().email,
        id: "missed-pickups",
        senderEmail: "shipping@apexpress.com",
        subject: "MISSED PICKUPS 5/20/2026",
        body: "Attached are the missed pickups for tonight.",
      },
      result: {
        ...buildProcessedEmail().result!,
        analysis: {
          ...buildProcessedEmail().result!.analysis,
          intent: "missed_pickups_report",
          urgency: "high",
          actionability: "review_needed",
          replyNeeded: "no",
          workType: "customer_support",
          messageType: "internal_alert",
          nextAction:
            "Review missed pickup list, confirm affected shipments/customers, and assign follow-up where needed.",
        },
        replyDraft: "",
        priorityScore: 55,
      },
    });

    expect(
      filterProcessedEmails([operationalReview], {
        searchQuery: "",
        urgency: "all",
        intent: "all",
        customerPriority: "all",
        queueView: "customer_service",
        workView: "work_queue",
      }).map((item) => item.email.id),
    ).toEqual(["missed-pickups"]);
    expect(
      filterProcessedEmails([operationalReview], {
        searchQuery: "",
        urgency: "all",
        intent: "all",
        customerPriority: "all",
        queueView: "customer_service",
        workView: "review_needed",
      }).map((item) => item.email.id),
    ).toEqual(["missed-pickups"]);
    expect(
      filterProcessedEmails([operationalReview], {
        searchQuery: "",
        urgency: "all",
        intent: "all",
        customerPriority: "all",
        queueView: "customer_service",
        workView: "operational_exceptions",
      }).map((item) => item.email.id),
    ).toEqual(["missed-pickups"]);
  });

  it("lets audit views reveal suppressed and no-action processed items", () => {
    const replyItem = buildProcessedEmail();
    const vendorItem = buildProcessedEmail({
      email: {
        ...buildProcessedEmail().email,
        id: "vendor-sales",
        senderEmail: "sales@vendor.example",
        subject: "Logistics software demo",
        body: "Can I show you a demo of our logistics platform?",
      },
      result: {
        ...buildProcessedEmail().result!,
        analysis: {
          ...buildProcessedEmail().result!.analysis,
          intent: "general_support",
          urgency: "low",
          actionability: "no_action_needed",
          replyNeeded: "no",
          workType: "vendor",
          risks: [],
        },
        replyDraft: "",
        priorityScore: 0,
      },
    });

    expect(
      filterProcessedEmails([replyItem, vendorItem], {
        searchQuery: "",
        urgency: "all",
        intent: "all",
        customerPriority: "all",
        queueView: "customer_service",
        workView: "work_queue",
      }).map((item) => item.email.id),
    ).toEqual(["email-1"]);
    expect(
      filterProcessedEmails([replyItem, vendorItem], {
        searchQuery: "",
        urgency: "all",
        intent: "all",
        customerPriority: "all",
        queueView: "customer_service",
        workView: "no_action_suppressed",
      }).map((item) => item.email.id),
    ).toEqual(["vendor-sales"]);
    expect(
      filterProcessedEmails([replyItem, vendorItem], {
        searchQuery: "",
        urgency: "all",
        intent: "all",
        customerPriority: "all",
        queueView: "customer_service",
        workView: "all_processed",
      }).map((item) => item.email.id),
    ).toEqual(["email-1", "vendor-sales"]);
  });

  it("does not collapse a mixed inbox to only reply-needed items", () => {
    const replyItems = Array.from({ length: 10 }, (_, index) =>
      buildProcessedEmail({
        email: {
          ...buildProcessedEmail().email,
          id: `reply-${index + 1}`,
          senderEmail: `customer-${index + 1}@example.com`,
        },
      }),
    );
    const reviewItems = Array.from({ length: 10 }, (_, index) =>
      buildProcessedEmail({
        email: {
          ...buildProcessedEmail().email,
          id: `review-${index + 1}`,
          senderEmail: `ops-${index + 1}@apexpress.com`,
          subject: `MISSED PICKUPS batch ${index + 1}`,
          body: "Attached are the missed pickups for tonight.",
        },
        result: {
          ...buildProcessedEmail().result!,
          analysis: {
            ...buildProcessedEmail().result!.analysis,
            intent: "missed_pickups_report",
            urgency: "high",
            actionability: "review_needed",
            replyNeeded: "no",
            workType: "customer_support",
            messageType: "internal_alert",
            nextAction:
              "Review missed pickup list, confirm affected shipments/customers, and assign follow-up where needed.",
          },
          replyDraft: "",
          priorityScore: 55,
        },
      }),
    );
    const suppressedItems = Array.from({ length: 5 }, (_, index) =>
      buildProcessedEmail({
        email: {
          ...buildProcessedEmail().email,
          id: `suppressed-${index + 1}`,
          senderEmail: `sales-${index + 1}@vendor.example`,
          subject: "Sales outreach",
        },
        result: {
          ...buildProcessedEmail().result!,
          analysis: {
            ...buildProcessedEmail().result!.analysis,
            intent: "general_support",
            urgency: "low",
            actionability: "no_action_needed",
            replyNeeded: "no",
            workType: "vendor",
            risks: [],
          },
          replyDraft: "",
          priorityScore: 0,
        },
      }),
    );
    const items = [...replyItems, ...reviewItems, ...suppressedItems];

    const defaultQueue = filterProcessedEmails(items, {
      searchQuery: "",
      urgency: "all",
      intent: "all",
      customerPriority: "all",
      queueView: "customer_service",
      workView: "work_queue",
    });
    const needsReply = filterProcessedEmails(items, {
      searchQuery: "",
      urgency: "all",
      intent: "all",
      customerPriority: "all",
      queueView: "customer_service",
      workView: "needs_reply",
    });
    const reviewNeeded = filterProcessedEmails(items, {
      searchQuery: "",
      urgency: "all",
      intent: "all",
      customerPriority: "all",
      queueView: "customer_service",
      workView: "review_needed",
    });

    expect(items).toHaveLength(25);
    expect(defaultQueue).toHaveLength(20);
    expect(needsReply).toHaveLength(10);
    expect(reviewNeeded).toHaveLength(10);
  });

  it("suppresses missing-body system report failures from the customer-service view", () => {
    const systemReportFailure = buildProcessedEmail({
      email: {
        ...buildProcessedEmail().email,
        id: "system-report",
        senderName: "AP Express Systems",
        senderEmail: "systems@apexpress.com",
        subject: "OutboundYesterdayTracking_Summary",
        body: "",
        previewText: "",
      },
      status: "failed",
      result: undefined,
      processingError: "This email could not be analyzed because the body is missing.",
      previewText: "",
    });
    const customerMissingBodyFailure = buildProcessedEmail({
      email: {
        ...buildProcessedEmail().email,
        id: "customer-missing-body",
        senderEmail: "customer@example.com",
        subject: "Need help",
        body: "",
        previewText: "",
      },
      status: "failed",
      result: undefined,
      processingError: "This email could not be analyzed because the body is missing.",
      previewText: "",
    });

    const customerServiceItems = filterProcessedEmails(
      [systemReportFailure, customerMissingBodyFailure],
      {
        searchQuery: "",
        urgency: "all",
        intent: "all",
        customerPriority: "all",
        queueView: "customer_service",
      },
    );
    const allInboxItems = filterProcessedEmails(
      [systemReportFailure, customerMissingBodyFailure],
      {
        searchQuery: "",
        urgency: "all",
        intent: "all",
        customerPriority: "all",
        queueView: "all_inbox",
      },
    );

    expect(customerServiceItems.map((item) => item.email.id)).toEqual([
      "customer-missing-body",
    ]);
    expect(allInboxItems.map((item) => item.email.id)).toEqual([
      "system-report",
      "customer-missing-body",
    ]);
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
          matchedOn: "email",
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

describe("processEmails", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("uses subject and sender fallback for empty-body Graph system reports", async () => {
    vi.stubEnv("VITE_AI_CLASSIFICATION_ENABLED", "false");
    vi.stubEnv("VITE_AI_REPLY_DRAFTS_ENABLED", "false");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const processedItems = await processEmails([
      {
        id: "msg-system-report",
        senderName: "AP Express Systems",
        senderEmail: "systems@apexpress.com",
        subject: "OutboundYesterdayTracking_Summary",
        receivedAt: "2026-04-01T10:00:00Z",
        body: "",
        previewText: "",
        provider: "outlook_graph",
        source: "outlook_graph",
      },
    ]);

    expect(processedItems).toHaveLength(1);
    expect(processedItems[0]).toMatchObject({
      status: "processed",
      email: {
        body: expect.stringContaining("OutboundYesterdayTracking_Summary"),
      },
      result: {
        analysis: {
          workType: "system",
          replyNeeded: "no",
        },
      },
    });
    expect(
      filterProcessedEmails(processedItems, {
        searchQuery: "",
        urgency: "all",
        intent: "all",
        customerPriority: "all",
        queueView: "customer_service",
      }),
    ).toEqual([]);
    expect(infoSpy).toHaveBeenCalledWith(
      "[Action Desk diagnostics] missing body fallback",
      expect.objectContaining({
        reason: "systemReportEmail",
        emailId: "msg-system-report",
        senderEmail: "systems@apexpress.com",
      }),
    );
  });

  it("limits batch processing concurrency", async () => {
    const emails = Array.from({ length: 12 }, (_, index) =>
      buildEmailItem(index + 1),
    );
    let activeCount = 0;
    let maxActiveCount = 0;
    const runSpy = vi
      .spyOn(actionDeskRunner, "runActionDesk")
      .mockImplementation(async (input) => {
        activeCount += 1;
        maxActiveCount = Math.max(maxActiveCount, activeCount);

        try {
          await delay(5);
          return buildActionDeskResult(getOrderIndexFromAnalysisInput(input));
        } finally {
          activeCount -= 1;
        }
      });

    const processedItems = await processEmails(emails);

    expect(DEFAULT_EMAIL_PROCESSING_CONCURRENCY).toBe(4);
    expect(runSpy).toHaveBeenCalledTimes(emails.length);
    expect(maxActiveCount).toBeLessThanOrEqual(
      DEFAULT_EMAIL_PROCESSING_CONCURRENCY,
    );
    expect(processedItems).toHaveLength(emails.length);
    expect(processedItems.every((item) => item.status === "processed")).toBe(
      true,
    );
  });

  it("keeps progressive callbacks while limiting concurrency", async () => {
    const emails = Array.from({ length: 12 }, (_, index) =>
      buildEmailItem(index + 1),
    );
    const onItemProcessed = vi.fn();
    let activeCount = 0;
    let maxActiveCount = 0;
    const runSpy = vi
      .spyOn(actionDeskRunner, "runActionDesk")
      .mockImplementation(async (input) => {
        activeCount += 1;
        maxActiveCount = Math.max(maxActiveCount, activeCount);

        try {
          await delay(5);
          return buildActionDeskResult(getOrderIndexFromAnalysisInput(input));
        } finally {
          activeCount -= 1;
        }
      });

    const result = await processEmailsProgressively(emails, {
      onItemProcessed,
    });

    expect(DEFAULT_EMAIL_PROCESSING_CONCURRENCY).toBe(4);
    expect(runSpy).toHaveBeenCalledTimes(emails.length);
    expect(maxActiveCount).toBeLessThanOrEqual(
      DEFAULT_EMAIL_PROCESSING_CONCURRENCY,
    );
    expect(onItemProcessed).toHaveBeenCalledTimes(emails.length);
    expect(result.processedCount).toBe(emails.length);
    expect(result.failedCount).toBe(0);
    expect(result.processedItems).toHaveLength(emails.length);
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
          matchedOn: "email",
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
        matchedOn: "domain",
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
