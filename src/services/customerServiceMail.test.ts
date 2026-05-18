import { describe, expect, it } from "vitest";
import {
  classifyWorkType,
  isLowValueSystemReportEmail,
  normalizeProcessedEmailResult,
  shouldShowInCustomerServiceQueue,
} from "./customerServiceMail";
import type { ActionDeskResult, EmailItem, ProcessedEmail } from "../types/actionDesk";

function buildEmail(overrides?: Partial<EmailItem>): EmailItem {
  return {
    id: "email-1",
    senderName: "Sender",
    senderEmail: "sender@example.com",
    subject: "Order update needed",
    receivedAt: "2026-04-01T10:00:00Z",
    body: "Hello support, where is my order ORD-1001? Please help.",
    previewText: "Hello support, where is my order ORD-1001? Please help.",
    source: "outlook_graph",
    provider: "outlook_graph",
    ...overrides,
  };
}

function buildResult(overrides?: Partial<ActionDeskResult>): ActionDeskResult {
  return {
    analysis: {
      summary: "Customer is requesting a status update for order ORD-1001.",
      intent: "where_is_my_order",
      urgency: "medium",
      confidence: "medium",
      orderNumber: "ORD-1001",
      risks: ["delay_or_no_tracking_update"],
      nextAction: "Verify the latest shipment status for ORD-1001 and send the customer the current update.",
      messageType: "customer_request",
      actionability: "action_required",
      replyNeeded: "yes",
      hasClearRequest: true,
      isThreadContinuation: false,
    },
    analysisSource: "fallback",
    replyDraft: "Hello,\n\nI can help with that.\n\nBest,\nSupport Team",
    priorityScore: 70,
    priorityBreakdown: [],
    ...overrides,
  };
}

function buildProcessedEmail(email: EmailItem, result: ActionDeskResult): ProcessedEmail {
  return {
    email,
    status: "processed",
    result,
    issueCount: result.analysis.risks.length,
    previewText: email.previewText ?? email.body,
  };
}

describe("customerServiceMail", () => {
  it("downgrades suspicious mail out of the customer-service queue", () => {
    const email = buildEmail({
      subject: "Phishing: suspicious invoice link",
      senderEmail: "security@example.com",
      body: "FYI only. This looks like a scam. Please do not click.",
      previewText: "FYI only. This looks like a scam. Please do not click.",
    });

    const normalized = normalizeProcessedEmailResult(email, buildResult());

    expect(classifyWorkType(email, normalized.analysis)).toBe("suspicious");
    expect(normalized.analysis.intent).toBe("general_support");
    expect(normalized.analysis.replyNeeded).toBe("no");
    expect(normalized.replyDraft).toBe("");
    expect(normalized.priorityScore).toBeLessThan(20);
    expect(
      shouldShowInCustomerServiceQueue(buildProcessedEmail(email, normalized)),
    ).toBe(false);
  });

  it("suppresses vendor account-maintenance threads", () => {
    const email = buildEmail({
      senderEmail: "accounts@vendorco.com",
      subject: "Vendor portal account maintenance",
      body: "Please review the business account maintenance notice in the vendor portal.",
      previewText: "Please review the business account maintenance notice in the vendor portal.",
    });

    const normalized = normalizeProcessedEmailResult(
      email,
      buildResult({
        analysis: {
          ...buildResult().analysis,
          intent: "billing_question",
          risks: ["billing_discrepancy"],
        },
      }),
    );

    expect(normalized.analysis.workType).toBe("vendor");
    expect(normalized.analysis.replyNeeded).toBe("no");
    expect(normalized.replyDraft).toBe("");
    expect(normalized.analysis.nextAction).toContain("vendor");
  });

  it("suppresses short continuation replies with no clear ask", () => {
    const email = buildEmail({
      subject: "Re: Order thread",
      body: "I just sent it in a separate email.\n\nFrom: Previous Sender\nSent: earlier",
      previewText: "I just sent it in a separate email.",
    });

    const normalized = normalizeProcessedEmailResult(email, buildResult());

    expect(normalized.analysis.isThreadContinuation).toBe(true);
    expect(normalized.analysis.replyNeeded).toBe("no");
    expect(normalized.replyDraft).toBe("");
  });

  it("keeps real customer-support requests visible and actionable", () => {
    const email = buildEmail({
      senderEmail: "customer@example.com",
      subject: "Where is my order?",
    });

    const normalized = normalizeProcessedEmailResult(email, buildResult());

    expect(normalized.analysis.workType).toBe("customer_support");
    expect(normalized.analysis.replyNeeded).toBe("yes");
    expect(normalized.replyDraft.length).toBeGreaterThan(0);
    expect(
      shouldShowInCustomerServiceQueue(buildProcessedEmail(email, normalized)),
    ).toBe(true);
  });

  it("keeps broad customer-looking order follow-ups visible in customer service queue", () => {
    const email = buildEmail({
      senderEmail: "buyer@example.com",
      subject: "Need update on ORD-48291",
      body: "Hi team, can you send an update on ORD-48291? Customer is asking when it will deliver.",
      previewText: "Can you send an update on ORD-48291?",
    });

    const normalized = normalizeProcessedEmailResult(
      email,
      buildResult({
        analysis: {
          ...buildResult().analysis,
          intent: "general_support",
          orderNumber: undefined,
          caseIdentifiers: undefined,
          risks: [],
          summary: "Customer is asking for an update.",
          nextAction: "Review the request details and reply with the next support step.",
        },
      }),
    );

    expect(normalized.analysis.workType).toBe("customer_support");
    expect(
      shouldShowInCustomerServiceQueue(buildProcessedEmail(email, normalized)),
    ).toBe(true);
  });

  it("keeps an explicit latest-message cancellation request in customer support handling", () => {
    const email = buildEmail({
      senderEmail: "customer@example.com",
      subject: "Re: PT cancellation",
      body: [
        "Thanks for sending that over, Please cancel all of those PTs since the only style on them is TGWD15+MUL and we will put it on a new PO. Pls confirm once canceled",
        "",
        "From: Support Team",
        "Sent: earlier",
        "Subject: Prior thread",
        "FYI only.",
      ].join("\n"),
      previewText:
        "Thanks for sending that over, Please cancel all of those PTs since the only style on them is TGWD15+MUL and we will put it on a new PO. Pls confirm once canceled",
    });

    const normalized = normalizeProcessedEmailResult(
      email,
      buildResult({
        analysis: {
          ...buildResult().analysis,
          intent: "cancellation_request",
          summary: "Customer wants to cancel an order and is asking for confirmation.",
          orderNumber: undefined,
          risks: ["cancellation_review_needed"],
        },
      }),
    );

    expect(normalized.analysis.workType).toBe("customer_support");
    expect(normalized.analysis.hasClearRequest).toBe(true);
    expect(normalized.analysis.actionability).toBe("action_required");
    expect(normalized.analysis.replyNeeded).toBe("yes");
    expect(normalized.priorityScore).toBeGreaterThan(0);
    expect(normalized.replyDraft).not.toBe("");
  });

  it("treats an external stock-transfer ship-today request as urgent customer work", () => {
    const email = buildEmail({
      senderName: "Rita Pardee",
      senderEmail: "ritap@allstarmg.com",
      subject: "Stock Transfer #1001-009351 - Soccer Ball",
      receivedAt: "2026-04-02T12:19:00Z",
      body: [
        "Please confirm this will get shipped out today to deliver tomorrow.",
        "",
        "From: Rita Pardee",
        "Sent: Thursday, March 26, 2026 9:53 AM",
        "Subject: Stock Transfer #1001-009351 - Soccer Ball",
        "Please ship on 4/2 to deliver by 4/3",
        "These are currently being reworked under R0130-26LA.",
      ].join("\n"),
      previewText: "Please confirm this will get shipped out today to deliver tomorrow.",
    });

    const normalized = normalizeProcessedEmailResult(
      email,
      buildResult({
        analysis: {
          ...buildResult().analysis,
          intent: "general_support",
          summary: "Customer needs ship-timing confirmation for transfer 1001-009351.",
          orderNumber: undefined,
          caseIdentifiers: [
            { value: "1001-009351", kind: "transfer", source: "subject" },
            { value: "R0130-26LA", kind: "rework", source: "body" },
          ],
          hasDeadlineRequest: true,
          urgency: "high",
          nextAction: "Review the current ship-timing request.",
        },
      }),
    );

    expect(normalized.analysis.workType).toBe("customer_support");
    expect(normalized.analysis.urgency).toBe("high");
    expect(normalized.analysis.summary.toLowerCase()).toContain("ship-timing confirmation");
    expect(normalized.analysis.nextAction.toLowerCase()).toContain("ship timing");
    expect(normalized.replyDraft.toLowerCase()).toContain("timing is important");
  });

  it("keeps overdue deadline-driven requests urgent after the original day passes", () => {
    const email = buildEmail({
      senderEmail: "customer@example.com",
      receivedAt: "2026-03-30T15:00:00Z",
      subject: "Ship today request",
      body: "Please confirm this will ship today and arrive tomorrow.",
      previewText: "Please confirm this will ship today and arrive tomorrow.",
    });

    const normalized = normalizeProcessedEmailResult(
      email,
      buildResult({
        analysis: {
          ...buildResult().analysis,
          intent: "general_support",
          orderNumber: undefined,
          hasDeadlineRequest: true,
          deadlineState: "current",
          urgency: "high",
          summary: "Customer needs ship-timing confirmation and expects a current update.",
          nextAction: "Review the ship-timing request immediately.",
        },
      }),
    );

    expect(normalized.analysis.deadlineState).toBe("past_due");
    expect(normalized.analysis.urgency).toBe("high");
    expect(normalized.analysis.nextAction.toLowerCase()).toContain("may already have been missed");
    expect(normalized.priorityScore).toBeGreaterThanOrEqual(80);
  });

  it("keeps vendor logistics notices suppressed when there is no real customer ask", () => {
    const email = buildEmail({
      senderEmail: "ops@forwarder-vendor.com",
      subject: "Inbound container ETA notice",
      body: "FYI only. Inbound container appointment is scheduled for tomorrow. No action needed right now.",
      previewText: "FYI only. Inbound container appointment is scheduled for tomorrow. No action needed right now.",
    });

    const normalized = normalizeProcessedEmailResult(
      email,
      buildResult({
        analysis: {
          ...buildResult().analysis,
          intent: "general_support",
          urgency: "medium",
          orderNumber: undefined,
          hasConfirmationRequest: false,
          hasLogisticsContext: true,
          hasOperationalTimingSignal: true,
          actionability: "review_needed",
          replyNeeded: "maybe",
          summary: "Customer sent a general support request.",
          nextAction: "Review the request details and reply with the next support step.",
        },
      }),
    );

    expect(["internal", "vendor"]).toContain(normalized.analysis.workType);
    expect(normalized.analysis.replyNeeded).toBe("no");
    expect(normalized.replyDraft).toBe("");
  });

  it("keeps automated system notifications out of the customer service queue", () => {
    const email = buildEmail({
      senderEmail: "noreply@system.example.com",
      subject: "Password reset notification",
      body: "This is an automated notification. Do not reply.",
      previewText: "This is an automated notification. Do not reply.",
    });

    const normalized = normalizeProcessedEmailResult(
      email,
      buildResult({
        analysis: {
          ...buildResult().analysis,
          intent: "general_support",
          orderNumber: undefined,
          risks: [],
          hasClearRequest: false,
          actionability: "review_needed",
          replyNeeded: "maybe",
          summary: "Automated notification.",
          nextAction: "Review the message.",
        },
      }),
    );

    expect(normalized.analysis.workType).toBe("system");
    expect(
      shouldShowInCustomerServiceQueue(buildProcessedEmail(email, normalized)),
    ).toBe(false);
  });

  it("deprioritizes AP Express systems tracking summary reports", () => {
    const email = buildEmail({
      senderName: "AP Express Systems",
      senderEmail: "systems@apexpress.com",
      subject: "OutboundYesterdayTracking_Summary",
      body: "Subject: OutboundYesterdayTracking_Summary\nSender: AP Express Systems",
      previewText: "OutboundYesterdayTracking_Summary",
    });

    const normalized = normalizeProcessedEmailResult(email, buildResult({
      analysis: {
        ...buildResult().analysis,
        intent: "where_is_my_order",
        orderNumber: undefined,
        risks: [],
        hasClearRequest: false,
        summary: "Tracking report summary.",
        nextAction: "Review the report.",
      },
    }));

    expect(isLowValueSystemReportEmail(email)).toBe(true);
    expect(normalized.analysis.workType).toBe("system");
    expect(normalized.analysis.replyNeeded).toBe("no");
    expect(
      shouldShowInCustomerServiceQueue(buildProcessedEmail(email, normalized)),
    ).toBe(false);
  });
});
