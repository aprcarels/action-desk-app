import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ManagedUser,
  RepProfile,
  SavedCustomer,
} from "../src/types/actionDesk";

const require = createRequire(import.meta.url);
const nativeFetch = globalThis.fetch;
const { createRequestHandler } = require("../electron/appServer.cjs") as {
  createRequestHandler: (options: {
    distDir: string;
    databasePath: string;
    store: Record<string, unknown>;
    logger: Record<string, (...args: unknown[]) => void>;
    authProvider: Record<string, unknown>;
    workflowDirectoryRepository?: Record<string, unknown>;
  }) => http.RequestListener;
};

type TestContext = {
  server: http.Server;
  origin: string;
  store: {
    getBootstrap: ReturnType<typeof vi.fn>;
    createUser: ReturnType<typeof vi.fn>;
    updateUser: ReturnType<typeof vi.fn>;
    deactivateUser: ReturnType<typeof vi.fn>;
    upsertCustomer: ReturnType<typeof vi.fn>;
    deleteCustomer: ReturnType<typeof vi.fn>;
    listUsers: ReturnType<typeof vi.fn>;
  };
  logger: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  workflowDirectoryRepository: {
    resolveCurrentRepProfile: ReturnType<typeof vi.fn>;
    listVisibleRepProfiles: ReturnType<typeof vi.fn>;
    listSavedCustomersForUser: ReturnType<typeof vi.fn>;
    listManagedUsers: ReturnType<typeof vi.fn>;
    createManagedUser: ReturnType<typeof vi.fn>;
    updateManagedUser: ReturnType<typeof vi.fn>;
    deactivateManagedUser: ReturnType<typeof vi.fn>;
    upsertSavedCustomer: ReturnType<typeof vi.fn>;
    deleteSavedCustomer: ReturnType<typeof vi.fn>;
  };
};

const admin: RepProfile = {
  id: "2",
  name: "Logan Chen",
  initials: "LC",
  email: "logan.chen@apexpress.com",
  role: "admin",
  locationId: "apexpress_irwindale",
  isActive: true,
};

const csr: RepProfile = {
  id: "7",
  name: "Mia Johnson",
  initials: "MJ",
  email: "mia.johnson@apexpress.com",
  role: "rep",
  locationId: "apexpress_irwindale",
  isActive: true,
};

const customer: SavedCustomer = {
  id: "42",
  name: "Acme",
  emails: ["ops@acme.com"],
  domains: ["acme.com"],
  ownerRepId: "7",
  ownerRepIds: ["7"],
  assignedCSRs: [
    {
      repId: "7",
      assignmentRole: "primary",
      locationName: "apexpress_irwindale",
      isActive: true,
    },
  ],
  locationId: "apexpress_irwindale",
};

function createManagedUser(input: Pick<ManagedUser, "id" | "displayName" | "email" | "role">): ManagedUser {
  const now = new Date().toISOString();

  return {
    ...input,
    initials: input.displayName
      .split(/\s+/)
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    locationId: "apexpress_irwindale",
    isActive: true,
    hasSignedIn: true,
    mappingStatus: "mapped",
    createdAt: now,
    updatedAt: now,
  };
}

async function startServer(): Promise<TestContext> {
  const store = {
    authProvider: undefined,
    getSessionSummary: vi.fn().mockReturnValue({
      sessionId: "session-supervisor",
      currentUser: {
        id: "sqlite-supervisor",
        name: "SQLite Supervisor",
        initials: "SS",
        email: admin.email,
        role: "admin",
        locationId: "apexpress_irwindale",
        isActive: true,
      },
      capabilities: ["manage_customer_ownership", "manage_users"],
      reps: [],
    }),
    getInvalidatedSessionState: vi.fn().mockReturnValue(null),
    getBootstrap: vi.fn(),
    getSlaSettings: vi.fn().mockReturnValue({
      firstResponseSlaMinutes: 60,
      resolutionSlaMinutes: 1440,
      warningThresholdPercent: 75,
      warningMinutesBeforeBreach: 15,
    }),
    listThreadStates: vi.fn().mockReturnValue({}),
    listThreadPresence: vi.fn().mockReturnValue({}),
    getPreferences: vi.fn().mockReturnValue({
      queueScopeView: "my_queue",
      queueDisplayMode: "list",
      statusFilter: "open",
      showSnoozed: false,
    }),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deactivateUser: vi.fn(),
    upsertCustomer: vi.fn(),
    deleteCustomer: vi.fn(),
    listUsers: vi.fn(),
  };
  const managedCsr = createManagedUser({
    id: csr.id,
    displayName: csr.name,
    email: csr.email,
    role: "rep",
  });
  const workflowDirectoryRepository = {
    resolveCurrentRepProfile: vi.fn().mockResolvedValue(admin),
    listVisibleRepProfiles: vi.fn().mockResolvedValue([admin, csr]),
    listSavedCustomersForUser: vi.fn().mockResolvedValue([customer]),
    listManagedUsers: vi.fn().mockResolvedValue([managedCsr]),
    createManagedUser: vi.fn().mockResolvedValue({
      users: [managedCsr],
      mutation: { action: "create_user", affectedRows: 1, returnedId: managedCsr.id },
    }),
    updateManagedUser: vi.fn().mockResolvedValue({
      users: [managedCsr],
      mutation: { action: "update_user", affectedRows: 1, returnedId: managedCsr.id },
    }),
    deactivateManagedUser: vi.fn().mockResolvedValue({
      users: [managedCsr],
      mutation: { action: "deactivate_user", affectedRows: 1, returnedId: managedCsr.id },
    }),
    upsertSavedCustomer: vi.fn().mockResolvedValue({
      customers: [customer],
      mutation: { action: "update_customer", affectedRows: 2, returnedId: customer.id },
    }),
    deleteSavedCustomer: vi.fn().mockResolvedValue({
      customers: [],
      mutation: { action: "deactivate_customer", affectedRows: 2, returnedId: customer.id },
    }),
  };
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const server = http.createServer(
    createRequestHandler({
      distDir: path.resolve("."),
      databasePath: path.resolve("tmp-shared.sqlite"),
      store,
      logger,
      authProvider: {
        hasSessionContext: () => true,
        signOutSession: vi.fn(),
      },
      workflowDirectoryRepository,
    }),
  );

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Could not determine server address.");
  }

  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
    store,
    logger,
    workflowDirectoryRepository,
  };
}

async function stopServer(context: TestContext) {
  await new Promise<void>((resolve, reject) => {
    context.server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

describe("MariaDB workflow directory routes", () => {
  const contexts: TestContext[] = [];

  afterEach(async () => {
    while (contexts.length > 0) {
      const context = contexts.pop();

      if (context) {
        await stopServer(context);
      }
    }
  });

  it("builds workflow bootstrap users and customers from the MariaDB directory", async () => {
    const context = await startServer();
    contexts.push(context);

    const response = await nativeFetch(
      `${context.origin}/api/workflow/bootstrap?sessionId=session-supervisor`,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(context.store.getBootstrap).not.toHaveBeenCalled();
    expect(payload.currentUser).toMatchObject({
      id: admin.id,
      role: "admin",
      locationId: "apexpress_irwindale",
    });
    expect(payload.workflowState.reps).toEqual([
      expect.objectContaining({ id: admin.id, email: admin.email }),
      expect.objectContaining({ id: csr.id, role: "rep", email: csr.email }),
    ]);
    expect(payload.customers).toEqual([
      expect.objectContaining({
        id: customer.id,
        assignedCSRs: [expect.objectContaining({ repId: csr.id })],
      }),
    ]);
    expect(payload.directoryDiagnostics).toMatchObject({
      source: "directory_repository",
      customerCount: 1,
      csrCount: 1,
      assignmentCount: 1,
    });
  });

  it("routes admin user loading through MariaDB employees", async () => {
    const context = await startServer();
    contexts.push(context);

    const response = await nativeFetch(
      `${context.origin}/api/admin/users?sessionId=session-supervisor`,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(context.store.listUsers).not.toHaveBeenCalled();
    expect(context.workflowDirectoryRepository.listManagedUsers).toHaveBeenCalledWith({
      includeInactive: true,
    });
    expect(payload.users).toEqual([
      expect.objectContaining({
        id: csr.id,
        email: csr.email,
        isActive: true,
      }),
    ]);
  });

  it("routes customer ownership updates through MariaDB customers and assignments", async () => {
    const context = await startServer();
    contexts.push(context);

    const response = await nativeFetch(
      `${context.origin}/api/workflow/customers/upsert?sessionId=session-supervisor`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: {
            id: customer.id,
            name: customer.name,
            emails: customer.emails,
            domains: customer.domains,
            assignedCSRs: customer.assignedCSRs,
            locationId: customer.locationId,
          },
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(context.store.upsertCustomer).not.toHaveBeenCalled();
    expect(context.workflowDirectoryRepository.upsertSavedCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: customer.id,
        assignedCSRs: customer.assignedCSRs,
      }),
      expect.objectContaining({
        id: admin.id,
      }),
    );
    expect(payload.customers).toEqual([
      expect.objectContaining({
        id: customer.id,
      }),
    ]);
  });

  it("routes REST user creation through MariaDB employees", async () => {
    const context = await startServer();
    contexts.push(context);

    const response = await nativeFetch(
      `${context.origin}/api/users?sessionId=session-supervisor`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: "Mia Johnson",
          email: "mia.johnson@apexpress.com",
          role: "rep",
          locationId: "apexpress_irwindale",
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(context.store.createUser).not.toHaveBeenCalled();
    expect(context.workflowDirectoryRepository.createManagedUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "mia.johnson@apexpress.com",
        role: "rep",
      }),
    );
    expect(payload.users).toEqual([
      expect.objectContaining({
        id: csr.id,
        email: csr.email,
      }),
    ]);
    expect(context.logger.info).toHaveBeenCalledWith(
      "settings-mutation",
      "MariaDB mutation route completed.",
      expect.objectContaining({
        route: "POST /api/users",
        affectedRows: 1,
        returnedId: csr.id,
      }),
    );
    expect(context.logger.info).toHaveBeenCalledWith(
      "settings-mutation",
      "settingsDataRefreshed",
      expect.objectContaining({
        route: "POST /api/users",
        source: "directory_repository",
        usersCount: 1,
      }),
    );
  });

  it("routes REST user PATCH bodies through MariaDB employees", async () => {
    const context = await startServer();
    contexts.push(context);

    const response = await nativeFetch(
      `${context.origin}/api/users/${csr.id}?sessionId=session-supervisor`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: "Mia J",
          role: "supervisor",
          isActive: false,
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(context.store.updateUser).not.toHaveBeenCalled();
    expect(context.workflowDirectoryRepository.updateManagedUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: csr.id,
        displayName: "Mia J",
        role: "supervisor",
        isActive: false,
      }),
    );
    expect(payload.users).toEqual([
      expect.objectContaining({
        id: csr.id,
        email: csr.email,
      }),
    ]);
  });

  it("routes REST customer creation through MariaDB customers", async () => {
    const context = await startServer();
    contexts.push(context);
    context.workflowDirectoryRepository.upsertSavedCustomer.mockResolvedValueOnce({
      customers: [],
      mutation: { action: "update_customer", affectedRows: 2, returnedId: customer.id },
    });
    context.workflowDirectoryRepository.listSavedCustomersForUser.mockResolvedValueOnce([
      customer,
    ]);

    const response = await nativeFetch(
      `${context.origin}/api/customers?sessionId=session-supervisor`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customer.name,
          emails: customer.emails,
          domains: customer.domains,
          assignedCSRs: customer.assignedCSRs,
          locationId: customer.locationId,
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(context.store.upsertCustomer).not.toHaveBeenCalled();
    expect(context.workflowDirectoryRepository.upsertSavedCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        name: customer.name,
        assignedCSRs: customer.assignedCSRs,
      }),
      expect.objectContaining({ id: admin.id }),
    );
    expect(payload.customers).toEqual([expect.objectContaining({ id: customer.id })]);
    expect(payload.mutation).toMatchObject({
      action: "update_customer",
      affectedRows: 2,
      returnedId: customer.id,
    });
    expect(context.logger.info).toHaveBeenCalledWith(
      "settings-mutation",
      "settingsDataRefreshed",
      expect.objectContaining({
        route: "POST /api/customers",
        source: "directory_repository",
        customersCount: 1,
        assignmentsCount: 1,
      }),
    );
  });

  it("routes REST customer deactivation through MariaDB customers", async () => {
    const context = await startServer();
    contexts.push(context);

    const response = await nativeFetch(
      `${context.origin}/api/customers/${customer.id}?sessionId=session-supervisor`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      },
    );

    expect(response.status).toBe(200);
    expect(context.store.deleteCustomer).not.toHaveBeenCalled();
    expect(context.workflowDirectoryRepository.deleteSavedCustomer).toHaveBeenCalledWith(
      customer.id,
      expect.objectContaining({ id: admin.id }),
    );
  });

  it("routes REST customer assignment updates through MariaDB customer ownership", async () => {
    const context = await startServer();
    contexts.push(context);

    const response = await nativeFetch(
      `${context.origin}/api/customer-assignments?sessionId=session-supervisor`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer.id,
          assignments: [
            {
              repId: csr.id,
              assignmentRole: "primary",
              locationName: "apexpress_irwindale",
              isActive: true,
            },
          ],
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(context.workflowDirectoryRepository.upsertSavedCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: customer.id,
        assignedCSRs: [expect.objectContaining({ repId: csr.id })],
      }),
      expect.objectContaining({ id: admin.id }),
    );
    expect(payload.assignments).toEqual([
      expect.objectContaining({
        customerId: customer.id,
        repId: csr.id,
      }),
    ]);
  });
});
