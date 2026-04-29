import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CustomerListManager } from "./CustomerListManager";
import type { RepProfile, SavedCustomer } from "../types/actionDesk";

const reps: RepProfile[] = [
  {
    id: "rep-1",
    name: "Mia Johnson",
    initials: "MJ",
    email: "mia@example.com",
    role: "rep",
  },
  {
    id: "rep-2",
    name: "Logan Chen",
    initials: "LC",
    email: "logan@example.com",
    role: "supervisor",
  },
];

const customers: SavedCustomer[] = [
  {
    id: "customer-1",
    name: "Nike",
    emails: ["buyer@nike.com"],
    domains: ["nike.com", "nike.co.uk"],
    ownerRepId: "rep-1",
  },
];

describe("CustomerListManager", () => {
  it("shows domain editing controls for supervisors and admins", () => {
    const markup = renderToStaticMarkup(
      <CustomerListManager
        currentRep={reps[1]}
        reps={reps}
        customers={customers}
        canManage={true}
        onSaveCustomer={vi.fn()}
        onDeleteCustomer={vi.fn()}
        onClearAllCustomers={vi.fn()}
      />,
    );

    expect(markup).toContain("Company Domains");
    expect(markup).toContain("acme.com");
    expect(markup).toContain("Edit");
    expect(markup).toContain("Delete");
  });

  it("shows domains in the rep read-only view", () => {
    const markup = renderToStaticMarkup(
      <CustomerListManager
        currentRep={reps[0]}
        reps={reps}
        customers={customers}
        canManage={false}
        onSaveCustomer={vi.fn()}
        onDeleteCustomer={vi.fn()}
        onClearAllCustomers={vi.fn()}
      />,
    );

    expect(markup).toContain("Ownership is read-only for reps");
    expect(markup).toContain("Company Domains");
    expect(markup).toContain("nike.com");
    expect(markup).toContain("nike.co.uk");
    expect(markup).not.toContain("Edit");
    expect(markup).not.toContain("Delete");
  });
});
