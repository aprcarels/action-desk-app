import { afterEach, describe, expect, it, vi } from "vitest";
import { OutlookGraphInboxRepository } from "./outlookGraphInboxRepository";

describe("OutlookGraphInboxRepository", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads from the signed-in user's mailbox via /me/messages and preserves exact message links", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [
          {
            id: "msg-1",
            conversationId: "thread-1",
            subject: "Group queue item",
            receivedDateTime: "2026-04-24T10:00:00Z",
            bodyPreview: "Need help",
            body: {
              contentType: "text",
              content: "Need help",
            },
            from: {
              emailAddress: {
                name: "Customer",
                address: "customer@example.com",
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
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const repository = new OutlookGraphInboxRepository();
    const result = await repository.listMessages({
      authorization: "Bearer test-token",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      "https://graph.microsoft.com/v1.0/me/messages?",
    );
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("/users/");
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("ecomcsr@apexpress.com");
    expect(result.emails[0]?.outlookWebLink).toBe(
      "https://outlook.office.com/mail/deeplink/read/msg-1",
    );
  });
});
