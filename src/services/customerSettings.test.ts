import { describe, expect, it } from "vitest";
import {
  findConflictingCustomerDomain,
  getVisibleCustomersForSettings,
  isBlockedCustomerDomain,
  normalizeCustomerDomains,
  getSavedCustomerDisplayName,
  normalizeCustomerEmails,
  normalizeSavedCustomer,
} from "./customerSettings";
import type { RepProfile } from "../types/actionDesk";

describe("normalizeCustomerEmails", () => {
  it("normalizes to lowercase and removes duplicates case-insensitively", () => {
    expect(
      normalizeCustomerEmails([
        " Ops@Acme.com ",
        "",
        "ops@acme.com",
        "support@acme.com",
      ]),
    ).toEqual(["ops@acme.com", "support@acme.com"]);
  });
});

describe("normalizeCustomerDomains", () => {
  it("normalizes to lowercase, trims whitespace, and removes duplicates", () => {
    expect(
      normalizeCustomerDomains([
        " Nike.com ",
        "@nike.com",
        "https://www.nike.com/orders",
        "nike.com",
      ]),
    ).toEqual(["nike.com"]);
  });
});

describe("normalizeSavedCustomer", () => {
  it("keeps email-only customers when no name is provided", () => {
    expect(
      normalizeSavedCustomer({
        id: "customer-1",
        name: "   ",
        emails: [" Ops@Acme.com "],
      }),
    ).toEqual({
      id: "customer-1",
      name: "ops@acme.com",
      email: "ops@acme.com",
      emails: ["ops@acme.com"],
      domains: [],
      assignedCsrId: "",
      assignedCSRs: [],
      isActive: true,
    });
  });

  it("keeps name-only customers when no emails are provided", () => {
    expect(
      normalizeSavedCustomer({
        id: "customer-2",
        name: "  Acme Corp  ",
        emails: [],
      }),
    ).toEqual({
      id: "customer-2",
      name: "Acme Corp",
      emails: [],
      domains: [],
      assignedCsrId: "",
      assignedCSRs: [],
      isActive: true,
    });
  });

  it("keeps domain-only customers when no name or emails are provided", () => {
    expect(
      normalizeSavedCustomer({
        id: "customer-3",
        name: "  ",
        emails: [],
        domains: [" Nike.com "],
      }),
    ).toEqual({
      id: "customer-3",
      name: "nike.com",
      emails: [],
      domain: "nike.com",
      domains: ["nike.com"],
      assignedCsrId: "",
      assignedCSRs: [],
      isActive: true,
    });
  });
});

describe("getSavedCustomerDisplayName", () => {
  it("falls back to the first email when the name is blank", () => {
    expect(
      getSavedCustomerDisplayName({
        name: " ",
        emails: ["support@acme.com"],
      }),
    ).toBe("support@acme.com");
  });

  it("falls back to the first domain when the name and emails are blank", () => {
    expect(
      getSavedCustomerDisplayName({
        name: " ",
        emails: [],
        domains: ["nike.com"],
      }),
    ).toBe("nike.com");
  });
});

describe("getVisibleCustomersForSettings", () => {
  const customers = [
    { id: "1", name: "Acme", emails: ["ops@acme.com"], domains: ["acme.com"], ownerRepId: "rep-1", locationId: "apexpress-1" },
    { id: "2", name: "Beta", emails: ["ops@beta.com"], domains: ["beta.com"], ownerRepId: "rep-2", locationId: "worldpackusa" },
  ];
  const rep: RepProfile = {
    id: "rep-1",
    name: "Rep One",
    initials: "RO",
    email: "rep1@apexpress.com",
    role: "rep",
    locationId: "apexpress-1",
  };
  const supervisor: RepProfile = {
    ...rep,
    id: "supervisor-1",
    role: "supervisor",
  };
  const admin: RepProfile = {
    ...rep,
    id: "admin-1",
    role: "admin",
    locationId: undefined,
  };

  it("shows only assigned customers for reps", () => {
    expect(
      getVisibleCustomersForSettings(customers, rep, false),
    ).toEqual([customers[0]]);
  });

  it("shows same-location customers for supervisors", () => {
    expect(
      getVisibleCustomersForSettings(customers, supervisor, true),
    ).toEqual([customers[0]]);
  });

  it("shows all customers for admins", () => {
    expect(
      getVisibleCustomersForSettings(customers, admin, true),
    ).toEqual(customers);
  });
});

describe("customer domain validation", () => {
  const customers = [
    { id: "1", name: "Nike", emails: [], domains: ["nike.com"], ownerRepId: "rep-1" },
    { id: "2", name: "Acme", emails: [], domains: ["acme.com"], ownerRepId: "rep-2" },
  ];

  it("flags blocked public domains", () => {
    expect(isBlockedCustomerDomain(" Gmail.com ")).toBe(true);
    expect(isBlockedCustomerDomain("nike.com")).toBe(false);
  });

  it("finds conflicting domains claimed by another customer", () => {
    expect(findConflictingCustomerDomain(customers, [" NIKE.com "])).toEqual({
      domain: "nike.com",
      customerName: "Nike",
    });
  });
});
