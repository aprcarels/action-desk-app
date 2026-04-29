import { describe, expect, it } from "vitest";
import { normalizeGraphMessagesResponse } from "./inboxNormalizer";

describe("normalizeGraphMessagesResponse", () => {
  it("prefers cleaned full HTML body content for bodyText while preserving previewText", () => {
    const result = normalizeGraphMessagesResponse({
      value: [
        {
          id: "msg-1",
          conversationId: "thread-1",
          subject: "Order update",
          receivedDateTime: "2026-04-01T10:15:00-07:00",
          bodyPreview: "Short preview from Graph",
          body: {
            contentType: "html",
            content:
              "<div>Hello team,<br><strong>Order ORD-1001</strong> is delayed.</div><div>Thanks,<br>Sam</div>",
          },
          from: {
            emailAddress: {
              name: "Sam Customer",
              address: "sam@example.com",
            },
          },
          webLink: "https://outlook.office.com/mail/deeplink/read/msg-1",
          toRecipients: [
            {
              emailAddress: {
                address: "ecomcsr@apexpress.com",
              },
            },
          ],
          ccRecipients: [
            {
              emailAddress: {
                address: "csr1@apexpress.com",
              },
            },
          ],
          internetMessageHeaders: [
            {
              name: "Delivered-To",
              value: "ecomcsr@apexpress.com",
            },
          ],
        },
      ],
    });

    expect(result.nextCursor).toBeUndefined();
    expect(result.emails).toHaveLength(1);
    expect(result.emails[0]).toMatchObject({
      id: "msg-1",
      externalId: "msg-1",
      provider: "outlook_graph",
      threadId: "thread-1",
      subject: "Order update",
      fromName: "Sam Customer",
      fromEmail: "sam@example.com",
      previewText: "Short preview from Graph",
      outlookWebLink: "https://outlook.office.com/mail/deeplink/read/msg-1",
      toRecipients: ["ecomcsr@apexpress.com"],
      ccRecipients: ["csr1@apexpress.com"],
      internetMessageHeaders: [
        {
          name: "Delivered-To",
          value: "ecomcsr@apexpress.com",
        },
      ],
    });
    expect(result.emails[0].receivedAt).toBe("2026-04-01T17:15:00.000Z");
    expect(result.emails[0].bodyText).toContain("Hello team,");
    expect(result.emails[0].bodyText).toContain("Order ORD-1001");
    expect(result.emails[0].bodyText).not.toContain("<strong>");
  });

  it("falls back to bodyPreview when body content is missing", () => {
    const result = normalizeGraphMessagesResponse({
      value: [
        {
          id: "msg-2",
          bodyPreview: "Fallback preview text",
          body: {
            contentType: "html",
            content: "",
          },
        },
      ],
    });

    expect(result.emails[0]).toMatchObject({
      bodyText: "Fallback preview text",
      previewText: "Fallback preview text",
      fromName: "Unknown sender",
      fromEmail: "",
      receivedAt: "",
      subject: "(no subject)",
    });
  });

  it("falls back to sender email when sender name is missing", () => {
    const result = normalizeGraphMessagesResponse({
      value: [
        {
          id: "msg-3",
          bodyPreview: "Shipment update",
          from: {
            emailAddress: {
              address: "ops@example.com",
            },
          },
        },
      ],
    });

    expect(result.emails[0].fromName).toBe("ops@example.com");
    expect(result.emails[0].fromEmail).toBe("ops@example.com");
  });

  it("keeps malformed receivedDateTime without crashing", () => {
    const result = normalizeGraphMessagesResponse({
      value: [
        {
          id: "msg-4",
          receivedDateTime: "not-a-real-date",
          bodyPreview: "Tracking stalled",
        },
      ],
    });

    expect(result.emails[0].receivedAt).toBe("not-a-real-date");
  });

  it("returns a valid RawInboxEmail shape when body and preview are empty", () => {
    const result = normalizeGraphMessagesResponse({
      value: [
        {
          id: "msg-5",
          bodyPreview: "",
          body: {
            contentType: "text",
            content: "",
          },
          from: {
            emailAddress: {},
          },
        },
      ],
    });

    expect(result.emails[0]).toEqual({
      id: "msg-5",
      externalId: "msg-5",
      provider: "outlook_graph",
      threadId: undefined,
      subject: "(no subject)",
      fromName: "Unknown sender",
      fromEmail: "",
      receivedAt: "",
      bodyText: "",
      bodyHtml: "",
      previewText: undefined,
    });
  });
});
