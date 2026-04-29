import http from "node:http";
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
  }) => http.RequestListener;
};

type Role = "rep" | "supervisor" | "admin";

type ManagedUser = {
  id: string;
  displayName: string;
  initials: string;
  email: string;
  role: Role;
  isActive: boolean;
  hasSignedIn: boolean;
  mappingStatus: "mapped" | "pending_first_sign_in";
  createdAt: string;
  updatedAt: string;
};

type SessionRecord = {
  role: Role;
  userId: string;
};

type InvalidatedSession = {
  code: "access_changed" | "deactivated";
  sessionId: string;
};

type TestStore = {
  authProvider?: Record<string, unknown>;
  sessions: Map<string, SessionRecord>;
  invalidatedSessions: Map<string, InvalidatedSession>;
  users: ManagedUser[];
  getSessionSummary: (sessionId: string) => {
    sessionId: string;
    currentUser: null | { id: string; role: Role };
    capabilities: string[];
    reps: never[];
  };
  getInvalidatedSessionState: (sessionId: string) => InvalidatedSession | null;
  getBootstrap: ReturnType<typeof vi.fn>;
  listUsers: (sessionId: string) => ManagedUser[];
  updateUser: (sessionId: string, payload: Record<string, unknown>) => ManagedUser[];
  deactivateUser: (sessionId: string, userId: string) => ManagedUser[];
};

type TestContext = {
  server: http.Server;
  origin: string;
  signOutSession: ReturnType<typeof vi.fn>;
  store: TestStore;
};

function createManagedUser(
  input: Partial<ManagedUser> &
    Pick<ManagedUser, "id" | "displayName" | "initials" | "email" | "role" | "isActive">,
): ManagedUser {
  const now = new Date().toISOString();

  return {
    createdAt: now,
    updatedAt: now,
    hasSignedIn: true,
    mappingStatus: "mapped",
    ...input,
  };
}

function requireAdmin(store: TestStore, sessionId: string) {
  const session = store.sessions.get(sessionId);

  if (!session) {
    throw new Error("You must sign in before using the shared workflow.");
  }

  if (session.role !== "admin") {
    throw new Error("You are not allowed to perform this action.");
  }
}

function getCapabilitiesForRole(role: Role) {
  return role === "admin" ? ["manage_users"] : [];
}

function createStore(options?: { secondAdmin?: boolean }): TestStore {
  const users: ManagedUser[] = [
    createManagedUser({
      id: "rep-mj",
      displayName: "Mia Johnson",
      initials: "MJ",
      email: "mia.johnson@actiondesk.local",
      role: "rep",
      isActive: true,
    }),
    createManagedUser({
      id: "rep-lc",
      displayName: "Logan Chen",
      initials: "LC",
      email: "logan.chen@actiondesk.local",
      role: options?.secondAdmin ? "admin" : "supervisor",
      isActive: true,
    }),
    createManagedUser({
      id: "admin-sl",
      displayName: "Sam Lee",
      initials: "SL",
      email: "sam.lee@actiondesk.local",
      role: "admin",
      isActive: true,
    }),
  ];

  const sessions = new Map<string, SessionRecord>([
    ["session-admin", { role: "admin", userId: "admin-sl" }],
    ["session-mia", { role: "rep", userId: "rep-mj" }],
    [
      "session-logan",
      {
        role: options?.secondAdmin ? "admin" : "supervisor",
        userId: "rep-lc",
      },
    ],
  ]);
  const invalidatedSessions = new Map<string, InvalidatedSession>();

  const store: TestStore = {
    sessions,
    invalidatedSessions,
    users,
    getSessionSummary(sessionId) {
      const session = store.sessions.get(sessionId);
      const user = store.users.find((entry) => entry.id === session?.userId && entry.isActive);

      return {
        sessionId,
        currentUser:
          session && user
            ? {
                id: session.userId,
                role: session.role,
              }
            : null,
        capabilities: user ? getCapabilitiesForRole(session.role) : [],
        reps: [],
      };
    },
    getInvalidatedSessionState(sessionId) {
      return store.invalidatedSessions.get(sessionId) ?? null;
    },
    getBootstrap: vi.fn(),
    listUsers(sessionId) {
      requireAdmin(store, sessionId);
      return [...store.users];
    },
    updateUser(sessionId, payload) {
      requireAdmin(store, sessionId);
      const user = store.users.find((entry) => entry.id === payload.userId);

      if (!user) {
        throw new Error("User not found.");
      }

      const nextRole = (payload.role as Role) || user.role;
      const nextIsActive = payload.isActive === undefined ? user.isActive : payload.isActive === true;
      const didRoleChange = nextRole !== user.role;
      const didActiveStateChange = nextIsActive !== user.isActive;

      user.displayName = String(payload.displayName || user.displayName);
      user.initials = String(payload.initials || user.initials);
      user.role = nextRole;
      user.isActive = nextIsActive;
      user.updatedAt = new Date().toISOString();

      if (didRoleChange || didActiveStateChange) {
        for (const [activeSessionId, activeSession] of [...store.sessions.entries()]) {
          if (activeSession.userId !== user.id) {
            continue;
          }

          store.sessions.delete(activeSessionId);
          store.authProvider?.signOutSession?.(activeSessionId);
          store.invalidatedSessions.set(activeSessionId, {
            code: nextIsActive ? "access_changed" : "deactivated",
            sessionId: activeSessionId,
          });
        }
      }

      return [...store.users];
    },
    deactivateUser(sessionId, userId) {
      return store.updateUser(sessionId, {
        userId,
        isActive: false,
      });
    },
  };

  return store;
}

async function startServer(options?: { secondAdmin?: boolean }) {
  const store = createStore(options);
  const signOutSession = vi.fn();
  const server = http.createServer(
    createRequestHandler({
      distDir: path.resolve("."),
      databasePath: path.resolve("tmp-shared.sqlite"),
      store,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      authProvider: {
        hasSessionContext: (sessionId: string) => store.sessions.has(sessionId),
        signOutSession,
      },
    }),
  );

  store.authProvider = {
    hasSessionContext: (sessionId: string) => store.sessions.has(sessionId),
    signOutSession,
  };

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
    signOutSession,
    store,
  };
}

async function postJson(context: TestContext, pathname: string, body: Record<string, unknown>) {
  const response = await nativeFetch(`${context.origin}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  return { response, payload };
}

async function getJson(context: TestContext, pathname: string, sessionId: string) {
  const response = await nativeFetch(`${context.origin}${pathname}?sessionId=${sessionId}`);
  const payload = await response.json();
  return { response, payload };
}

describe("user session invalidation routes", () => {
  const contexts: TestContext[] = [];

  afterEach(async () => {
    while (contexts.length > 0) {
      const context = contexts.pop();

      if (context) {
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
    }
  });

  it("keeps the admin logged in when updating another user's role", async () => {
    const context = await startServer();
    contexts.push(context);

    const { response } = await postJson(context, "/api/admin/users/update", {
      sessionId: "session-admin",
      userId: "rep-mj",
      role: "supervisor",
    });
    const sessionState = await getJson(context, "/api/auth/session", "session-admin");

    expect(response.status).toBe(200);
    expect(context.store.sessions.has("session-admin")).toBe(true);
    expect(context.store.sessions.has("session-mia")).toBe(false);
    expect(context.store.getInvalidatedSessionState("session-mia")).toMatchObject({
      code: "access_changed",
    });
    expect(context.store.sessions.has("session-logan")).toBe(true);
    expect(sessionState.payload.currentUser).toMatchObject({
      id: "admin-sl",
      role: "admin",
    });
    expect(context.signOutSession).not.toHaveBeenCalledWith("session-admin");
  });

  it("keeps the admin logged in when deactivating another user and leaves unrelated sessions valid", async () => {
    const context = await startServer();
    contexts.push(context);

    const { response } = await postJson(context, "/api/admin/users/deactivate", {
      sessionId: "session-admin",
      userId: "rep-mj",
    });
    const adminSession = await getJson(context, "/api/auth/session", "session-admin");
    const loganSession = await getJson(context, "/api/auth/session", "session-logan");

    expect(response.status).toBe(200);
    expect(context.store.sessions.has("session-admin")).toBe(true);
    expect(context.store.sessions.has("session-mia")).toBe(false);
    expect(context.store.getInvalidatedSessionState("session-mia")).toMatchObject({
      code: "deactivated",
    });
    expect(adminSession.payload.currentUser).toMatchObject({
      id: "admin-sl",
    });
    expect(loganSession.payload.currentUser).toMatchObject({
      id: "rep-lc",
    });
    expect(context.signOutSession).toHaveBeenCalledTimes(1);
    expect(context.signOutSession).toHaveBeenCalledWith("session-mia");
    expect(context.signOutSession).not.toHaveBeenCalledWith("session-admin");
    expect(context.signOutSession).not.toHaveBeenCalledWith("session-logan");
  });

  it("blocks a deactivated user from continuing to use protected routes", async () => {
    const context = await startServer();
    contexts.push(context);

    await postJson(context, "/api/admin/users/deactivate", {
      sessionId: "session-admin",
      userId: "rep-mj",
    });

    const sessionResponse = await getJson(context, "/api/auth/session", "session-mia");
    const bootstrapResponse = await getJson(context, "/api/workflow/bootstrap", "session-mia");

    expect(sessionResponse.payload).toMatchObject({
      currentUser: null,
      staleSessionCleared: true,
      authMessage: "Your access changed. Please sign in again.",
    });
    expect(bootstrapResponse.response.status).toBe(401);
    expect(bootstrapResponse.payload.error).toMatchObject({
      code: "access_changed",
      message: "Your access changed. Please sign in again.",
    });
  });

  it("forces reauthentication with an access-changed message when an admin updates their own role", async () => {
    const context = await startServer({ secondAdmin: true });
    contexts.push(context);

    const { response } = await postJson(context, "/api/admin/users/update", {
      sessionId: "session-admin",
      userId: "admin-sl",
      role: "supervisor",
    });
    const sessionResponse = await getJson(context, "/api/auth/session", "session-admin");
    const bootstrapResponse = await getJson(context, "/api/workflow/bootstrap", "session-admin");

    expect(response.status).toBe(200);
    expect(context.store.sessions.has("session-admin")).toBe(false);
    expect(context.store.getInvalidatedSessionState("session-admin")).toMatchObject({
      code: "access_changed",
    });
    expect(sessionResponse.payload).toMatchObject({
      currentUser: null,
      staleSessionCleared: true,
      authMessage: "Your access changed. Please sign in again.",
    });
    expect(bootstrapResponse.response.status).toBe(401);
    expect(bootstrapResponse.payload.error).toMatchObject({
      code: "access_changed",
      message: "Your access changed. Please sign in again.",
    });
  });

  it("does not clear sessions for profile-only edits that do not change access", async () => {
    const context = await startServer();
    contexts.push(context);

    const { response } = await postJson(context, "/api/admin/users/update", {
      sessionId: "session-admin",
      userId: "rep-mj",
      displayName: "Mia J.",
      initials: "MIA",
    });
    const miaSession = await getJson(context, "/api/auth/session", "session-mia");

    expect(response.status).toBe(200);
    expect(context.store.sessions.has("session-admin")).toBe(true);
    expect(context.store.sessions.has("session-mia")).toBe(true);
    expect(context.store.invalidatedSessions.size).toBe(0);
    expect(miaSession.payload.currentUser).toMatchObject({
      id: "rep-mj",
      role: "rep",
    });
  });

  it("forces reauthentication only for self when an admin deactivates their own account", async () => {
    const context = await startServer({ secondAdmin: true });
    contexts.push(context);

    const { response } = await postJson(context, "/api/admin/users/deactivate", {
      sessionId: "session-admin",
      userId: "admin-sl",
    });
    const sessionResponse = await getJson(context, "/api/auth/session", "session-admin");
    const bootstrapResponse = await getJson(context, "/api/workflow/bootstrap", "session-admin");
    const otherAdminSession = await getJson(context, "/api/auth/session", "session-logan");

    expect(response.status).toBe(200);
    expect(context.store.sessions.has("session-admin")).toBe(false);
    expect(context.store.sessions.has("session-logan")).toBe(true);
    expect(context.store.getInvalidatedSessionState("session-admin")).toMatchObject({
      code: "deactivated",
    });
    expect(sessionResponse.payload).toMatchObject({
      currentUser: null,
      staleSessionCleared: true,
      authMessage: "Your access changed. Please sign in again.",
    });
    expect(bootstrapResponse.response.status).toBe(401);
    expect(bootstrapResponse.payload.error).toMatchObject({
      code: "access_changed",
      message: "Your access changed. Please sign in again.",
    });
    expect(otherAdminSession.payload.currentUser).toMatchObject({
      id: "rep-lc",
      role: "admin",
    });
    expect(context.signOutSession).toHaveBeenCalledTimes(1);
    expect(context.signOutSession).toHaveBeenCalledWith("session-admin");
  });
});
