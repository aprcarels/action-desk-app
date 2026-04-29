import { afterEach, describe, expect, it, vi } from "vitest";
import {
  filterRelevantGroupDeliveredEmails,
  getConfiguredGroupInboxAddresses,
  isRelevantGroupDeliveredEmail,
} from "./inboxFiltering";
import type { RawInboxEmail } from "../types/inboxSource";

function buildRawEmail(overrides?: Partial<RawInboxEmail>): RawInboxEmail {
  return {
    id: "email-1",
    externalId: "email-1",
    provider: "outlook_graph",
    subject: "Need an order update",
    fromName: "Customer",
    fromEmail: "customer@example.com",
    receivedAt: "2026-04-24T12:00:00.000Z",
    bodyText: "Can you help with this order?",
    previewText: "Can you help with this order?",
    ...overrides,
  };
}

describe("inboxFiltering", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("recognizes messages delivered to the configured group address in the signed-in user's mailbox", () => {
    expect(
      isRelevantGroupDeliveredEmail(
        buildRawEmail({
          toRecipients: ["csr1@apexpress.com", "ecomcsr@apexpress.com"],
        }),
      ),
    ).toBe(true);
  });

  it("checks cc recipients and internet headers before falling back to message text", () => {
    expect(
      isRelevantGroupDeliveredEmail(
        buildRawEmail({
          ccRecipients: ["ecomcsr@apexpress.com"],
        }),
      ),
    ).toBe(true);

    expect(
      isRelevantGroupDeliveredEmail(
        buildRawEmail({
          toRecipients: [],
          ccRecipients: [],
          internetMessageHeaders: [
            {
              name: "Delivered-To",
              value: "ecomcsr@apexpress.com",
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("falls back to subject/body only when recipient metadata is not available", () => {
    expect(
      isRelevantGroupDeliveredEmail(
        buildRawEmail({
          subject: "Customer note for ecomcsr@apexpress.com",
          toRecipients: undefined,
          ccRecipients: undefined,
          internetMessageHeaders: undefined,
        }),
      ),
    ).toBe(true);
  });

  it("does not hard-filter messages when group matching fails", () => {
    const filtered = filterRelevantGroupDeliveredEmails([
      buildRawEmail({
        id: "email-1",
        toRecipients: ["ecomcsr@apexpress.com"],
      }),
      buildRawEmail({
        id: "email-2",
        toRecipients: ["someoneelse@apexpress.com"],
      }),
    ]);

    expect(filtered.map((email) => email.id)).toEqual(["email-1", "email-2"]);
  });

  it("supports env-configured group inbox addresses", () => {
    vi.stubEnv("VITE_GROUP_INBOX_ADDRESSES", "customgroup@apexpress.com");

    expect(getConfiguredGroupInboxAddresses()).toEqual([
      "customgroup@apexpress.com",
    ]);
    expect(
      isRelevantGroupDeliveredEmail(
        buildRawEmail({
          toRecipients: ["customgroup@apexpress.com"],
        }),
      ),
    ).toBe(true);
    expect(
      isRelevantGroupDeliveredEmail(
        buildRawEmail({
          toRecipients: ["ecomcsr@apexpress.com"],
        }),
      ),
    ).toBe(false);
  });
});
