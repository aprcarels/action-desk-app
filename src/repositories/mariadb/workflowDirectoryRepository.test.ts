import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseRow } from "../../persistence/mariadb/database";
import type { RepProfile } from "../../types/actionDesk";

const databaseMocks = vi.hoisted(() => ({
  execute: vi.fn(),
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock("../../persistence/mariadb/database", () => ({
  execute: databaseMocks.execute,
  query: databaseMocks.query,
  withTransaction: databaseMocks.withTransaction,
}));

const {
  createManagedUser,
  deleteSavedCustomer,
  listSavedCustomersForUser,
  listVisibleRepProfiles,
  resolveSignInRepProfileStatus,
  upsertSavedCustomer,
} = await import("./workflowDirectoryRepository");

function createEmployeeRow(overrides: Partial<DatabaseRow> = {}): DatabaseRow {
  return {
    id: "7",
    microsoftUserId: null,
    displayName: "G Flores",
    email: "gflores@apexpress.com",
    role: "csr",
    department: "apexpress_irwindale",
    isActive: true,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

function createCustomerRow(overrides: Partial<DatabaseRow> = {}): DatabaseRow {
  return {
    id: "42",
    name: "Acme",
    email: "ops@acme.com",
    company: "Acme",
    domain: "acme.com",
    assignedCsrId: "7",
    isActive: true,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    legacyEmployeeId: "7",
    legacyEmployeeDisplayName: "G Flores",
    legacyEmployeeEmail: "gflores@apexpress.com",
    legacyEmployeeDepartment: "apexpress_irwindale",
    ...overrides,
  };
}

const admin: RepProfile = {
  id: "2",
  name: "Admin User",
  initials: "AU",
  email: "admin@apexpress.com",
  role: "admin",
  locationId: "apexpress_irwindale",
  isActive: true,
};

const supervisor: RepProfile = {
  id: "9",
  name: "Irwindale Supervisor",
  initials: "IS",
  email: "supervisor@apexpress.com",
  role: "supervisor",
  locationId: "apexpress_irwindale",
  isActive: true,
};

describe("resolveSignInRepProfileStatus", () => {
  beforeEach(() => {
    databaseMocks.execute.mockReset();
    databaseMocks.query.mockReset();
    databaseMocks.withTransaction.mockReset();
  });

  it("resolves an active employee by Microsoft user id without requiring email", async () => {
    databaseMocks.query.mockResolvedValueOnce([
      createEmployeeRow({
        microsoftUserId: "local-account-1",
      }),
    ]);

    const result = await resolveSignInRepProfileStatus({
      localAccountId: "local-account-1",
    });

    expect(result).toMatchObject({
      status: "active",
      repProfile: {
        id: "7",
        email: "gflores@apexpress.com",
      },
    });
    expect(databaseMocks.query).toHaveBeenCalledTimes(1);
    expect(databaseMocks.execute).not.toHaveBeenCalled();
  });

  it("falls back to exact email and maps the Microsoft user id on first sign-in", async () => {
    databaseMocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createEmployeeRow()]);

    const result = await resolveSignInRepProfileStatus({
      email: "GFLORES@APEXPRESS.COM",
      homeAccountId: "home-account-1",
    });

    expect(result).toMatchObject({
      status: "active",
      repProfile: {
        id: "7",
      },
    });
    expect(databaseMocks.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE employees"),
      ["home-account-1", "7"],
    );
  });

  it("falls back to account username when email is not present", async () => {
    databaseMocks.query.mockResolvedValueOnce([
      createEmployeeRow({
        microsoftUserId: "existing-microsoft-id",
      }),
    ]);

    const result = await resolveSignInRepProfileStatus({
      accountUsername: "gflores@apexpress.com",
    });

    expect(result).toMatchObject({
      status: "active",
      repProfile: {
        id: "7",
      },
    });
    expect(databaseMocks.query).toHaveBeenCalledTimes(1);
    expect(databaseMocks.execute).not.toHaveBeenCalled();
  });

  it("reports inactive when the matched employee is inactive", async () => {
    databaseMocks.query.mockResolvedValueOnce([
      createEmployeeRow({
        isActive: false,
        microsoftUserId: "home-account-1",
      }),
    ]);

    await expect(
      resolveSignInRepProfileStatus({
        homeAccountId: "home-account-1",
      }),
    ).resolves.toEqual({ status: "inactive" });
  });
});

describe("MariaDB workflow directory mutations", () => {
  beforeEach(() => {
    databaseMocks.execute.mockReset();
    databaseMocks.query.mockReset();
    databaseMocks.withTransaction.mockReset();
  });

  it("creates managed users with an employees insert and returns MariaDB mutation metadata", async () => {
    databaseMocks.execute.mockResolvedValueOnce({
      affectedRows: 1,
      insertId: 23,
      warningStatus: 0,
    });
    databaseMocks.query.mockResolvedValueOnce([
      createEmployeeRow({
        id: "23",
        displayName: "Mia Johnson",
        email: "mia.johnson@apexpress.com",
      }),
    ]);

    const result = await createManagedUser({
      displayName: " Mia Johnson ",
      initials: "MJ",
      email: "MIA.JOHNSON@APEXPRESS.COM",
      role: "rep",
      locationId: "apexpress_irwindale",
      isActive: true,
    });

    expect(databaseMocks.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO employees"),
      [
        "Mia Johnson",
        "mia.johnson@apexpress.com",
        "csr",
        "apexpress_irwindale",
        true,
      ],
    );
    expect(result.mutation).toEqual({
      action: "create_user",
      affectedRows: 1,
      returnedId: "23",
    });
    expect(result.users).toEqual([
      expect.objectContaining({
        id: "23",
        email: "mia.johnson@apexpress.com",
      }),
    ]);
  });

  it("returns employee email addresses in visible rep profiles", async () => {
    databaseMocks.query
      .mockResolvedValueOnce([
        createEmployeeRow({
          id: "7",
          displayName: "Mia Johnson",
          email: "mia.johnson@apexpress.com",
        }),
      ])
      .mockResolvedValueOnce([]);

    const reps = await listVisibleRepProfiles(admin);

    expect(reps).toEqual([
      expect.objectContaining({
        id: "7",
        name: "Mia Johnson",
        email: "mia.johnson@apexpress.com",
      }),
    ]);
  });

  it("uses employee location as the canonical rep profile location for admin and supervisor bootstrap", async () => {
    const rows = [
      createEmployeeRow({
        id: supervisor.id,
        displayName: supervisor.name,
        email: supervisor.email,
        role: "supervisor",
        department: "Apexpress Irwindale",
      }),
      createEmployeeRow({
        id: "7",
        displayName: "Mia Johnson",
        email: "mia.johnson@apexpress.com",
        department: "Apexpress Irwindale",
      }),
      createEmployeeRow({
        id: "8",
        displayName: "Zero Ticket CSR",
        email: "zero.ticket@apexpress.com",
        department: "Irwindale",
      }),
      createEmployeeRow({
        id: "10",
        displayName: "Corona CSR",
        email: "corona@apexpress.com",
        department: "Apexpress Corona",
      }),
    ];
    const assignmentRows = [
      {
        employeeId: "7",
        locationName: "Apexpress Corona",
      },
    ];

    databaseMocks.query
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(assignmentRows);

    const adminReps = await listVisibleRepProfiles(admin);

    databaseMocks.query
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(assignmentRows);

    const supervisorReps = await listVisibleRepProfiles(supervisor);
    const adminMia = adminReps.find((rep) => rep.id === "7");

    expect(adminMia).toMatchObject({
      id: "7",
      locationId: "apexpress_irwindale",
    });
    expect(supervisorReps.map((rep) => rep.id)).toEqual([
      supervisor.id,
      "7",
      "8",
    ]);
    expect(supervisorReps.find((rep) => rep.id === "8")).toMatchObject({
      name: "Zero Ticket CSR",
      locationId: "apexpress_irwindale",
    });
    expect(supervisorReps.find((rep) => rep.id === "10")).toBeUndefined();
  });

  it("scopes supervisor customers by normalized assignment location and excludes unknown locations", async () => {
    databaseMocks.query
      .mockResolvedValueOnce([
        createCustomerRow({
          id: "42",
          name: "Acme Irwindale",
          domain: "acme.com",
        }),
        createCustomerRow({
          id: "43",
          name: "Unknown Location Customer",
          domain: "unknown-location.example",
          assignedCsrId: null,
          legacyEmployeeId: null,
          legacyEmployeeDepartment: "Unknown Depot",
        }),
      ])
      .mockResolvedValueOnce([
        {
          customerId: "42",
          employeeId: "7",
          employeeDisplayName: "Mia Johnson",
          employeeEmail: "mia.johnson@apexpress.com",
          employeeDepartment: "Apexpress Irwindale",
          assignmentRole: "primary",
          locationName: "Apexpress 1",
          isActive: true,
        },
      ]);

    const customers = await listSavedCustomersForUser(supervisor);

    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({
      id: "42",
      locationId: "apexpress_irwindale",
      assignedCSRs: [
        expect.objectContaining({
          repId: "7",
          repEmail: "mia.johnson@apexpress.com",
        }),
      ],
    });
  });

  it("creates saved customers and CSR assignments with MariaDB writes", async () => {
    databaseMocks.withTransaction.mockImplementation(async (callback) =>
      callback({
        query: databaseMocks.query,
        execute: databaseMocks.execute,
      }),
    );
    databaseMocks.query
      .mockResolvedValueOnce([createEmployeeRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createCustomerRow()])
      .mockResolvedValueOnce([
        {
          customerId: "42",
          employeeId: "7",
          employeeDisplayName: "G Flores",
          employeeEmail: "gflores@apexpress.com",
          employeeDepartment: "apexpress_irwindale",
          assignmentRole: "primary",
          locationName: "apexpress_irwindale",
          isActive: true,
        },
      ]);
    databaseMocks.execute
      .mockResolvedValueOnce({
        affectedRows: 1,
        insertId: 42,
        warningStatus: 0,
      })
      .mockResolvedValueOnce({
        affectedRows: 0,
        insertId: null,
        warningStatus: 0,
      })
      .mockResolvedValueOnce({
        affectedRows: 1,
        insertId: 81,
        warningStatus: 0,
      });

    const result = await upsertSavedCustomer(
      {
        name: "Acme",
        emails: ["ops@acme.com"],
        domains: ["acme.com"],
        assignedCSRs: [
          {
            repId: "7",
            assignmentRole: "primary",
            locationName: "apexpress_irwindale",
            isActive: true,
          },
        ],
        locationId: "apexpress_irwindale",
      },
      admin,
    );

    expect(databaseMocks.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO customers"),
      ["Acme", "ops@acme.com", "Acme", "acme.com", "7"],
    );
    expect(databaseMocks.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO customer_csr_assignments"),
      ["42", "7", "primary", "apexpress_irwindale"],
    );
    expect(result.mutation).toEqual({
      action: "create_customer",
      affectedRows: 2,
      returnedId: "42",
    });
    expect(result.customers).toEqual([
      expect.objectContaining({
        id: "42",
        domains: ["acme.com"],
        assignedCSRs: [
          expect.objectContaining({
            repId: "7",
            repEmail: "gflores@apexpress.com",
          }),
        ],
      }),
    ]);
  });

  it("deactivates customers and their CSR assignments with MariaDB updates", async () => {
    databaseMocks.withTransaction.mockImplementation(async (callback) =>
      callback({
        query: databaseMocks.query,
        execute: databaseMocks.execute,
      }),
    );
    databaseMocks.query
      .mockResolvedValueOnce([createCustomerRow()])
      .mockResolvedValueOnce([
        {
          customerId: "42",
          employeeId: "7",
          employeeDisplayName: "G Flores",
          employeeEmail: "gflores@apexpress.com",
          employeeDepartment: "apexpress_irwindale",
          assignmentRole: "primary",
          locationName: "apexpress_irwindale",
          isActive: true,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    databaseMocks.execute
      .mockResolvedValueOnce({
        affectedRows: 1,
        insertId: null,
        warningStatus: 0,
      })
      .mockResolvedValueOnce({
        affectedRows: 1,
        insertId: null,
        warningStatus: 0,
      });

    const result = await deleteSavedCustomer("42", admin);

    expect(databaseMocks.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE customers"),
      ["42"],
    );
    expect(databaseMocks.execute).toHaveBeenCalledWith(
      expect.stringContaining("SET is_active = FALSE"),
      ["42"],
    );
    expect(databaseMocks.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE customer_csr_assignments"),
      ["42"],
    );
    expect(result.mutation).toEqual({
      action: "deactivate_customer",
      affectedRows: 2,
      returnedId: "42",
    });
    expect(result.customers).toEqual([]);
  });
});
