import { describe, expect, it } from "vitest";
import { analyzeEmail } from "./analyzeEmail";
import { buildAnalysisInput } from "./analysisInput";

describe("analyzeEmail", () => {
  it("does not classify alert-style notifications as where_is_my_order", () => {
    const analysis = analyzeEmail(
      "Automated alert: shipment exception notification for ORD-1001. FYI only, no action needed.",
    );

    expect(analysis.intent).toBe("general_support");
    expect(analysis.messageType).toBe("internal_alert");
    expect(analysis.actionability).toBe("no_action_needed");
    expect(analysis.replyNeeded).toBe("no");
  });

  it("downgrades FYI messages to low urgency", () => {
    const analysis = analyzeEmail(
      "FYI - just letting you know the carrier posted a delay. No action needed right now.",
    );

    expect(analysis.urgency).toBe("low");
    expect(analysis.actionability).toBe("no_action_needed");
  });

  it("keeps actionable customer requests actionable", () => {
    const analysis = analyzeEmail(
      "Hi support, where is my order ORD-1002? Please help and send me an update today.",
    );

    expect(analysis.intent).toBe("where_is_my_order");
    expect(analysis.actionability).toBe("action_required");
    expect(analysis.replyNeeded).toBe("yes");
  });

  it("classifies vendor sales outreach as not customer-service actionable", () => {
    const analysis = analyzeEmail(
      buildAnalysisInput({
        subject: "are you into numbers?",
        body: [
          "Hi,",
          "",
          "Most IT teams recover less than half of devices after offboarding.",
          "Unduit helps companies reach a 98% recovery rate and simplify new hire deployment.",
          "Can I show you what it looks like for your IT?",
          "",
          "Grace Turner",
          "Unduit",
        ].join("\n"),
      }),
    );

    expect(analysis.intent).not.toBe("where_is_my_order");
    expect(analysis.intent).toBe("general_support");
    expect(analysis.workType).toBe("vendor");
    expect(analysis.actionability).toBe("no_action_needed");
    expect(analysis.replyNeeded).toBe("no");
    expect(analysis.risks).toEqual([]);
    expect(analysis.nextAction.toLowerCase()).toContain("mark not relevant");
    expect(analysis.nextAction.toLowerCase()).not.toContain("order number");
    expect(analysis.summary.toLowerCase()).toContain("vendor sales outreach");
  });

  it("classifies Duagon vendor outreach as not customer-service actionable", () => {
    const analysis = analyzeEmail(
      buildAnalysisInput({
        subject: "RE: AP Express Logistics priorities",
        body: [
          "Hi AP Express team,",
          "",
          "Duagon builds made in America hardware for railroad environments where durability matters.",
          "I am a Technical Sales Manager and wanted to see if AP Express is open to a quick chat.",
          "",
          "Casey Morgan",
          "Technical Sales Manager",
        ].join("\n"),
      }),
    );

    expect(analysis.intent).not.toBe("where_is_my_order");
    expect(analysis.workType).toBe("vendor");
    expect(analysis.actionability).toBe("no_action_needed");
    expect(analysis.replyNeeded).toBe("no");
    expect(analysis.risks).toEqual([]);
    expect(analysis.nextAction.toLowerCase()).not.toContain("order number");
  });

  it("still treats real customer shipment status requests as actionable order work", () => {
    const analysis = analyzeEmail(
      buildAnalysisInput({
        subject: "Shipment status for ORD-1002",
        body: "Hi support, can you send the current shipment status for order ORD-1002? The tracking number has not updated.",
      }),
    );

    expect(analysis.intent).toBe("where_is_my_order");
    expect(analysis.workType).toBe("customer_support");
    expect(analysis.actionability).toBe("action_required");
    expect(analysis.replyNeeded).toBe("yes");
    expect(analysis.nextAction.toLowerCase()).toContain("shipment status");
  });

  it("classifies Walmart MPU load scheduling as operational logistics, not billing or WIMO", () => {
    const analysis = analyzeEmail(
      buildAnalysisInput({
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
      }),
    );

    expect(analysis.intent).toBe("operational_logistics_scheduling");
    expect(analysis.intent).not.toBe("billing_question");
    expect(analysis.intent).not.toBe("where_is_my_order");
    expect(analysis.workType).toBe("customer_support");
    expect(analysis.urgency).toBe("medium");
    expect(analysis.actionability).toBe("review_needed");
    expect(analysis.replyNeeded).toBe("no");
    expect(analysis.risks).not.toContain("billing_discrepancy");
    expect(analysis.risks).not.toContain("customer_frustration");
    expect(analysis.nextAction).toBe(
      "Review scheduled pickup details and confirm whether the date/time works. Reply only if alternate scheduling or pickup details are needed.",
    );
    expect(analysis.nextAction.toLowerCase()).not.toContain("order number");
    expect(analysis.nextAction.toLowerCase()).not.toContain("invoice");
  });

  it("still classifies real billing issues as billing questions", () => {
    const analysis = analyzeEmail(
      buildAnalysisInput({
        subject: "Invoice charge issue for ORD-1002",
        body: "Hi support, we were charged twice on invoice INV-2241 for order ORD-1002. Can you review and issue a credit?",
      }),
    );

    expect(analysis.intent).toBe("billing_question");
    expect(analysis.workType).toBe("customer_support");
    expect(analysis.actionability).toBe("action_required");
    expect(analysis.replyNeeded).toBe("yes");
    expect(analysis.risks).toContain("billing_discrepancy");
  });

  it("treats a direct cancel request as actionable customer work", () => {
    const analysis = analyzeEmail(
      "Please cancel all of those PTs. Pls confirm once canceled.",
    );

    expect(analysis.intent).toBe("cancellation_request");
    expect(analysis.actionability).toBe("action_required");
    expect(analysis.replyNeeded).toBe("yes");
    expect(analysis.hasClearRequest).toBe(true);
  });

  it("treats a polite explicit cancellation request as actionable even when it starts with thanks", () => {
    const analysis = analyzeEmail(
      "Thanks for sending that over, Please cancel all of those PTs since the only style on them is TGWD15+MUL and we will put it on a new PO. Pls confirm once canceled",
    );

    expect(analysis.intent).toBe("cancellation_request");
    expect(analysis.summary.toLowerCase()).not.toContain("informational");
    expect(analysis.actionability).toBe("action_required");
    expect(analysis.replyNeeded).toBe("yes");
    expect(analysis.urgency).toBe("medium");
  });

  it("keeps a short polite request actionable when it contains a clear ask", () => {
    const analysis = analyzeEmail(
      "Could you please update the shipping address and confirm?",
    );

    expect(analysis.actionability).toBe("action_required");
    expect(analysis.replyNeeded).toBe("yes");
    expect(analysis.hasClearRequest).toBe(true);
  });

  it("does not classify internal operations language as where_is_my_order", () => {
    const analysis = analyzeEmail(
      "Please review the stock transfer and cycle count variance before we allocate inventory for this rework product.",
    );

    expect(analysis.intent).toBe("general_support");
    expect(analysis.workType).toBe("internal");
    expect(analysis.replyNeeded).toBe("no");
  });

  it("classifies EQISMART EOD reports as internal operational updates", () => {
    const analysis = analyzeEmail(
      buildAnalysisInput({
        subject: "EQISMART - EOD 05-19-26",
        body: [
          "All orders are on track.",
          "Tracking numbers are in Excel.",
          "Some orders are rolling over to process tomorrow.",
        ].join("\n"),
      }),
    );

    expect(analysis.intent).not.toBe("where_is_my_order");
    expect(analysis.intent).toBe("general_support");
    expect(analysis.workType).toBe("internal");
    expect(analysis.urgency).toBe("low");
    expect(analysis.actionability).toBe("no_action_needed");
    expect(analysis.replyNeeded).toBe("no");
    expect(analysis.risks).toEqual([]);
    expect(analysis.nextAction.toLowerCase()).not.toContain("order number");
  });

  it("follows the latest ask over older quoted informational content", () => {
    const analysis = analyzeEmail(
      [
        "Please cancel these and confirm once canceled.",
        "",
        "From: Operations",
        "Sent: earlier",
        "Subject: Prior note",
        "FYI only, no action needed right now.",
      ].join("\n"),
    );

    expect(analysis.intent).toBe("cancellation_request");
    expect(analysis.actionability).toBe("action_required");
    expect(analysis.replyNeeded).toBe("yes");
  });

  it("treats suspicious messages as non-customer-service work", () => {
    const analysis = analyzeEmail(
      "Phishing attempt reported for awareness. This looks suspicious and no customer reply is needed.",
    );

    expect(analysis.intent).toBe("general_support");
    expect(analysis.workType).toBe("suspicious");
    expect(analysis.replyNeeded).toBe("no");
  });

  it("uses order references from the subject before claiming no order number was provided", () => {
    const analysis = analyzeEmail(
      buildAnalysisInput({
        subject: "Tracking request for orders 162702 / 162740",
        body: "Please send an update on these shipments.",
      }),
    );

    expect(analysis.orderNumber).toBe("162702");
    expect(analysis.caseIdentifiers?.map((identifier) => identifier.value)).toEqual(["162702", "162740"]);
    expect(analysis.summary.toLowerCase()).not.toContain("did not provide");
    expect(analysis.nextAction.toLowerCase()).not.toContain("ask the customer for the order number");
  });

  it("treats stock transfer identifiers as usable case references", () => {
    const analysis = analyzeEmail(
      buildAnalysisInput({
        subject: "Status on stock transfer 1001-009313",
        body: "Can you confirm where this stands?",
      }),
    );

    expect(analysis.orderNumber).toBeUndefined();
    expect(analysis.caseIdentifiers?.[0]).toMatchObject({
      value: "1001-009313",
      kind: "transfer",
      source: "subject",
    });
    expect(analysis.nextAction.toLowerCase()).not.toContain("ask");
    expect(analysis.nextAction.toLowerCase()).not.toContain("order number");
  });

  it("uses rework identifiers from the body to avoid false missing-order language", () => {
    const analysis = analyzeEmail(
      [
        "Please review rework R0130-26LA and send the latest status.",
        "",
        "From: Prior Sender",
        "Sent: earlier",
        "Original thread below",
      ].join("\n"),
    );

    expect(analysis.caseIdentifiers?.some((identifier) => identifier.value === "R0130-26LA")).toBe(true);
    expect(analysis.summary.toLowerCase()).not.toContain("did not provide");
    expect(analysis.nextAction.toLowerCase()).not.toContain("order number");
  });

  it("raises urgency for urgent ship-today confirmation requests", () => {
    const analysis = analyzeEmail(
      [
        "HOT! Please confirm this will be shipping today.",
        "We need these shipped today via standard overnight.",
      ].join(" "),
    );

    expect(analysis.intent).toBe("where_is_my_order");
    expect(analysis.actionability).toBe("action_required");
    expect(analysis.urgency).toBe("high");
    expect(analysis.summary.toLowerCase()).toContain("shipping or delivery timing confirmation");
    expect(analysis.nextAction.toLowerCase()).toContain("ship-timing request");
  });

  it("keeps normal shipping confirmation asks actionable without forcing high urgency", () => {
    const analysis = analyzeEmail(
      "Please confirm the current shipping status for order ORD-1002 when you have a chance.",
    );

    expect(analysis.intent).toBe("where_is_my_order");
    expect(analysis.actionability).toBe("action_required");
    expect(analysis.urgency).toBe("medium");
  });

  it("keeps legitimate delayed shipment requests actionable", () => {
    const analysis = analyzeEmail(
      buildAnalysisInput({
        subject: "Delayed shipment for ORD-1002",
        body: "Hi support, our shipment for order ORD-1002 is delayed and the tracking has not moved. Can you send an updated ETA?",
      }),
    );

    expect(analysis.intent).toBe("where_is_my_order");
    expect(analysis.workType).toBe("customer_support");
    expect(analysis.actionability).toBe("action_required");
    expect(analysis.replyNeeded).toBe("yes");
    expect(analysis.risks).toContain("delay_or_no_tracking_update");
  });

  it("keeps awareness-only messages low urgency even when older quoted text was urgent", () => {
    const analysis = analyzeEmail(
      [
        "FYI only. No action needed right now.",
        "",
        "From: Customer",
        "Sent: earlier",
        "Subject: Earlier urgent thread",
        "HOT! We need these shipped today via standard overnight.",
      ].join("\n"),
    );

    expect(analysis.urgency).toBe("low");
    expect(analysis.actionability).toBe("no_action_needed");
  });

  it("does not inherit urgency from quoted history in short continuation replies", () => {
    const analysis = analyzeEmail(
      [
        "Thanks.",
        "",
        "From: Customer",
        "Sent: earlier",
        "Subject: Earlier urgent thread",
        "HOT! Please confirm this will be shipping today.",
      ].join("\n"),
    );

    expect(analysis.isThreadContinuation).toBe(true);
    expect(analysis.urgency).toBe("low");
    expect(analysis.actionability).toBe("review_needed");
  });

  it("keeps vendor coordination de-emphasized even when overnight language appears", () => {
    const analysis = analyzeEmail(
      "FYI vendor portal setup note for standard overnight settings. No action needed right now.",
    );

    expect(analysis.workType).toBe("vendor");
    expect(analysis.urgency).toBe("low");
    expect(analysis.replyNeeded).toBe("no");
  });

  it("detects inbound logistics confirmation requests as actionable reply-needed work", () => {
    const analysis = analyzeEmail(
      [
        "Inbound container ETA 4/3. Shipment reference INBSHIP-2048.",
        "Please confirm receipt of this email and confirm once the container has dropped.",
      ].join(" "),
    );

    expect(analysis.intent).toBe("operational_confirmation");
    expect(analysis.actionability).toBe("action_required");
    expect(analysis.replyNeeded).toBe("yes");
    expect(analysis.hasConfirmationRequest).toBe(true);
    expect(analysis.hasLogisticsContext).toBe(true);
  });

  it("uses logistics confirmation wording instead of bland general support summaries", () => {
    const analysis = analyzeEmail(
      [
        "Inbound container details below.",
        "Appointment is scheduled for tomorrow at 8am and trailer is assigned.",
        "Please confirm receipt and advise once complete.",
      ].join(" "),
    );

    expect(analysis.summary.toLowerCase()).toContain("requested confirmation");
    expect(analysis.nextAction.toLowerCase()).toContain("acknowledge receipt");
    expect(analysis.nextAction.toLowerCase()).toContain("confirm back once");
  });

  it("raises urgency for time-bound logistics confirmation requests", () => {
    const analysis = analyzeEmail(
      [
        "Container 1234567 has a drop ETA for tomorrow morning.",
        "Please confirm receipt and confirm once dropped.",
      ].join(" "),
    );

    expect(analysis.intent).toBe("operational_confirmation");
    expect(analysis.urgency).toBe("high");
  });

  it("does not over-promote logistics notices that have no actual ask", () => {
    const analysis = analyzeEmail(
      "Inbound container ETA tomorrow morning. Appointment is scheduled and driver has been dispatched for the drop.",
    );

    expect(analysis.intent).toBe("general_support");
    expect(analysis.hasConfirmationRequest).toBe(false);
    expect(analysis.actionability).not.toBe("action_required");
    expect(analysis.urgency).toBe("medium");
  });
});
