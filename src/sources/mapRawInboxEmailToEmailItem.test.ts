import { describe, expect, it } from "vitest";
import { mapRawInboxEmailToEmailItem } from "./mapRawInboxEmailToEmailItem";

describe("mapRawInboxEmailToEmailItem", () => {
  it("keeps previewText for queue display while falling back to preview for body only when bodyText is empty", () => {
    const item = mapRawInboxEmailToEmailItem({
      id: "email-1",
      externalId: "email-1",
      provider: "outlook_graph",
      subject: "Delay concern",
      fromName: "",
      fromEmail: "customer@example.com",
      receivedAt: "2026-04-01T10:00:00Z",
      bodyText: "",
      previewText: "Carrier delay preview",
    });

    expect(item.previewText).toBe("Carrier delay preview");
    expect(item.body).toBe("Carrier delay preview");
    expect(item.senderName).toBe("customer@example.com");
    expect(item.source).toBe("outlook_graph");
  });
});
