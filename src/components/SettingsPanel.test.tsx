import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "./SettingsPanel";
import { getDefaultSlaSettings } from "../services/sla";
import type { RepProfile } from "../types/actionDesk";

const reps: RepProfile[] = [
  {
    id: "rep-1",
    name: "Mia Johnson",
    initials: "MJ",
    email: "mia@example.com",
    role: "rep",
  },
  {
    id: "supervisor-1",
    name: "Logan Chen",
    initials: "LC",
    email: "logan@example.com",
    role: "supervisor",
  },
];

function renderSettingsPanel(input: {
  currentUser: RepProfile;
  capabilities: Array<
    | "manage_sla_settings"
    | "manage_customer_ownership"
    | "manage_users"
    | "view_my_queue"
  >;
}) {
  return renderToStaticMarkup(
    <SettingsPanel
      isOpen={true}
      currentUser={input.currentUser}
      reps={reps}
      capabilities={input.capabilities}
      customers={[]}
      slaSettings={getDefaultSlaSettings()}
      onClose={vi.fn()}
      onSaveCustomer={vi.fn()}
      onSaveSlaSettings={vi.fn()}
      onDeleteCustomer={vi.fn()}
      onClearAllCustomers={vi.fn()}
    />,
  );
}

describe("SettingsPanel SLA settings", () => {
  it("shows SLA meaning to reps without edit controls", () => {
    const markup = renderSettingsPanel({
      currentUser: reps[0],
      capabilities: ["view_my_queue"],
    });

    expect(markup).toContain("First Response SLA = how fast we expect the first reply");
    expect(markup).toContain("SLA settings are view-only for reps");
    expect(markup).not.toContain("Save SLA Settings");
  });

  it("allows supervisors or admins with SLA capability to save settings", () => {
    const markup = renderSettingsPanel({
      currentUser: reps[1],
      capabilities: ["view_my_queue", "manage_sla_settings"],
    });

    expect(markup).toContain("First Response SLA Minutes");
    expect(markup).toContain("Resolution SLA Minutes");
    expect(markup).toContain("Warning Threshold Percent");
    expect(markup).toContain("Warning Minutes Before Breach");
    expect(markup).toContain("Save SLA Settings");
  });

  it("shows the real configured locations in settings dropdowns", () => {
    const markup = renderSettingsPanel({
      currentUser: {
        ...reps[1],
        role: "admin",
        locationId: undefined,
      },
      capabilities: [
        "view_my_queue",
        "manage_customer_ownership",
        "manage_users",
      ],
    });

    expect(markup).toContain("Apexpress Irwindale");
    expect(markup).toContain("Apexpress Corona");
    expect(markup).toContain("worldpackusa Las Vegas");
    expect(markup).toContain('value="apexpress_irwindale"');
    expect(markup).toContain('value="apexpress_corona"');
    expect(markup).toContain('value="worldpackusa_las_vegas"');
  });

  it("keeps customer management visible for admins even when backend capabilities are sparse", () => {
    const markup = renderSettingsPanel({
      currentUser: {
        ...reps[1],
        role: "admin",
      },
      capabilities: ["view_my_queue"],
    });

    expect(markup).toContain("Customer Ownership");
    expect(markup).toContain("Add Customer");
  });
});
