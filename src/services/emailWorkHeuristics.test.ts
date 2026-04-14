import { describe, expect, it } from "vitest";
import {
  extractLatestMessageText,
  hasClearRequest,
  isLikelyThreadContinuation,
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
});
