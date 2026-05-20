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

  it("suppresses vendor sales outreach even when it mentions numbers, recovery, and deployment", () => {
    const email = buildEmail({
      senderName: "Grace Turner",
      senderEmail: "grace.turner@teamunduit.com",
      subject: "are you into numbers?",
      body: [
        "Hi,",
        "",
        "Most IT teams recover less than half of devices after offboarding.",
        "Unduit helps companies reach a 98% recovery rate and simplify new hire deployment.",
        "Can I show you what it looks like for your IT?",
      ].join("\n"),
      previewText:
        "Unduit helps companies reach a 98% recovery rate and simplify new hire deployment.",
    });

    const normalized = normalizeProcessedEmailResult(
      email,
      buildResult({
        analysis: {
          ...buildResult().analysis,
          intent: "where_is_my_order",
          orderNumber: undefined,
          risks: ["delay_or_no_tracking_update"],
          summary: "Customer is asking for an order update but did not provide a usable identifier.",
          nextAction: "Request the order number or usable reference for the shipment status request.",
        },
      }),
    );

    expect(normalized.analysis.intent).toBe("general_support");
    expect(normalized.analysis.workType).toBe("vendor");
    expect(normalized.analysis.actionability).toBe("no_action_needed");
    expect(normalized.analysis.replyNeeded).toBe("no");
    expect(normalized.analysis.risks).toEqual([]);
    expect(normalized.analysis.nextAction.toLowerCase()).toContain("mark not relevant");
    expect(normalized.analysis.nextAction.toLowerCase()).not.toContain("order number");
    expect(normalized.replyDraft).toBe("");
    expect(normalized.priorityScore).toBeLessThan(20);
    expect(
      shouldShowInCustomerServiceQueue(buildProcessedEmail(email, normalized)),
    ).toBe(false);
  });

  it("suppresses Duagon vendor outreach instead of requesting an order number", () => {
    const email = buildEmail({
      senderName: "Casey Morgan",
      senderEmail: "casey.morgan@duagon.example",
      subject: "RE: AP Express Logistics priorities",
      body: [
        "Hi AP Express team,",
        "",
        "Duagon builds made in America hardware for railroad environments where durability matters.",
        "I am a Technical Sales Manager and wanted to see if AP Express is open to a quick chat.",
      ].join("\n"),
      previewText:
        "Duagon builds made in America hardware for railroad environments.",
    });

    const normalized = normalizeProcessedEmailResult(
      email,
      buildResult({
        analysis: {
          ...buildResult().analysis,
          intent: "where_is_my_order",
          orderNumber: undefined,
          risks: ["delay_or_no_tracking_update"],
          summary: "Customer is asking for an order update but did not provide a usable identifier.",
          nextAction: "Request the order number or usable reference for the shipment status request.",
        },
      }),
    );

    expect(normalized.analysis.intent).toBe("general_support");
    expect(normalized.analysis.workType).toBe("vendor");
    expect(normalized.analysis.actionability).toBe("no_action_needed");
    expect(normalized.analysis.replyNeeded).toBe("no");
    expect(normalized.analysis.risks).toEqual([]);
    expect(normalized.analysis.nextAction.toLowerCase()).not.toContain("order number");
    expect(normalized.replyDraft).toBe("");
    expect(
      shouldShowInCustomerServiceQueue(buildProcessedEmail(email, normalized)),
    ).toBe(false);
  });

  it("suppresses internal replies that only quote vendor outreach", () => {
    const email = buildEmail({
      senderName: "Hector Salas",
      senderEmail: "hsalas@apexpress.com",
      subject: "RE: AP Express Logistics priorities",
      body: [
        "Please see below for awareness.",
        "",
        "From: Casey Morgan <casey.morgan@duagon.example>",
        "Sent: Tuesday, May 19, 2026 3:10 PM",
        "Subject: AP Express Logistics priorities",
        "Duagon builds made in America hardware for railroad environments where durability matters.",
        "Would AP Express be open to a quick chat?",
      ].join("\n"),
      previewText: "Please see below for awareness.",
    });

    const normalized = normalizeProcessedEmailResult(email, buildResult());

    expect(normalized.analysis.workType).toBe("vendor");
    expect(normalized.analysis.intent).toBe("general_support");
    expect(normalized.analysis.replyNeeded).toBe("no");
    expect(normalized.replyDraft).toBe("");
    expect(
      shouldShowInCustomerServiceQueue(buildProcessedEmail(email, normalized)),
    ).toBe(false);
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

  it("rewrites Walmart MPU scheduling away from billing reply guidance", () => {
    const email = buildEmail({
      senderName: "Walmart Routing",
      senderEmail: "WROCREG1CS@walmart.com",
      subject: "MPU LOAD 93215119 - SCHEDULING",
      body: [
        "This is a scheduled load for Multi Pick Up.",
        "Stop 1 pickup time is 08:00 and Stop 2 pickup time is 11:30.",
        "Carrier pickup date: 05/21/26.",
        "Pickup number: 93215119.",
        "Routing status: routed. CDD 05/24/26.",
        "Reply if date/time does not work.",
        "TONU / OTIF charges may apply if loading and transit times are missed.",
      ].join("\n"),
      previewText: "Scheduled load for Multi Pick Up. Routing status: routed.",
    });

    const normalized = normalizeProcessedEmailResult(
      email,
      buildResult({
        analysis: {
          ...buildResult().analysis,
          intent: "billing_question",
          urgency: "high",
          orderNumber: undefined,
          risks: ["billing_discrepancy", "customer_frustration"],
          summary: "Customer has a billing or invoice question.",
          nextAction: "Request the order number or invoice number for the billing issue.",
        },
      }),
    );

    expect(normalized.analysis.intent).toBe("operational_logistics_scheduling");
    expect(normalized.analysis.workType).toBe("customer_support");
    expect(normalized.analysis.urgency).toBe("medium");
    expect(normalized.analysis.actionability).toBe("review_needed");
    expect(normalized.analysis.replyNeeded).toBe("no");
    expect(normalized.analysis.risks).toEqual([]);
    expect(normalized.analysis.nextAction).toBe(
      "Review scheduled pickup details and confirm whether the date/time works. Reply only if alternate scheduling or pickup details are needed.",
    );
    expect(normalized.analysis.nextAction.toLowerCase()).not.toContain("invoice");
    expect(normalized.analysis.nextAction.toLowerCase()).not.toContain("order number");
    expect(normalized.replyDraft).toBe("");
    expect(normalized.priorityScore).toBeGreaterThanOrEqual(40);
    expect(normalized.priorityScore).toBeLessThan(70);
  });

  it("suppresses EQISMART EOD internal reports instead of classifying them as WIMO", () => {
    const email = buildEmail({
      senderName: "Hector Salas",
      senderEmail: "hsalas@apexpress.com",
      subject: "EQISMART - EOD 05-19-26",
      body: [
        "All orders are on track.",
        "Tracking numbers are in Excel.",
        "Some orders are rolling over to process tomorrow.",
      ].join("\n"),
      previewText: "All orders are on track. Tracking numbers are in Excel.",
    });

    const normalized = normalizeProcessedEmailResult(
      email,
      buildResult({
        analysis: {
          ...buildResult().analysis,
          intent: "where_is_my_order",
          urgency: "high",
          orderNumber: undefined,
          risks: ["delay_or_no_tracking_update"],
          hasClearRequest: false,
          summary: "Customer is asking for an order update but did not provide a usable identifier.",
          nextAction: "Request the order number or usable reference for the shipment status request.",
        },
      }),
    );

    expect(normalized.analysis.intent).toBe("general_support");
    expect(normalized.analysis.workType).toBe("internal");
    expect(normalized.analysis.urgency).toBe("low");
    expect(normalized.analysis.actionability).toBe("no_action_needed");
    expect(normalized.analysis.replyNeeded).toBe("no");
    expect(normalized.analysis.risks).toEqual([]);
    expect(normalized.analysis.nextAction.toLowerCase()).not.toContain("order number");
    expect(normalized.replyDraft).toBe("");
    expect(normalized.priorityScore).toBeLessThan(20);
    expect(
      shouldShowInCustomerServiceQueue(buildProcessedEmail(email, normalized)),
    ).toBe(false);
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
