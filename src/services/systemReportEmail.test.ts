import { describe, expect, it } from "vitest";
import {
  isSuppressibleSystemReportMissingBodyFailure,
  isSystemReportEmailItem,
} from "./systemReportEmail";
import type { ProcessedEmail } from "../types/actionDesk";

function buildFailedItem(overrides?: Partial<ProcessedEmail>): ProcessedEmail {
  return {
    email: {
      id: "email-1",
      senderName: "Sender",
      senderEmail: "sender@example.com",
      subject: "Need help",
      receivedAt: "2026-04-21T11:15:00.000Z",
      body: "",
      previewText: "",
    },
    status: "failed",
    result: undefined,
    processingError: "This email could not be analyzed because the body is missing.",
    issueCount: 0,
    previewText: "",
    ...overrides,
  };
}

describe("systemReportEmail", () => {
  it("identifies AP Express system report missing-body failures as suppressible", () => {
    const item = buildFailedItem({
      email: {
        ...buildFailedItem().email,
        senderName: "AP Express Systems",
        senderEmail: "systems@apexpress.com",
        subject: "OutboundYesterdayTracking_Summary",
      },
    });

    expect(isSystemReportEmailItem(item)).toBe(true);
    expect(isSuppressibleSystemReportMissingBodyFailure(item)).toBe(true);
  });

  it("keeps customer missing-body failures visible", () => {
    expect(isSystemReportEmailItem(buildFailedItem())).toBe(false);
    expect(isSuppressibleSystemReportMissingBodyFailure(buildFailedItem())).toBe(false);
  });
});
