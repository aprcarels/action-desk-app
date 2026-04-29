import { describe, expect, it } from "vitest";
import {
  getOpenInOutlookFallbackMessage,
  getOutlookOpenTarget,
  hasExactOutlookMessageLink,
} from "./openInOutlook";
import type { EmailItem } from "../types/actionDesk";

function buildEmail(overrides?: Partial<EmailItem>): EmailItem {
  return {
    id: "email-1",
    senderName: "Rita Pardee",
    senderEmail: "ritap@allstarmg.com",
    subject: "Stock Transfer #1001-009351",
    receivedAt: "2026-04-02T12:19:00Z",
    body: "Please confirm this will get shipped out today to deliver tomorrow.",
    ...overrides,
  };
}

describe("openInOutlook", () => {
  it("uses the exact Outlook webLink when it exists", () => {
    expect(
      getOutlookOpenTarget(
        buildEmail({
          outlookWebLink:
            "https://outlook.office.com/mail/deeplink/read/email-1",
        }),
      ),
    ).toEqual({
      type: "exact",
      url: "https://outlook.office.com/mail/deeplink/read/email-1",
    });
    expect(
      hasExactOutlookMessageLink(
        buildEmail({
          outlookWebLink:
            "https://outlook.office.com/mail/deeplink/read/email-1",
        }),
      ),
    ).toBe(true);
  });

  it("returns a helpful fallback message when no exact message link exists", () => {
    expect(getOutlookOpenTarget(buildEmail())).toEqual({
      type: "missing_exact_link",
      message: getOpenInOutlookFallbackMessage(),
    });
    expect(hasExactOutlookMessageLink(buildEmail())).toBe(false);
  });
});
