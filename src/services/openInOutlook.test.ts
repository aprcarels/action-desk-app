import { describe, expect, it } from "vitest";
import { buildOutlookSearchUrl, canOpenInOutlook } from "./openInOutlook";
import type { EmailItem, ProcessedEmail } from "../types/actionDesk";

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
  it("builds an Outlook search url from subject and sender", () => {
    const url = buildOutlookSearchUrl(buildEmail());

    expect(url).toBe(
      "https://outlook.office.com/mail/?search=subject%3A%22Stock%20Transfer%20%231001-009351%22%20from%3A%22ritap%40allstarmg.com%22",
    );
  });

  it("falls back to sender name when sender email is missing", () => {
    const processedEmail: ProcessedEmail = {
      email: buildEmail({
        senderEmail: "",
        senderName: "Rita Pardee",
      }),
      status: "failed",
      processingError: "Failed",
      issueCount: 0,
      previewText: "Preview",
    };
    const url = buildOutlookSearchUrl(processedEmail);

    expect(url).toContain(encodeURIComponent('from:"Rita Pardee"'));
  });

  it("can disable opening when both subject and sender are missing", () => {
    expect(
      canOpenInOutlook(
        buildEmail({
          subject: "",
          senderEmail: "",
          senderName: "",
        }),
      ),
    ).toBe(false);
  });
});
