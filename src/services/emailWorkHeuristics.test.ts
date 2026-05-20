import { describe, expect, it } from "vitest";
import {
  extractLatestMessageText,
  hasActualBillingQuestion,
  hasClearRequest,
  hasOperationalLogisticsFailureOrEscalationSignals,
  hasOperationalLogisticsScheduleConflict,
  hasOperationalLogisticsSchedulingSignals,
  isInternalOperationalReport,
  isLikelyThreadContinuation,
  isVendorSalesOutreach,
} from "./emailWorkHeuristics";

describe("emailWorkHeuristics", () => {
  it("extracts the newest visible message before quoted thread headers", () => {
    const email = [
      "Thanks for sending that over, Please cancel all of those PTs since the only style on them is TGWD15+MUL and we will put it on a new PO. Pls confirm once canceled",
      "",
      "From: Support Team",
      "Sent: Monday, April 1, 2026 8:00 AM",
      "Subject: Prior thread",
      "FYI only.",
    ].join("\n");

    const latestMessage = extractLatestMessageText(email);

    expect(latestMessage).toContain("Please cancel all of those PTs");
    expect(latestMessage).not.toContain("FYI only");
    expect(hasClearRequest(latestMessage)).toBe(true);
  });

  it("keeps short continuation replies suppressible when they have no clear ask", () => {
    const email = [
      "I just sent it in a separate email.",
      "",
      "From: Previous Sender",
      "Sent: earlier",
      "Subject: Earlier thread",
    ].join("\n");

    const latestMessage = extractLatestMessageText(email);

    expect(isLikelyThreadContinuation(latestMessage, email)).toBe(true);
    expect(hasClearRequest(latestMessage)).toBe(false);
  });

  it("detects vendor sales outreach without blocking real customer shipment asks", () => {
    const salesOutreach = [
      "Most IT teams recover less than half of devices after offboarding.",
      "Unduit helps companies reach a 98% recovery rate and simplify new hire deployment.",
      "Can I show you what it looks like for your IT?",
    ].join(" ");
    const customerAsk =
      "Hi support, can you send the shipment status for order ORD-1002? The tracking number has not updated.";

    expect(isVendorSalesOutreach(salesOutreach)).toBe(true);
    expect(isVendorSalesOutreach(customerAsk)).toBe(false);
  });

  it("detects industrial hardware vendor outreach as sales outreach", () => {
    const duagonOutreach = [
      "Duagon builds made in America hardware for railroad environments where durability matters.",
      "I am a Technical Sales Manager and wanted to see if AP Express is open to a quick chat.",
    ].join(" ");

    expect(isVendorSalesOutreach(duagonOutreach)).toBe(true);
  });

  it("detects internal EOD operational reports without treating tracking words as customer asks", () => {
    const eodReport = [
      "EQISMART - EOD 05-19-26",
      "All orders are on track. Tracking numbers are in Excel.",
      "Some orders are rolling over to process tomorrow.",
    ].join("\n");

    expect(isInternalOperationalReport(eodReport)).toBe(true);
    expect(hasClearRequest(eodReport)).toBe(false);
  });

  it("detects Walmart MPU scheduling as operational logistics, not billing", () => {
    const walmartScheduling = [
      "MPU LOAD 93215119 - SCHEDULING",
      "This is a scheduled load for Multi Pick Up.",
      "Stop 1 pickup time is 08:00 and Stop 2 pickup time is 11:30.",
      "Carrier pickup date: 05/21/26. Pickup number: 93215119.",
      "Routing status: routed. CDD 05/24/26.",
      "Reply if date/time does not work.",
      "TONU / OTIF charges may apply if loading and transit times are missed.",
    ].join(" ");

    expect(hasOperationalLogisticsSchedulingSignals(walmartScheduling)).toBe(true);
    expect(hasOperationalLogisticsScheduleConflict(walmartScheduling)).toBe(false);
    expect(hasOperationalLogisticsFailureOrEscalationSignals(walmartScheduling)).toBe(false);
    expect(hasActualBillingQuestion(walmartScheduling)).toBe(false);
  });
});
