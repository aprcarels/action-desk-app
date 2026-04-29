import { describe, expect, it } from "vitest";
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
  it("prefers exact sender email matches first", () => {
    const match = findCustomerMatch(baseEmail, customers);

    expect(match).toEqual({
      customerId: "customer-1",
      customerName: "Acme",
      matchedOn: "sender_email",
      matchedValue: "ops@acme.com",
    });
  });

  it("falls back to sender name before subject and body", () => {
    const match = findCustomerMatch(
      {
        ...baseEmail,
        senderEmail: "unknown@example.com",
        subject: "Shipment update request",
        body: "No customer name in the body.",
      },
      customers,
    );

    expect(match?.matchedOn).toBe("sender_name");
    expect(match?.customerName).toBe("Acme");
  });

  it("matches sender domain after exact email and before name fallbacks", () => {
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
      matchedOn: "sender_domain",
      matchedValue: "nike.com",
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

  it("keeps exact email matches ahead of domain matches", () => {
    const match = findCustomerMatch(
      {
        ...baseEmail,
        senderEmail: "ops@acme.com",
        senderName: "Nike Operations",
        subject: "Nike shipment issue",
      },
      customers,
    );

    expect(match?.matchedOn).toBe("sender_email");
    expect(match?.customerName).toBe("Acme");
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

  it("formats match source labels for the UI", () => {
    expect(getCustomerMatchSourceLabel("sender_email")).toBe("Sender Email");
    expect(getCustomerMatchSourceLabel("sender_domain")).toBe("Sender Domain");
    expect(getCustomerMatchSourceLabel("sender_name")).toBe("Sender Name");
    expect(getCustomerMatchSourceLabel("subject")).toBe("Subject");
    expect(getCustomerMatchSourceLabel("body")).toBe("Body");
  });
});
