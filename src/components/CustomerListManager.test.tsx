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
const multiCustomerList: SavedCustomer[] = [
  ...customers,
  {
    id: "customer-2",
    name: "Meliibaby",
    emails: ["ops@meliibaby.com"],
    domains: ["meliibaby.com"],
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

  it("shows CSR email addresses in owner pickers and customer assignment summaries", () => {
    const markup = renderToStaticMarkup(
      <CustomerListManager
        currentRep={{ ...reps[1], role: "admin" }}
        reps={reps}
        customers={customers}
        canManage={true}
        onSaveCustomer={vi.fn()}
        onDeleteCustomer={vi.fn()}
        onClearAllCustomers={vi.fn()}
      />,
    );

    expect(markup).toContain("Mia Johnson | mia@example.com (Rep)");
    expect(markup).toContain("Assigned CSRs:");
    expect(markup).toContain("Mia Johnson | mia@example.com (primary)");
  });

  it("uses assignment-denormalized CSR emails when a rep profile is not loaded", () => {
    const markup = renderToStaticMarkup(
      <CustomerListManager
        currentRep={{ ...reps[1], role: "admin" }}
        reps={[reps[1]]}
        customers={[
          {
            ...customers[0],
            assignedCSRs: [
              {
                repId: "rep-9",
                repName: "Nora Patel",
                repEmail: "nora@example.com",
                assignmentRole: "primary",
                isActive: true,
              },
            ],
            ownerRepId: "rep-9",
            ownerRepIds: ["rep-9"],
          },
        ]}
        canManage={true}
        onSaveCustomer={vi.fn()}
        onDeleteCustomer={vi.fn()}
        onClearAllCustomers={vi.fn()}
      />,
    );

    expect(markup).toContain("Nora Patel | nora@example.com (primary)");
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

  it("renders every saved customer it receives", () => {
    const markup = renderToStaticMarkup(
      <CustomerListManager
        currentRep={{ ...reps[1], role: "admin" }}
        reps={reps}
        customers={multiCustomerList}
        canManage={true}
        onSaveCustomer={vi.fn()}
        onDeleteCustomer={vi.fn()}
        onClearAllCustomers={vi.fn()}
      />,
    );

    expect(markup).toContain("Nike");
    expect(markup).toContain("Meliibaby");
  });

  it("keeps canonical locations and loaded customers visible for unscoped supervisors", () => {
    const locatedCustomers: SavedCustomer[] = [
      {
        ...customers[0],
        locationId: "apexpress_irwindale",
      },
      {
        id: "customer-2",
        name: "Meliibaby",
        emails: ["ops@meliibaby.com"],
        domains: ["meliibaby.com"],
        ownerRepId: "rep-1",
        locationId: "worldpackusa_las_vegas",
      },
    ];

    const markup = renderToStaticMarkup(
      <CustomerListManager
        currentRep={{ ...reps[1], locationId: undefined }}
        reps={reps}
        customers={locatedCustomers}
        canManage={true}
        onSaveCustomer={vi.fn()}
        onDeleteCustomer={vi.fn()}
        onClearAllCustomers={vi.fn()}
      />,
    );

    expect(markup).toContain("Apexpress Irwindale");
    expect(markup).toContain("Apexpress Corona");
    expect(markup).toContain("worldpackusa Las Vegas");
    expect(markup).toContain("Nike");
    expect(markup).toContain("Meliibaby");
  });
});
