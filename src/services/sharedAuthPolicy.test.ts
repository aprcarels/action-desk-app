import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  buildSessionSummary,
  getCapabilitiesForRole,
  resolveMappedUser,
} = require("../../electron/sharedAuthPolicy.cjs") as {
  buildSessionSummary: (
    sessionId: string,
    currentUser: {
      id: string;
      name: string;
      initials: string;
      email: string;
      role: "rep" | "supervisor" | "admin";
      isActive?: boolean;
    } | null,
    reps: Array<unknown>,
  ) => {
    sessionId: string;
    currentUser: unknown;
    capabilities: string[];
    reps: Array<unknown>;
  };
  getCapabilitiesForRole: (role: "rep" | "supervisor" | "admin") => string[];
  resolveMappedUser: (
    users: Array<{
      id: string;
      entra_object_id?: string | null;
      email: string;
      is_active: number;
    }>,
    identity: { entraObjectId: string; email: string },
  ) => { id: string } | null;
};

describe("sharedAuthPolicy", () => {
  it("does not create new users for arbitrary email sign-ins", () => {
    const users = [
      {
        id: "rep-mj",
        entra_object_id: null,
        email: "mia.johnson@actiondesk.local",
        is_active: 1,
      },
    ];

    expect(
      resolveMappedUser(users, {
        entraObjectId: "entra-unknown",
        email: "random.person@example.com",
      }),
    ).toBeNull();
  });

  it("maps a known Microsoft identity to an existing Action Desk user", () => {
    const users = [
      {
        id: "rep-mj",
        entra_object_id: null,
        email: "mia.johnson@actiondesk.local",
        is_active: 1,
      },
    ];

    expect(
      resolveMappedUser(users, {
        entraObjectId: "entra-mj",
        email: "mia.johnson@actiondesk.local",
      }),
    ).toMatchObject({ id: "rep-mj" });
  });

  it("rejects sign-in for a deactivated Action Desk user", () => {
    const users = [
      {
        id: "rep-mj",
        entra_object_id: null,
        email: "mia.johnson@actiondesk.local",
        is_active: 0,
      },
    ];

    expect(
      resolveMappedUser(users, {
        entraObjectId: "entra-mj",
        email: "mia.johnson@actiondesk.local",
      }),
    ).toBeNull();
  });

  it("enforces customer ownership and admin capabilities by role", () => {
    expect(getCapabilitiesForRole("rep")).not.toContain("manage_customer_ownership");
    expect(getCapabilitiesForRole("supervisor")).toContain("manage_customer_ownership");
    expect(getCapabilitiesForRole("rep")).not.toContain("manage_sla_settings");
    expect(getCapabilitiesForRole("supervisor")).toContain("manage_sla_settings");
    expect(getCapabilitiesForRole("admin")).toContain("manage_sla_settings");
    expect(getCapabilitiesForRole("admin")).toContain("view_supervisor_queue");
    expect(getCapabilitiesForRole("admin")).toContain("view_all_work");
    expect(getCapabilitiesForRole("admin")).toContain("manage_test_queue_data");
    expect(getCapabilitiesForRole("supervisor")).not.toContain("manage_users");
    expect(getCapabilitiesForRole("rep")).not.toContain("manage_users");
    expect(getCapabilitiesForRole("admin")).toContain("manage_users");
    expect(getCapabilitiesForRole("rep")).not.toContain("view_diagnostics");
    expect(getCapabilitiesForRole("supervisor")).not.toContain("view_diagnostics");
  });

  it("returns only minimal session data to the renderer", () => {
    const summary = buildSessionSummary(
      "session-admin",
      {
        id: "admin-sl",
        name: "Sam Lee",
        initials: "SL",
        email: "sam.lee@actiondesk.local",
        role: "admin",
        isActive: true,
      },
      [{ id: "admin-sl", name: "Sam Lee" }],
    );

    expect(summary).toEqual({
      sessionId: "session-admin",
      currentUser: {
        id: "admin-sl",
        name: "Sam Lee",
        initials: "SL",
        email: "sam.lee@actiondesk.local",
        role: "admin",
        isActive: true,
      },
      capabilities: expect.arrayContaining(["manage_users", "create_backup"]),
      reps: [{ id: "admin-sl", name: "Sam Lee" }],
    });
  });
});
