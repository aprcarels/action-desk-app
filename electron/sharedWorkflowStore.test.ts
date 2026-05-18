import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { SharedWorkflowStore } = require("./sharedWorkflowStore.cjs") as {
  SharedWorkflowStore: new (
    databasePath: string,
    options?: {
      enableDemoData?: boolean;
      logger?: Record<string, (...args: unknown[]) => void>;
    },
  ) => {
    database: { close: () => void };
    startSessionForIdentity: (
      sessionId: string,
      identity: { entraObjectId: string; email: string },
    ) => { sessionId: string };
    saveSlaSettings: (
      sessionId: string,
      settings: {
        firstResponseSlaMinutes: number;
        resolutionSlaMinutes: number;
        warningThresholdPercent: number;
        warningMinutesBeforeBreach: number;
      },
    ) => {
      firstResponseSlaMinutes: number;
      resolutionSlaMinutes: number;
      warningThresholdPercent: number;
      warningMinutesBeforeBreach: number;
      updatedAt?: string;
      updatedByRepId?: string;
      updatedByRepName?: string;
    };
    getSlaSettings: () => {
      firstResponseSlaMinutes: number;
      resolutionSlaMinutes: number;
      warningThresholdPercent: number;
      warningMinutesBeforeBreach: number;
      updatedAt?: string;
      updatedByRepId?: string;
      updatedByRepName?: string;
    };
    createTestQueueData: (sessionId: string) => { createdCount: number };
    listTestQueueEmails: (sessionId: string) => unknown[];
    removeTestQueueData: (sessionId: string) => { removedCount: number };
    listUsersInternal: () => Array<{
      id: string;
      email: string;
      isActive: boolean;
    }>;
    deactivateUser: (sessionId: string, userId: string) => Array<{
      id: string;
      isActive: boolean;
    }>;
    upsertCustomer: (
      sessionId: string,
      draft: {
        id?: string;
        name: string;
        emails: string[];
        domains: string[];
        ownerRepId?: string;
      },
    ) => Array<{
      id: string;
      name: string;
      emails: string[];
      domains: string[];
      ownerRepId?: string;
    }>;
    saveThreadState: (
      sessionId: string,
      threadId: string,
      threadState: {
        autoAssignment?: {
          type: "auto";
          assignedRepId: string;
          assignedRepName: string;
          assignedAt: string;
        };
        assignmentHistory: unknown[];
        notes: unknown[];
        replyLog: unknown[];
      },
    ) => {
      autoAssignment?: {
        type: "auto";
        assignedRepId: string;
        assignedRepName: string;
        assignedAt: string;
      };
    };
    getBootstrap: (sessionId: string) => {
      customers: Array<{
        id: string;
        name: string;
        emails: string[];
        domains: string[];
        ownerRepId?: string;
        locationId?: string;
      }>;
      workflowState: {
        threadStates: Record<
          string,
          {
            autoAssignment?: {
              type: "auto";
              assignedRepId: string;
              assignedRepName: string;
              assignedAt: string;
            };
          }
        >;
      };
    };
  };
};

const canUseNativeSqlite = (() => {
  try {
    const Database = require("better-sqlite3") as new (
      databasePath: string,
    ) => { close: () => void };
    const database = new Database(":memory:");
    database.close();
    return true;
  } catch {
    return false;
  }
})();

const describeWithNativeSqlite = canUseNativeSqlite ? describe : describe.skip;

describeWithNativeSqlite("SharedWorkflowStore customer domains", () => {
  const tempDirectories: string[] = [];
  const stores: Array<{ database: { close: () => void } }> = [];

  afterEach(() => {
    for (const store of stores.splice(0)) {
      store.database.close();
    }

    for (const directory of tempDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function createStore() {
    const tempDirectory = mkdtempSync(join(tmpdir(), "action-desk-customer-domains-"));
    const databasePath = join(tempDirectory, "shared.sqlite");
    const store = new SharedWorkflowStore(databasePath, {
      enableDemoData: true,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });
    tempDirectories.push(tempDirectory);
    stores.push(store);

    const session = store.startSessionForIdentity("session-admin", {
      entraObjectId: "entra-admin-1",
      email: "sam.lee@actiondesk.local",
    });

    return {
      store,
      sessionId: session.sessionId,
    };
  }

  function startSession(
    store: InstanceType<typeof SharedWorkflowStore>,
    sessionId: string,
    email: string,
    entraObjectId: string,
  ) {
    return store.startSessionForIdentity(sessionId, {
      entraObjectId,
      email,
    }).sessionId;
  }

  it("does not load demo users unless demo data is explicitly enabled", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "action-desk-no-demo-users-"));
    const databasePath = join(tempDirectory, "shared.sqlite");
    const store = new SharedWorkflowStore(databasePath, {
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });
    tempDirectories.push(tempDirectory);
    stores.push(store);

    expect(store.listUsersInternal()).toEqual([]);
  });

  it("does not reactivate deactivated demo users during demo seeding", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "action-desk-demo-reactivate-"));
    const databasePath = join(tempDirectory, "shared.sqlite");
    const store = new SharedWorkflowStore(databasePath, {
      enableDemoData: true,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });
    tempDirectories.push(tempDirectory);
    stores.push(store);
    const session = store.startSessionForIdentity("session-admin", {
      entraObjectId: "entra-admin-1",
      email: "sam.lee@actiondesk.local",
    });

    store.deactivateUser(session.sessionId, "rep-mj");
    store.database.close();
    stores.pop();

    const restartedStore = new SharedWorkflowStore(databasePath, {
      enableDemoData: true,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });
    stores.push(restartedStore);

    expect(
      restartedStore
        .listUsersInternal()
        .find((user) => user.id === "rep-mj")?.isActive,
    ).toBe(false);
  });

  it("hides persisted test queue data unless demo data is explicitly enabled", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "action-desk-test-data-gate-"));
    const databasePath = join(tempDirectory, "shared.sqlite");
    const store = new SharedWorkflowStore(databasePath, {
      enableDemoData: true,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });
    tempDirectories.push(tempDirectory);
    stores.push(store);
    const session = store.startSessionForIdentity("session-admin", {
      entraObjectId: "entra-admin-1",
      email: "sam.lee@actiondesk.local",
    });

    expect(store.createTestQueueData(session.sessionId)).toEqual({ createdCount: 6 });
    expect(store.listTestQueueEmails(session.sessionId)).toHaveLength(6);
    store.database.close();
    stores.pop();

    const restartedStore = new SharedWorkflowStore(databasePath, {
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });
    stores.push(restartedStore);

    expect(restartedStore.listTestQueueEmails(session.sessionId)).toEqual([]);
    expect(() => restartedStore.createTestQueueData(session.sessionId)).toThrow(
      /demo queue data is disabled/i,
    );
  });

  it("persists normalized domains alongside exact email addresses", () => {
    const { store, sessionId } = createStore();

    const customers = store.upsertCustomer(sessionId, {
      name: "Nike",
      emails: ["buyer@nike.com"],
      domains: [" Nike.com ", "@nike.com"],
      ownerRepId: "rep-mj",
    });

    expect(customers[0]).toMatchObject({
      name: "Nike",
      emails: ["buyer@nike.com"],
      domains: ["nike.com"],
      ownerRepId: "rep-mj",
    });
  });

  it("keeps all saved customers in bootstrap instead of collapsing to one", () => {
    const { store, sessionId } = createStore();

    store.upsertCustomer(sessionId, {
      name: "Nike",
      emails: ["buyer@nike.com"],
      domains: ["nike.com"],
      ownerRepId: "rep-mj",
    });
    store.upsertCustomer(sessionId, {
      name: "Acme",
      emails: ["buyer@acme.com"],
      domains: ["acme.com"],
      ownerRepId: "rep-ar",
    });

    expect(store.getBootstrap(sessionId).customers.map((customer) => customer.name)).toEqual([
      "Acme",
      "Nike",
    ]);
  });

  it("blocks public mailbox domains from being saved", () => {
    const { store, sessionId } = createStore();

    expect(() =>
      store.upsertCustomer(sessionId, {
        name: "Personal Contact",
        emails: [],
        domains: ["gmail.com"],
      }),
    ).toThrow(/gmail\.com is blocked/i);
  });

  it("prevents duplicate domains across customers", () => {
    const { store, sessionId } = createStore();

    store.upsertCustomer(sessionId, {
      name: "Nike",
      emails: [],
      domains: ["nike.com"],
      ownerRepId: "rep-mj",
    });

    expect(() =>
      store.upsertCustomer(sessionId, {
        name: "Nike UK",
        emails: [],
        domains: [" NIKE.com "],
        ownerRepId: "rep-ar",
      }),
    ).toThrow(/nike\.com is already assigned to Nike/i);
  });

  it("persists SLA settings in the shared store", () => {
    const { store, sessionId } = createStore();

    const saved = store.saveSlaSettings(sessionId, {
      firstResponseSlaMinutes: 45,
      resolutionSlaMinutes: 12 * 60,
      warningThresholdPercent: 80,
      warningMinutesBeforeBreach: 20,
    });

    expect(saved).toMatchObject({
      firstResponseSlaMinutes: 45,
      resolutionSlaMinutes: 12 * 60,
      warningThresholdPercent: 80,
      warningMinutesBeforeBreach: 20,
      updatedByRepId: "admin-sl",
      updatedByRepName: "Sam Lee",
    });
    expect(store.getSlaSettings()).toMatchObject({
      firstResponseSlaMinutes: 45,
      resolutionSlaMinutes: 12 * 60,
      warningThresholdPercent: 80,
      warningMinutesBeforeBreach: 20,
    });
  });

  it("persists auto assignment in shared workflow state across reloads", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "action-desk-auto-assignment-"));
    const databasePath = join(tempDirectory, "shared.sqlite");
    const store = new SharedWorkflowStore(databasePath, {
      enableDemoData: true,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });
    tempDirectories.push(tempDirectory);
    stores.push(store);
    const session = store.startSessionForIdentity("session-admin", {
      entraObjectId: "entra-admin-1",
      email: "sam.lee@actiondesk.local",
    });

    store.saveThreadState(session.sessionId, "customer:customer-1", {
      autoAssignment: {
        type: "auto",
        assignedRepId: "rep-mj",
        assignedRepName: "Mia Johnson",
        assignedAt: "2026-04-21T12:00:00.000Z",
      },
      assignmentHistory: [],
      notes: [],
      replyLog: [],
    });
    store.database.close();
    stores.pop();

    const restartedStore = new SharedWorkflowStore(databasePath, {
      enableDemoData: true,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });
    stores.push(restartedStore);

    expect(
      restartedStore.getBootstrap(session.sessionId).workflowState.threadStates[
        "customer:customer-1"
      ]?.autoAssignment,
    ).toMatchObject({
      type: "auto",
      assignedRepId: "rep-mj",
      assignedRepName: "Mia Johnson",
    });
  });

  it("blocks reps from editing shared SLA settings", () => {
    const { store } = createStore();
    const repSessionId = startSession(
      store,
      "session-rep",
      "mia.johnson@actiondesk.local",
      "entra-rep-1",
    );

    expect(() =>
      store.saveSlaSettings(repSessionId, {
        firstResponseSlaMinutes: 30,
        resolutionSlaMinutes: 8 * 60,
        warningThresholdPercent: 70,
        warningMinutesBeforeBreach: 10,
      }),
    ).toThrow(/not allowed/i);
  });

  it("lets admins create and remove shared test queue data", () => {
    const { store, sessionId } = createStore();

    expect(store.createTestQueueData(sessionId)).toEqual({ createdCount: 6 });
    expect(store.listTestQueueEmails(sessionId)).toHaveLength(6);
    expect(store.listTestQueueEmails(sessionId)[0]?.subject).toContain("TEST DATA");
    expect(store.removeTestQueueData(sessionId)).toEqual({ removedCount: 6 });
    expect(store.listTestQueueEmails(sessionId)).toEqual([]);
  });
});
