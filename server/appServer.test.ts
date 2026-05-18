import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const nativeFetch = globalThis.fetch;
const { createRequestHandler } = require("../electron/appServer.cjs") as {
  createRequestHandler: (options: {
    distDir: string;
    databasePath: string;
    store: Record<string, unknown>;
    logger: Record<string, (...args: unknown[]) => void>;
    authProvider: Record<string, unknown>;
    backendApi?: {
      baseUrl?: string;
      requestJson: (...args: unknown[]) => Promise<unknown>;
    };
    webhookStorePath?: string;
    processIncomingEmail?: (...args: unknown[]) => Promise<string | null>;
  }) => http.RequestListener;
};

async function startTestServer(handler: http.RequestListener) {
  const server = http.createServer(handler);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Could not determine test server address.");
  }

  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
  };
}

async function closeTestServer(server: http.Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

describe("appServer CORS", () => {
  it("allows loopback origins for local desktop API requests", async () => {
    const handler = createRequestHandler({
      distDir: path.resolve("."),
      databasePath: path.resolve("tmp-shared.sqlite"),
      store: {},
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      authProvider: {},
    });
    const { server, origin } = await startTestServer(handler);

    try {
      const response = await nativeFetch(`${origin}/api/health`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://localhost:5173",
          "Access-Control-Request-Method": "PATCH",
        },
      });

      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe(
        "https://localhost:5173",
      );
      expect(response.headers.get("access-control-allow-methods")).toContain(
        "PATCH",
      );
    } finally {
      await closeTestServer(server);
    }
  });

  it("rejects non-allowlisted CORS origins", async () => {
    const handler = createRequestHandler({
      distDir: path.resolve("."),
      databasePath: path.resolve("tmp-shared.sqlite"),
      store: {},
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      authProvider: {},
    });
    const { server, origin } = await startTestServer(handler);

    try {
      for (const requestOrigin of [
        "https://attacker.example",
        "http://localhost:9999",
      ]) {
        const response = await nativeFetch(`${origin}/api/health`, {
          method: "OPTIONS",
          headers: {
            Origin: requestOrigin,
            "Access-Control-Request-Method": "GET",
          },
        });

        expect(response.status).toBe(403);
        expect(response.headers.get("access-control-allow-origin")).toBeNull();
      }
    } finally {
      await closeTestServer(server);
    }
  });
});

describe("appServer stale session handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("forces sign-out when a protected workflow route has no live Microsoft context", async () => {
    const invalidateSession = vi.fn();
    const signOutSession = vi.fn();
    const getBootstrap = vi.fn();
    const handler = createRequestHandler({
      distDir: path.resolve("."),
      databasePath: path.resolve("tmp-shared.sqlite"),
      store: {
        authProvider: undefined,
        getSessionSummary: () => ({
          sessionId: "session-stale",
          currentUser: { id: "rep-1" },
          capabilities: [],
          reps: [],
        }),
        invalidateSession,
        getBootstrap,
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      authProvider: {
        hasSessionContext: () => false,
        signOutSession,
      },
    });
    const { server, origin } = await startTestServer(handler);

    try {
      const response = await nativeFetch(
        `${origin}/api/workflow/bootstrap?sessionId=session-stale`,
      );
      const payload = (await response.json()) as {
        error?: { code?: string; message?: string };
      };

      expect(response.status).toBe(401);
      expect(payload.error).toMatchObject({
        code: "microsoft_token_context_missing",
        message: "Microsoft token context missing for session",
      });
      expect(signOutSession).toHaveBeenCalledWith("session-stale");
      expect(invalidateSession).toHaveBeenCalledWith(
        "session-stale",
        "missing_microsoft_context",
      );
      expect(getBootstrap).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });

  it("reads workflow sessions from the session header before legacy query params", async () => {
    const currentUser = { id: "rep-1" };
    const getBootstrap = vi.fn((sessionId: string) => ({
      currentUser,
      capabilities: [],
      reps: [currentUser],
      customers: [],
      slaSettings: {
        firstResponseSlaMinutes: 60,
        resolutionSlaMinutes: 1440,
        warningThresholdPercent: 75,
        warningMinutesBeforeBreach: 15,
      },
      workflowState: {
        reps: [currentUser],
        currentRepId: "rep-1",
        threadStates: {},
        threadPresence: {},
        preferences: {
          queueScopeView: "my_queue",
          queueDisplayMode: "list",
          statusFilter: "open",
          showSnoozed: false,
        },
      },
      sessionId,
    }));
    const handler = createRequestHandler({
      distDir: path.resolve("."),
      databasePath: path.resolve("tmp-shared.sqlite"),
      store: {
        authProvider: undefined,
        getSessionSummary: (sessionId: string) => ({
          sessionId,
          currentUser,
          capabilities: [],
          reps: [currentUser],
        }),
        getBootstrap,
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      authProvider: {
        hasSessionContext: () => true,
      },
    });
    const { server, origin } = await startTestServer(handler);

    try {
      const response = await nativeFetch(
        `${origin}/api/workflow/bootstrap?sessionId=query-session`,
        {
          headers: {
            "x-action-desk-session-id": "header-session",
          },
        },
      );

      expect(response.status).toBe(200);
      expect(getBootstrap).toHaveBeenCalledWith("header-session");
    } finally {
      await closeTestServer(server);
    }
  });

  it("returns signed-out auth session immediately when a backend session has no Microsoft token context", async () => {
    const invalidateSession = vi.fn();
    const signOutSession = vi.fn();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const backendApi = {
      baseUrl: "http://backend.example.test",
      requestJson: vi.fn((pathname: unknown) => {
        if (pathname === "/api/auth/logout") {
          return new Promise(() => {});
        }

        throw new Error(`Unexpected backend request ${String(pathname)}`);
      }),
    };
    const handler = createRequestHandler({
      distDir: path.resolve("."),
      databasePath: path.resolve("tmp-shared.sqlite"),
      store: {
        authProvider: undefined,
        invalidateSession,
      },
      logger,
      authProvider: {
        hasSessionContext: () => false,
        getSessionLookupState: () => ({
          tokenLookupSessionId: "backend-session-3",
          backendSessionId: "backend-session-3",
          resolvedMicrosoftSessionId: "backend-session-3",
          microsoftAuthSessionId: "backend-session-3",
          tokenContextExists: false,
          aliasUsed: false,
        }),
        signOutSession,
      },
      backendApi,
    });
    const { server, origin } = await startTestServer(handler);

    try {
      const response = await Promise.race([
        nativeFetch(`${origin}/api/auth/session?sessionId=backend-session-3`),
        new Promise<Response>((_, reject) => {
          setTimeout(() => {
            reject(new Error("Timed out waiting for auth session cleanup response."));
          }, 250);
        }),
      ]);
      const payload = (await response.json()) as {
        sessionId?: string;
        currentUser?: unknown;
        staleSessionCleared?: boolean;
        authMessage?: string;
      };

      expect(response.status).toBe(200);
      expect(payload).toMatchObject({
        sessionId: "",
        currentUser: null,
        staleSessionCleared: true,
        authMessage: "Microsoft token context missing for session",
      });
      expect(signOutSession).toHaveBeenCalledWith("backend-session-3");
      expect(invalidateSession).toHaveBeenCalledWith(
        "backend-session-3",
        "missing_microsoft_context",
      );
      expect(backendApi.requestJson).toHaveBeenCalledWith(
        "/api/auth/logout",
        expect.objectContaining({
          method: "POST",
          sessionId: "backend-session-3",
        }),
      );
      expect(backendApi.requestJson).not.toHaveBeenCalledWith(
        "/api/auth/session",
        expect.anything(),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        "auth",
        "stalePersistedSessionDetected",
        expect.objectContaining({
          backendSessionId: "backend-session-3",
          tokenContextExists: false,
        }),
      );
      expect(logger.info).toHaveBeenCalledWith(
        "auth",
        "clearedLocalSessionState",
        expect.objectContaining({
          backendSessionId: "backend-session-3",
          tokenContextExists: false,
        }),
      );
      expect(logger.info).toHaveBeenCalledWith(
        "auth",
        "skippedBlockingLogout",
        expect.objectContaining({
          sessionId: "backend-session-3",
        }),
      );
    } finally {
      await closeTestServer(server);
    }
  });

  it("forces sign-out when Outlook Graph returns 401 for inbox load", async () => {
    const invalidateSession = vi.fn();
    const signOutSession = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      }),
    );

    const handler = createRequestHandler({
      distDir: path.resolve("."),
      databasePath: path.resolve("tmp-shared.sqlite"),
      store: {
        authProvider: undefined,
        invalidateSession,
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      authProvider: {
        getAccessTokenForSession: vi.fn().mockResolvedValue("token-123"),
        signOutSession,
      },
    });
    const { server, origin } = await startTestServer(handler);

    try {
      const response = await nativeFetch(
        `${origin}/api/inbox/messages?sessionId=session-stale`,
      );
      const payload = (await response.json()) as {
        error?: { code?: string; message?: string };
      };

      expect(response.status).toBe(401);
      expect(payload.error).toMatchObject({
        code: "stale_microsoft_session",
        message: "Your Microsoft session expired. Please sign in again.",
      });
      expect(signOutSession).toHaveBeenCalledWith("session-stale");
      expect(invalidateSession).toHaveBeenCalledWith(
        "session-stale",
        "graph_unauthorized",
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });

  it("preserves a resolved desktop session when backend bootstrap omits top-level currentUser", async () => {
    const currentUser = {
      id: "rep-1",
      name: "Mia Johnson",
      initials: "MJ",
      email: "mia.johnson@actiondesk.local",
      role: "rep",
    };
    const localBootstrap = {
      currentUser,
      capabilities: ["view_my_queue"],
      reps: [currentUser],
      customers: [],
      slaSettings: {
        firstResponseSlaMinutes: 60,
        resolutionSlaMinutes: 1440,
        warningThresholdPercent: 75,
        warningMinutesBeforeBreach: 15,
      },
      workflowState: {
        reps: [currentUser],
        currentRepId: "rep-1",
        threadStates: {},
        threadPresence: {},
        preferences: {
          queueScopeView: "my_queue",
          queueDisplayMode: "list",
          statusFilter: "open",
          showSnoozed: false,
        },
      },
    };
    const logout = vi.fn();
    const startRuntimeSession = vi.fn();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const backendApi = {
      baseUrl: "http://backend.example.test",
      requestJson: vi.fn().mockResolvedValue({
        sessionId: "session-active",
        customers: [{ id: "customer-1", name: "Northstar", emails: [], domains: [] }],
        workflowState: {
          reps: [currentUser],
          currentRepId: "rep-1",
        },
      }),
    };
    const handler = createRequestHandler({
      distDir: path.resolve("."),
      databasePath: path.resolve("tmp-shared.sqlite"),
      store: {
        authProvider: undefined,
        getBootstrap: vi.fn().mockReturnValue(localBootstrap),
        logout,
        startRuntimeSession,
      },
      logger,
      authProvider: {
        hasSessionContext: () => true,
      },
      backendApi,
    });
    const { server, origin } = await startTestServer(handler);

    try {
      const response = await nativeFetch(
        `${origin}/api/workflow/bootstrap?sessionId=session-active`,
      );
      const payload = (await response.json()) as {
        currentUser?: { id?: string };
        customers?: Array<{ id?: string }>;
      };

      expect(response.status).toBe(200);
      expect(payload.currentUser?.id).toBe("rep-1");
      expect(payload.customers).toEqual([
        expect.objectContaining({ id: "customer-1" }),
      ]);
      expect(logout).not.toHaveBeenCalled();
      expect(startRuntimeSession).toHaveBeenCalledWith(
        "session-active",
        expect.objectContaining(currentUser),
      );
      expect(logger.info).toHaveBeenCalledWith(
        "workflow-bootstrap",
        "Backend bootstrap validation passed.",
        expect.objectContaining({ reason: "validBootstrap" }),
      );
    } finally {
      await closeTestServer(server);
    }
  });

  it("hydrates admin bootstrap settings data from backend directory endpoints", async () => {
    const adminUser = {
      id: "admin-1",
      name: "Avery Admin",
      initials: "AA",
      email: "avery.admin@actiondesk.local",
      role: "admin",
    };
    const csrUser = {
      employee_id: "rep-1",
      display_name: "Mia Johnson",
      employee_email: "mia.johnson@actiondesk.local",
      role: "csr",
      department: "apexpress_irwindale",
      is_active: true,
    };
    const localBootstrap = {
      currentUser: adminUser,
      capabilities: ["view_my_queue"],
      reps: [adminUser],
      customers: [],
      slaSettings: {
        firstResponseSlaMinutes: 60,
        resolutionSlaMinutes: 1440,
        warningThresholdPercent: 75,
        warningMinutesBeforeBreach: 15,
      },
      workflowState: {
        reps: [adminUser],
        currentRepId: "admin-1",
        threadStates: {},
        threadPresence: {},
        preferences: {
          queueScopeView: "my_queue",
          queueDisplayMode: "list",
          statusFilter: "open",
          showSnoozed: false,
        },
      },
    };
    const backendApi = {
      baseUrl: "http://backend.example.test",
      requestJson: vi.fn(async (pathname: unknown) => {
        if (pathname === "/api/workflow/bootstrap") {
          return {
            sessionId: "session-admin",
            currentUser: adminUser,
            capabilities: ["view_my_queue"],
            reps: [adminUser],
            customers: [],
            workflowState: {
              reps: [adminUser],
              currentRepId: "admin-1",
            },
          };
        }

        if (pathname === "/api/users") {
          return {
            users: [adminUser, csrUser],
          };
        }

        if (pathname === "/api/customers") {
          return {
            customers: [
              {
                customer_id: "customer-1",
                customer_name: "Northstar",
                emails: ["ops@northstar.example"],
                domains: ["northstar.example"],
                location_id: "apexpress_irwindale",
                is_active: true,
              },
            ],
          };
        }

        if (pathname === "/api/customer-assignments") {
          return {
            assignments: [
              {
                customer_id: "customer-1",
                employee_id: "rep-1",
                assignment_role: "primary",
                location_name: "apexpress_irwindale",
                is_active: true,
              },
            ],
          };
        }

        throw new Error(`Unexpected backend request ${String(pathname)}`);
      }),
    };
    const handler = createRequestHandler({
      distDir: path.resolve("."),
      databasePath: path.resolve("tmp-shared.sqlite"),
      store: {
        authProvider: undefined,
        getBootstrap: vi.fn().mockReturnValue(localBootstrap),
        startRuntimeSession: vi.fn(),
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      authProvider: {
        hasSessionContext: () => true,
      },
      backendApi,
    });
    const { server, origin } = await startTestServer(handler);

    try {
      const response = await nativeFetch(
        `${origin}/api/workflow/bootstrap?sessionId=session-admin`,
      );
      const payload = (await response.json()) as {
        capabilities?: string[];
        workflowState?: { reps?: Array<{ id?: string; role?: string }> };
        customers?: Array<{
          id?: string;
          emails?: string[];
          domains?: string[];
          assignedCSRs?: Array<{ repId?: string; assignmentRole?: string }>;
        }>;
        customerAssignments?: Array<{ customerId?: string; repId?: string }>;
      };

      expect(response.status).toBe(200);
      expect(payload.capabilities).toEqual(
        expect.arrayContaining([
          "manage_users",
          "manage_customer_ownership",
          "view_supervisor_queue",
          "view_all_work",
        ]),
      );
      expect(payload.workflowState?.reps).toEqual([
        expect.objectContaining({ id: "admin-1", role: "admin" }),
        expect.objectContaining({
          id: "rep-1",
          role: "rep",
          email: "mia.johnson@actiondesk.local",
        }),
      ]);
      expect(payload.customers).toEqual([
        expect.objectContaining({
          id: "customer-1",
          emails: ["ops@northstar.example"],
          domains: ["northstar.example"],
          assignedCSRs: [expect.objectContaining({ repId: "rep-1" })],
        }),
      ]);
      expect(payload.customerAssignments).toEqual([
        expect.objectContaining({ customerId: "customer-1", repId: "rep-1" }),
      ]);
      expect(backendApi.requestJson).toHaveBeenCalledWith(
        "/api/users",
        expect.objectContaining({ sessionId: "session-admin" }),
      );
    } finally {
      await closeTestServer(server);
    }
  });

  it("proxies Settings REST mutations to backend MariaDB routes", async () => {
    const backendApi = {
      baseUrl: "http://backend.example.test",
      requestJson: vi.fn(async (pathname: unknown, options: unknown) => {
        const requestOptions = options as {
          method?: string;
          body?: Record<string, unknown>;
        };

        if (pathname === "/api/users/rep-1" && requestOptions.method === "PATCH") {
          return {
            user: {
              id: "rep-1",
              name: requestOptions.body?.displayName,
              email: "rep1@apexpress.com",
              role: requestOptions.body?.role,
              isActive: requestOptions.body?.isActive,
            },
            mutation: { affectedRows: 1, returnedId: "rep-1" },
          };
        }

        if (pathname === "/api/users" && requestOptions.method === "POST") {
          return {
            mutation: { affectedRows: 1, insertedId: "rep-2" },
          };
        }

        if (pathname === "/api/customers" && requestOptions.method === "POST") {
          return {
            mutation: { affectedRows: 1, insertedId: "customer-9" },
          };
        }

        if (pathname === "/api/customer-assignments" && requestOptions.method === "POST") {
          return {
            assignments: [
              {
                customerId: requestOptions.body?.customerId,
                repId: "rep-1",
                assignmentRole: "primary",
                isActive: true,
              },
            ],
            mutation: { affectedRows: 1, returnedId: "customer-9" },
          };
        }

        if (pathname === "/api/users") {
          return {
            users: [
              {
                id: "rep-1",
                name: "Rep One",
                email: "rep1@apexpress.com",
                role: "rep",
                isActive: false,
              },
              {
                id: "rep-2",
                name: "Rep Two",
                email: "rep2@apexpress.com",
                role: "rep",
                isActive: true,
              },
            ],
          };
        }

        if (pathname === "/api/customers") {
          return {
            customers: [
              {
                customer_id: "customer-9",
                customer_name: "Northstar",
                emails: ["ops@northstar.example"],
                domains: ["northstar.example"],
                location_id: "apexpress_irwindale",
                is_active: true,
              },
            ],
          };
        }

        if (pathname === "/api/customer-assignments") {
          return {
            assignments: [
              {
                customer_id: "customer-9",
                employee_id: "rep-1",
                assignment_role: "primary",
                location_name: "apexpress_irwindale",
                is_active: true,
              },
            ],
          };
        }

        throw new Error(`Unexpected backend request ${String(pathname)}`);
      }),
    };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const handler = createRequestHandler({
      distDir: path.resolve("."),
      databasePath: path.resolve("tmp-shared.sqlite"),
      store: {
        authProvider: undefined,
      },
      logger,
      authProvider: {
        hasSessionContext: () => true,
      },
      backendApi,
    });
    const { server, origin } = await startTestServer(handler);

    try {
      const userResponse = await nativeFetch(
        `${origin}/api/users/rep-1?sessionId=session-admin`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: "Rep One",
            role: "rep",
            isActive: false,
          }),
        },
      );
      const createUserResponse = await nativeFetch(
        `${origin}/api/users?sessionId=session-admin`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: "Rep Two",
            email: "rep2@apexpress.com",
            role: "rep",
            locationId: "apexpress_irwindale",
          }),
        },
      );
      const customerResponse = await nativeFetch(
        `${origin}/api/customers?sessionId=session-admin`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Northstar",
            emails: ["ops@northstar.example"],
            domains: ["northstar.example"],
            assignedCSRs: [
              {
                repId: "rep-1",
                assignmentRole: "primary",
                isActive: true,
              },
            ],
          }),
        },
      );

      expect(userResponse.status).toBe(200);
      expect(createUserResponse.status).toBe(200);
      expect(customerResponse.status).toBe(200);
      expect(backendApi.requestJson).toHaveBeenCalledWith(
        "/api/users",
        expect.objectContaining({
          method: "POST",
          sessionId: "session-admin",
          body: expect.objectContaining({
            displayName: "Rep Two",
            email: "rep2@apexpress.com",
          }),
        }),
      );
      expect(backendApi.requestJson).toHaveBeenCalledWith(
        "/api/users/rep-1",
        expect.objectContaining({
          method: "PATCH",
          sessionId: "session-admin",
          body: expect.objectContaining({
            userId: "rep-1",
            displayName: "Rep One",
            isActive: false,
          }),
        }),
      );
      expect(backendApi.requestJson).toHaveBeenCalledWith(
        "/api/customers",
        expect.objectContaining({
          method: "POST",
          sessionId: "session-admin",
          body: expect.objectContaining({
            name: "Northstar",
            assignedCSRs: [expect.objectContaining({ repId: "rep-1" })],
          }),
        }),
      );
      expect(backendApi.requestJson).toHaveBeenCalledWith(
        "/api/customer-assignments",
        expect.objectContaining({
          method: "POST",
          sessionId: "session-admin",
          body: expect.objectContaining({
            customerId: "customer-9",
            assignments: [expect.objectContaining({ repId: "rep-1" })],
          }),
        }),
      );
      expect(logger.info).toHaveBeenCalledWith(
        "settings-mutation",
        "Backend mutation route completed.",
        expect.objectContaining({
          backendRoute: "POST /api/customers",
          affectedRows: 1,
          insertedId: "customer-9",
          returnedId: "customer-9",
        }),
      );
      expect(logger.info).toHaveBeenCalledWith(
        "settings-mutation",
        "settingsMutationStarted",
        expect.objectContaining({
          backendRoute: "POST /api/customers",
          payloadSummary: expect.objectContaining({
            assignmentCount: 1,
            hasEmail: true,
          }),
        }),
      );
      expect(logger.info).toHaveBeenCalledWith(
        "settings-mutation",
        "settingsMutationCompleted",
        expect.objectContaining({
          backendRoute: "POST /api/customers",
          affectedRows: 1,
          insertedId: "customer-9",
        }),
      );
      expect(logger.info).toHaveBeenCalledWith(
        "settings-mutation",
        "settingsDataRefreshed",
        expect.objectContaining({
          backendRoute: "POST /api/customers",
          source: "backend_api",
          customersCount: 1,
          assignmentsCount: 1,
        }),
      );
    } finally {
      await closeTestServer(server);
    }
  });

  it("falls back to registered workflow mutation routes when backend REST customer routes are missing", async () => {
    const currentUser = {
      id: "supervisor-1",
      name: "Sam Supervisor",
      initials: "SS",
      email: "sam.supervisor@apexpress.com",
      role: "supervisor",
      locationId: "apexpress_irwindale",
    };
    const assignedRep = {
      id: "rep-1",
      name: "Mia Johnson",
      initials: "MJ",
      email: "mia.johnson@apexpress.com",
      role: "rep",
      locationId: "apexpress_irwindale",
    };
    const localBootstrap = {
      currentUser,
      capabilities: ["manage_customer_ownership"],
      reps: [currentUser, assignedRep],
      customers: [],
      slaSettings: {
        firstResponseSlaMinutes: 60,
        resolutionSlaMinutes: 1440,
        warningThresholdPercent: 75,
        warningMinutesBeforeBreach: 15,
      },
      workflowState: {
        reps: [currentUser, assignedRep],
        currentRepId: currentUser.id,
        threadStates: {},
        threadPresence: {},
        preferences: {
          queueScopeView: "my_queue",
          queueDisplayMode: "list",
          statusFilter: "open",
          showSnoozed: false,
        },
      },
    };
    const mariaDbCustomersTable: Array<{
      customer_id: string;
      customer_name: string;
      emails: string[];
      domains: string[];
      location_id: string;
      is_active: boolean;
    }> = [];
    const mariaDbAssignmentsTable: Array<{
      customer_id: string;
      employee_id: string;
      assignment_role: string;
      location_name: string;
      is_active: boolean;
    }> = [];
    const notFound = () =>
      Object.assign(new Error("Not Found"), {
        code: "http_404",
        statusCode: 404,
      });
    const backendApi = {
      baseUrl: "http://backend.example.test",
      requestJson: vi.fn(async (pathname: unknown, options: unknown) => {
        const requestOptions = options as {
          method?: string;
          body?: Record<string, unknown>;
        };

        if (pathname === "/api/customers" && requestOptions.method === "POST") {
          throw notFound();
        }

        if (pathname === "/api/workflow/customers/upsert") {
          const customer = requestOptions.body?.customer as {
            assignedCSRs?: Array<{
              repId?: string;
              assignmentRole?: string;
              locationName?: string;
              isActive?: boolean;
            }>;
            domains?: string[];
            emails?: string[];
            locationId?: string;
            name?: string;
          };
          const customerId = "customer-101";
          const savedCustomer = {
            customer_id: customerId,
            customer_name: customer.name ?? "Northstar Logistics",
            emails: customer.emails ?? [],
            domains: customer.domains ?? [],
            location_id: customer.locationId ?? "apexpress_irwindale",
            is_active: true,
          };

          mariaDbCustomersTable.splice(0, mariaDbCustomersTable.length, savedCustomer);
          mariaDbAssignmentsTable.splice(
            0,
            mariaDbAssignmentsTable.length,
            ...(customer.assignedCSRs ?? []).map((assignment) => ({
              customer_id: customerId,
              employee_id: assignment.repId ?? "rep-1",
              assignment_role: assignment.assignmentRole ?? "primary",
              location_name: assignment.locationName ?? "apexpress_irwindale",
              is_active: assignment.isActive !== false,
            })),
          );

          return {
            customers: [...mariaDbCustomersTable],
            customerAssignments: [...mariaDbAssignmentsTable],
            mutation: {
              action: "create_customer",
              affectedRows: 2,
              returnedId: customerId,
            },
          };
        }

        if (pathname === "/api/auth/logout") {
          return { sessionId: "session-before" };
        }

        if (pathname === "/api/workflow/bootstrap") {
          return {
            sessionId: "session-after",
            currentUser,
            capabilities: ["manage_customer_ownership"],
            reps: [currentUser, assignedRep],
            customers: [],
            workflowState: {
              reps: [currentUser, assignedRep],
              currentRepId: currentUser.id,
            },
          };
        }

        if (pathname === "/api/customers") {
          return { customers: [...mariaDbCustomersTable] };
        }

        if (pathname === "/api/customer-assignments") {
          return { assignments: [...mariaDbAssignmentsTable] };
        }

        throw new Error(`Unexpected backend request ${String(pathname)}`);
      }),
    };
    const handler = createRequestHandler({
      distDir: path.resolve("."),
      databasePath: path.resolve("tmp-shared.sqlite"),
      store: {
        authProvider: undefined,
        getBootstrap: vi.fn().mockReturnValue(localBootstrap),
        logout: vi.fn(),
        startRuntimeSession: vi.fn(),
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      authProvider: {
        hasSessionContext: () => true,
      },
      backendApi,
    });
    const { server, origin } = await startTestServer(handler);

    try {
      const saveResponse = await nativeFetch(
        `${origin}/api/customers?sessionId=session-before`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Northstar Logistics",
            emails: ["ops@northstar.example"],
            domains: ["northstar.example"],
            assignedCSRs: [
              {
                repId: "rep-1",
                assignmentRole: "primary",
                locationName: "apexpress_irwindale",
                isActive: true,
              },
            ],
            locationId: "apexpress_irwindale",
          }),
        },
      );
      const savePayload = (await saveResponse.json()) as {
        customers?: Array<{ id?: string; domains?: string[] }>;
      };

      expect(saveResponse.status).toBe(200);
      expect(savePayload.customers).toEqual([
        expect.objectContaining({
          id: "customer-101",
          domains: ["northstar.example"],
        }),
      ]);
      expect(mariaDbCustomersTable).toEqual([
        expect.objectContaining({
          customer_id: "customer-101",
          customer_name: "Northstar Logistics",
        }),
      ]);
      expect(mariaDbAssignmentsTable).toEqual([
        expect.objectContaining({
          customer_id: "customer-101",
          employee_id: "rep-1",
        }),
      ]);
      expect(backendApi.requestJson).toHaveBeenCalledWith(
        "/api/workflow/customers/upsert",
        expect.objectContaining({
          method: "POST",
          sessionId: "session-before",
          body: expect.objectContaining({
            customer: expect.objectContaining({
              name: "Northstar Logistics",
              domains: ["northstar.example"],
            }),
          }),
        }),
      );
      expect(backendApi.requestJson).not.toHaveBeenCalledWith(
        "/api/customer-assignments",
        expect.objectContaining({ method: "POST" }),
      );

      await nativeFetch(`${origin}/api/auth/logout?sessionId=session-before`, {
        method: "POST",
      });

      const bootstrapResponse = await nativeFetch(
        `${origin}/api/workflow/bootstrap?sessionId=session-after`,
      );
      const bootstrapPayload = (await bootstrapResponse.json()) as {
        customers?: Array<{ id?: string; domains?: string[] }>;
      };

      expect(bootstrapResponse.status).toBe(200);
      expect(bootstrapPayload.customers).toEqual([
        expect.objectContaining({
          id: "customer-101",
          domains: ["northstar.example"],
        }),
      ]);
    } finally {
      await closeTestServer(server);
    }
  });

  it("routes thread presence reads, upserts, and clears through the shared store", async () => {
    const listThreadPresence = vi.fn().mockReturnValue({
      "thread-1": [
        {
          threadId: "thread-1",
          activeUserId: "rep-1",
          activeUserName: "Mia Johnson",
          activeUserRole: "rep",
          presenceType: "viewing",
          updatedAt: "2026-04-21T12:00:00.000Z",
        },
      ],
    });
    const upsertThreadPresence = vi.fn().mockReturnValue({
      "thread-1": [
        {
          threadId: "thread-1",
          activeUserId: "rep-1",
          activeUserName: "Mia Johnson",
          activeUserRole: "rep",
          presenceType: "working",
          updatedAt: "2026-04-21T12:01:00.000Z",
        },
      ],
    });
    const clearThreadPresence = vi.fn().mockReturnValue({});
    const handler = createRequestHandler({
      distDir: path.resolve("."),
      databasePath: path.resolve("tmp-shared.sqlite"),
      store: {
        authProvider: undefined,
        getSessionSummary: () => ({
          sessionId: "session-active",
          currentUser: { id: "rep-1" },
          capabilities: [],
          reps: [],
        }),
        requireCurrentUser: vi.fn().mockReturnValue({ id: "rep-1" }),
        listThreadPresence,
        upsertThreadPresence,
        clearThreadPresence,
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      authProvider: {
        hasSessionContext: () => true,
      },
    });
    const { server, origin } = await startTestServer(handler);

    try {
      const readResponse = await nativeFetch(
        `${origin}/api/workflow/thread-presence?sessionId=session-active`,
      );
      expect(readResponse.status).toBe(200);
      expect(await readResponse.json()).toMatchObject({
        threadPresence: {
          "thread-1": [{ presenceType: "viewing" }],
        },
      });

      const upsertResponse = await nativeFetch(
        `${origin}/api/workflow/thread-presence?sessionId=session-active`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId: "thread-1",
            presenceType: "working",
          }),
        },
      );
      expect(upsertResponse.status).toBe(200);
      expect(upsertThreadPresence).toHaveBeenCalledWith(
        "session-active",
        "thread-1",
        "working",
      );

      const clearResponse = await nativeFetch(
        `${origin}/api/workflow/thread-presence/clear?sessionId=session-active`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId: "thread-1" }),
        },
      );
      expect(clearResponse.status).toBe(200);
      expect(clearThreadPresence).toHaveBeenCalledWith(
        "session-active",
        "thread-1",
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });

  it("routes customer ownership upserts with domain data through the shared store", async () => {
    const upsertCustomer = vi.fn().mockReturnValue([
      {
        id: "customer-1",
        name: "Nike",
        emails: ["buyer@nike.com"],
        domains: ["nike.com"],
        ownerRepId: "rep-1",
      },
    ]);
    const handler = createRequestHandler({
      distDir: path.resolve("."),
      databasePath: path.resolve("tmp-shared.sqlite"),
      store: {
        authProvider: undefined,
        getSessionSummary: () => ({
          sessionId: "session-active",
          currentUser: { id: "supervisor-1" },
          capabilities: ["manage_customer_ownership"],
          reps: [],
        }),
        upsertCustomer,
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      authProvider: {
        hasSessionContext: () => true,
      },
    });
    const { server, origin } = await startTestServer(handler);

    try {
      const response = await nativeFetch(
        `${origin}/api/workflow/customers/upsert?sessionId=session-active`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer: {
              name: "Nike",
              emails: ["buyer@nike.com"],
              domains: [" nike.com "],
              ownerRepId: "rep-1",
            },
          }),
        },
      );

      expect(response.status).toBe(200);
      expect(upsertCustomer).toHaveBeenCalledWith("session-active", {
        name: "Nike",
        emails: ["buyer@nike.com"],
        domains: [" nike.com "],
        ownerRepId: "rep-1",
      });
      expect(await response.json()).toEqual({
        customers: [
          {
            id: "customer-1",
            name: "Nike",
            emails: ["buyer@nike.com"],
            domains: ["nike.com"],
            ownerRepId: "rep-1",
          },
        ],
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });
});

describe("appServer Outlook webhooks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function createOutlookTestContext(options: {
    authProvider?: Record<string, unknown>;
    processIncomingEmail?: (...args: unknown[]) => Promise<string | null>;
  } = {}) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "action-desk-outlook-"));
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const handler = createRequestHandler({
      distDir: path.resolve("."),
      databasePath: path.join(tempDir, "shared.sqlite"),
      webhookStorePath: path.join(tempDir, "outlook-webhook-state.json"),
      store: {},
      logger,
      authProvider: options.authProvider ?? {},
      processIncomingEmail: options.processIncomingEmail,
    });

    return {
      tempDir,
      logger,
      handler,
    };
  }

  async function cleanupOutlookTestContext(
    server: http.Server,
    tempDir: string,
  ) {
    await closeTestServer(server);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  it("returns the exact plain text validationToken for the webhook route", async () => {
    const { handler, logger, tempDir } = createOutlookTestContext();
    const { server, origin } = await startTestServer(handler);
    const validationToken = "token with spaces & symbols=+/%";

    try {
      const response = await nativeFetch(
        `${origin}/api/outlook/webhook?validationToken=${encodeURIComponent(validationToken)}`,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/plain");
      expect(await response.text()).toBe(validationToken);
      expect(logger.info).toHaveBeenCalledWith(
        "outlook-webhook",
        "outlook-webhook validation",
        expect.objectContaining({ endpoint: "webhook" }),
      );
    } finally {
      await cleanupOutlookTestContext(server, tempDir);
    }
  });

  it("rejects webhook notifications with a bad clientState", async () => {
    vi.stubEnv("ACTION_DESK_OUTLOOK_WEBHOOK_CLIENT_STATE", "correct-secret");

    const { handler, logger, tempDir } = createOutlookTestContext();
    const { server, origin } = await startTestServer(handler);

    try {
      const response = await nativeFetch(`${origin}/api/outlook/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: [
            {
              subscriptionId: "sub-1",
              clientState: "wrong-secret",
              resource: "me/messages/msg-1",
              resourceData: { id: "msg-1" },
            },
          ],
        }),
      });
      const payload = (await response.json()) as {
        error?: { code?: string };
      };

      expect(response.status).toBe(403);
      expect(payload.error?.code).toBe("outlook_webhook_client_state_mismatch");
      expect(logger.warn).toHaveBeenCalledWith(
        "outlook-webhook",
        "outlook-webhook clientState mismatch",
        expect.objectContaining({ endpoint: "webhook" }),
      );
    } finally {
      await cleanupOutlookTestContext(server, tempDir);
    }
  });

  it("accepts correct webhook clientState with 202 and processes asynchronously", async () => {
    vi.stubEnv("ACTION_DESK_OUTLOOK_WEBHOOK_CLIENT_STATE", "correct-secret");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          id: "msg-1",
          conversationId: "thread-1",
          subject: "Need help",
          receivedDateTime: "2026-04-29T12:00:00Z",
          bodyPreview: "Can you help?",
          body: {
            contentType: "text",
            content: "Can you help?",
          },
          from: {
            emailAddress: {
              name: "Customer",
              address: "customer@example.com",
            },
          },
          webLink: "https://outlook.office.com/mail/deeplink/read/msg-1",
          toRecipients: [],
          ccRecipients: [],
          internetMessageHeaders: [],
        }),
    });
    const processIncomingEmail = vi.fn().mockResolvedValue("ticket-1");

    vi.stubGlobal("fetch", fetchMock);

    const { handler, logger, tempDir } = createOutlookTestContext({
      authProvider: {
        getAccessTokenForAvailableSession: vi.fn().mockResolvedValue("token-123"),
      },
      processIncomingEmail,
    });
    const { server, origin } = await startTestServer(handler);

    try {
      const response = await nativeFetch(`${origin}/api/outlook/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: [
            {
              subscriptionId: "sub-1",
              clientState: "correct-secret",
              changeType: "created",
              resource: "me/messages/msg-1",
              resourceData: { id: "msg-1" },
            },
          ],
        }),
      });

      expect(response.status).toBe(202);
      expect(await response.json()).toMatchObject({
        accepted: true,
        notificationCount: 1,
      });
      expect(logger.info).toHaveBeenCalledWith(
        "outlook-webhook",
        "outlook-webhook notification accepted",
        expect.objectContaining({ notificationCount: 1 }),
      );

      await vi.waitFor(() => {
        expect(processIncomingEmail).toHaveBeenCalledWith(
          expect.objectContaining({
            id: "msg-1",
            mailboxId: "me",
            subject: "Need help",
          }),
          "webhook",
        );
      });
      await vi.waitFor(() => {
        const state = JSON.parse(
          fs.readFileSync(path.join(tempDir, "outlook-webhook-state.json"), "utf8"),
        ) as { notifications?: Array<{ status?: string }> };

        expect(state.notifications?.[0]?.status).toBe("ingested");
      });
    } finally {
      await cleanupOutlookTestContext(server, tempDir);
    }
  });

  it("creates a Graph subscription with notification, lifecycle, resource, expiration, and clientState", async () => {
    vi.stubEnv("ACTION_DESK_PUBLIC_BASE_URL", "https://public.example.test/");
    vi.stubEnv("ACTION_DESK_OUTLOOK_WEBHOOK_CLIENT_STATE", "correct-secret");
    vi.stubEnv(
      "ACTION_DESK_OUTLOOK_WEBHOOK_RESOURCE",
      "/me/mailFolders('Inbox')/messages",
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () =>
        JSON.stringify({
          id: "sub-1",
          resource: "/me/mailFolders('Inbox')/messages",
          expirationDateTime: "2026-05-05T11:50:00.000Z",
        }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const { handler, tempDir } = createOutlookTestContext();
    const { server, origin } = await startTestServer(handler);

    try {
      const response = await nativeFetch(
        `${origin}/api/outlook/subscriptions/create`,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer graph-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );
      const payload = (await response.json()) as {
        subscription?: {
          id?: string;
          clientStateLast4?: string;
          clientStateHash?: string;
        };
      };

      expect(response.status).toBe(200);
      expect(payload.subscription).toMatchObject({
        id: "sub-1",
        clientStateLast4: "cret",
      });
      expect(payload.subscription?.clientStateHash).toHaveLength(64);

      const [url, init] = fetchMock.mock.calls[0] ?? [];
      const graphPayload = JSON.parse(String(init?.body));

      expect(url).toBe("https://graph.microsoft.com/v1.0/subscriptions");
      expect(init?.method).toBe("POST");
      expect(graphPayload).toMatchObject({
        changeType: "created",
        notificationUrl: "https://public.example.test/api/outlook/webhook",
        lifecycleNotificationUrl:
          "https://public.example.test/api/outlook/lifecycle",
        resource: "/me/mailFolders('Inbox')/messages",
        clientState: "correct-secret",
      });
      expect(Date.parse(graphPayload.expirationDateTime)).not.toBeNaN();
    } finally {
      await cleanupOutlookTestContext(server, tempDir);
    }
  });

  it("renews a Graph subscription with PATCH and updates expirationDateTime", async () => {
    vi.stubEnv("ACTION_DESK_PUBLIC_BASE_URL", "https://public.example.test");
    vi.stubEnv("ACTION_DESK_OUTLOOK_WEBHOOK_CLIENT_STATE", "correct-secret");
    vi.stubEnv(
      "ACTION_DESK_OUTLOOK_WEBHOOK_RESOURCE",
      "/me/mailFolders('Inbox')/messages",
    );

    const renewedExpiration = "2026-05-05T12:30:00.000Z";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            id: "sub-renew",
            resource: "/me/mailFolders('Inbox')/messages",
            expirationDateTime: "2026-05-05T11:50:00.000Z",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: "sub-renew",
            resource: "/me/mailFolders('Inbox')/messages",
            expirationDateTime: renewedExpiration,
          }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const { handler, tempDir } = createOutlookTestContext();
    const { server, origin } = await startTestServer(handler);

    try {
      const createResponse = await nativeFetch(
        `${origin}/api/outlook/subscriptions/create`,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer graph-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );
      expect(createResponse.status).toBe(200);

      const renewResponse = await nativeFetch(
        `${origin}/api/outlook/subscriptions/renew`,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer graph-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ subscriptionId: "sub-renew" }),
        },
      );
      const renewPayload = (await renewResponse.json()) as {
        subscription?: { expirationDateTime?: string };
      };

      expect(renewResponse.status).toBe(200);
      expect(renewPayload.subscription?.expirationDateTime).toBe(renewedExpiration);

      const [url, init] = fetchMock.mock.calls[1] ?? [];
      const graphPayload = JSON.parse(String(init?.body));

      expect(url).toBe(
        "https://graph.microsoft.com/v1.0/subscriptions/sub-renew",
      );
      expect(init?.method).toBe("PATCH");
      expect(Date.parse(graphPayload.expirationDateTime)).not.toBeNaN();
    } finally {
      await cleanupOutlookTestContext(server, tempDir);
    }
  });

  it("creates a saved Outlook reply draft with the Action Desk reply text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () =>
        JSON.stringify({
          id: "draft-1",
          subject: "Re: Need help",
          webLink: "https://outlook.office.com/mail/deeplink/compose/draft-1",
        }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const { handler, tempDir } = createOutlookTestContext({
      authProvider: {
        getAccessTokenForSession: vi.fn().mockResolvedValue("token-123"),
      },
    });
    const { server, origin } = await startTestServer(handler);

    try {
      const response = await nativeFetch(`${origin}/api/outlook/reply-drafts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-action-desk-session-id": "session-active",
        },
        body: JSON.stringify({
          messageId: "msg-1",
          replyText: "Hi,\n\nI will check this shipment.\n\nBest,\nSupport Team",
        }),
      });
      const payload = (await response.json()) as {
        draft?: { id?: string; webLink?: string };
        webLink?: string;
      };
      const [url, init] = fetchMock.mock.calls[0] ?? [];
      const graphPayload = JSON.parse(String(init?.body));

      expect(response.status).toBe(200);
      expect(payload.draft).toMatchObject({
        id: "draft-1",
        webLink: "https://outlook.office.com/mail/deeplink/compose/draft-1",
      });
      expect(payload.webLink).toBe(
        "https://outlook.office.com/mail/deeplink/compose/draft-1",
      );
      expect(url).toBe("https://graph.microsoft.com/v1.0/me/messages/msg-1/createReply");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer token-123",
        "Content-Type": "application/json",
      });
      expect(graphPayload).toEqual({
        comment: "Hi,\n\nI will check this shipment.\n\nBest,\nSupport Team",
      });
      expect(String(url)).not.toContain("/send");
    } finally {
      await cleanupOutlookTestContext(server, tempDir);
    }
  });
});
