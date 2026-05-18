import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findCustomerMatch, getCustomerMatchSourceLabel } from "./customerMatching";
import type { EmailItem, SavedCustomer } from "../types/actionDesk";

const baseEmail: EmailItem = {
  id: "email-1",
  senderName: "Acme Logistics",
  senderEmail: "ops@acme.com",
  subject: "Need an update for the new Acme shipment",
  receivedAt: "2026-04-01T10:00:00Z",
  body: "Customer asked whether Acme order ORD-1001 has shipped yet.",
};

const customers: SavedCustomer[] = [
  {
    id: "customer-1",
    name: "Acme",
    emails: ["ops@acme.com"],
    domains: ["acme.com"],
  },
  {
    id: "customer-2",
    name: "Beta",
    emails: ["help@beta.com"],
    domains: ["beta.com"],
  },
  {
    id: "customer-3",
    name: "Nike",
    emails: [],
    domains: [" nike.com "],
  },
];

describe("findCustomerMatch", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prefers sender domain matches as the primary customer identifier", () => {
    const match = findCustomerMatch(baseEmail, customers);

    expect(match).toEqual({
      customerId: "customer-1",
      customerName: "Acme",
      matchedOn: "domain",
      matchedValue: "acme.com",
    });
    expect(infoSpy).toHaveBeenCalledWith(
      "[Action Desk diagnostics] customerMatchByDomain",
      expect.objectContaining({
        customerId: "customer-1",
        matchedValue: "acme.com",
      }),
    );
  });

  it("matches configured customer names in the subject", () => {
    const match = findCustomerMatch(
      {
        ...baseEmail,
        senderEmail: "unknown@example.com",
        senderName: "Shipping Team",
        subject: "Shipment update request for Acme",
        body: "No customer name in the body.",
      },
      customers,
    );

    expect(match?.matchedOn).toBe("subject");
    expect(match?.customerName).toBe("Acme");
  });

  it("matches sender domain when the customer has no exact emails", () => {
    const match = findCustomerMatch(
      {
        ...baseEmail,
        senderName: "John Smith",
        senderEmail: "john@NIKE.com",
        subject: "Need shipment help",
        body: "Please help with my order.",
      },
      customers,
    );

    expect(match).toEqual({
      customerId: "customer-3",
      customerName: "Nike",
      matchedOn: "domain",
      matchedValue: "nike.com",
    });
  });

  it("matches scalar customer.domain when customer.email is null and emails is empty", () => {
    const match = findCustomerMatch(
      {
        ...baseEmail,
        senderEmail: "buyer@domainonly.com",
        senderName: "Domain Only Buyer",
        subject: "Need shipment help",
        body: "Please help with my order.",
      },
      [
        {
          id: "customer-domain-only",
          name: "Domain Only",
          email: null,
          emails: [],
          domain: "domainonly.com",
          domains: [],
        } as unknown as SavedCustomer,
      ],
    );

    expect(match).toEqual({
      customerId: "customer-domain-only",
      customerName: "Domain Only",
      matchedOn: "domain",
      matchedValue: "domainonly.com",
    });
  });

  it("does not match blocked public sender domains", () => {
    const match = findCustomerMatch(
      {
        ...baseEmail,
        senderName: "Personal Inbox",
        senderEmail: "customer@gmail.com",
        subject: "Need shipment help",
        body: "Please help with my order.",
      },
      [
        {
          id: "customer-public-domain",
          name: "Personal Contact",
          emails: [],
          domains: ["gmail.com"],
        },
      ],
    );

    expect(match).toBeUndefined();
  });

  it("keeps domain matches ahead of exact email matches", () => {
    const match = findCustomerMatch(
      {
        ...baseEmail,
        senderEmail: "ops@acme.com",
        senderName: "Nike Operations",
        subject: "Nike shipment issue",
      },
      [
        {
          id: "customer-email-only",
          name: "Email Customer",
          emails: ["ops@acme.com"],
          domains: [],
        },
        {
          id: "customer-domain",
          name: "Domain Customer",
          emails: [],
          domains: ["acme.com"],
        },
      ],
    );

    expect(match?.matchedOn).toBe("domain");
    expect(match?.customerName).toBe("Domain Customer");
  });

  it("uses subject before body when needed", () => {
    const match = findCustomerMatch(
      {
        ...baseEmail,
        senderEmail: "unknown@example.com",
        senderName: "Shipping Team",
        body: "No customer keyword here.",
      },
      customers,
    );

    expect(match?.matchedOn).toBe("subject");
  });

  it("matches configured customer names in the body", () => {
    const match = findCustomerMatch(
      {
        ...baseEmail,
        senderEmail: "hsalas@apexpress.com",
        senderName: "Hector Salas",
        subject: "Please review",
        body: "The customer Meliibaby asked for an order status update.",
      },
      [
        {
          id: "customer-meliibaby",
          name: "Meliibaby",
          emails: [],
          domains: [],
        },
      ],
    );

    expect(match).toMatchObject({
      customerId: "customer-meliibaby",
      matchedOn: "body",
    });
  });

  it("matches configured customer names in thread text", () => {
    const match = findCustomerMatch(
      {
        ...baseEmail,
        senderEmail: "hsalas@apexpress.com",
        senderName: "Hector Salas",
        subject: "Please review",
        body: "Looping in the support mailbox.",
      },
      [
        {
          id: "customer-meliibaby",
          name: "Meliibaby",
          emails: [],
          domains: [],
        },
      ],
      {
        threadText: "Earlier customer message: Meliibaby needs the POD for ORD-1001.",
      },
    );

    expect(match).toMatchObject({
      customerId: "customer-meliibaby",
      matchedOn: "thread",
    });
  });

  it("does not match generic configured words from message text", () => {
    const match = findCustomerMatch(
      {
        ...baseEmail,
        senderEmail: "unknown@example.com",
        senderName: "Unknown Sender",
        subject: "Customer needs support",
        body: "The customer is asking for order support.",
      },
      [
        {
          id: "customer-generic",
          name: "Customer",
          emails: [],
          domains: [],
        },
      ],
    );

    expect(match).toBeUndefined();
    expect(infoSpy).toHaveBeenCalledWith(
      "[Action Desk diagnostics] noCustomerMatch",
      expect.objectContaining({
        emailId: "email-1",
        senderDomain: "example.com",
      }),
    );
  });

  it("matches scalar customer.email when no domain match is present", () => {
    const match = findCustomerMatch(
      {
        ...baseEmail,
        senderEmail: "buyer@personalrelay.com",
        senderName: "Relay Buyer",
        subject: "Need shipment help",
        body: "Please help with my order.",
      },
      [
        {
          id: "customer-email-scalar",
          name: "Scalar Email",
          email: "buyer@personalrelay.com",
          emails: [],
          domains: [],
        },
      ],
    );

    expect(match).toEqual({
      customerId: "customer-email-scalar",
      customerName: "Scalar Email",
      matchedOn: "email",
      matchedValue: "buyer@personalrelay.com",
    });
    expect(infoSpy).toHaveBeenCalledWith(
      "[Action Desk diagnostics] customerMatchByEmail",
      expect.objectContaining({
        customerId: "customer-email-scalar",
        matchedValue: "buyer@personalrelay.com",
      }),
    );
  });

  it("formats match source labels for the UI", () => {
    expect(getCustomerMatchSourceLabel("email")).toBe("Email");
    expect(getCustomerMatchSourceLabel("domain")).toBe("Domain");
    expect(getCustomerMatchSourceLabel("subject")).toBe("Subject");
    expect(getCustomerMatchSourceLabel("body")).toBe("Body");
    expect(getCustomerMatchSourceLabel("thread")).toBe("Thread");
  });
});
