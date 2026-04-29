import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

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
  entraObjectId?: string;
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

type TestStore = {
  authProvider?: Record<string, unknown>;
  sessions: Map<string, { role: Role }>;
  users: ManagedUser[];
  getSessionSummary: (sessionId: string) => { currentUser: null | { id: string; role: Role } };
  listUsers: (sessionId: string) => ManagedUser[];
  createUser: (sessionId: string, payload: Record<string, unknown>) => ManagedUser[];
  updateUser: (sessionId: string, payload: Record<string, unknown>) => ManagedUser[];
  deactivateUser: (sessionId: string, userId: string) => ManagedUser[];
};

type TestContext = {
  server: http.Server;
  origin: string;
  store: TestStore;
};

function createManagedUser(input: Partial<ManagedUser> & Pick<ManagedUser, "id" | "displayName" | "initials" | "email" | "role" | "isActive">): ManagedUser {
  const now = new Date().toISOString();

  return {
    createdAt: now,
    updatedAt: now,
    hasSignedIn: false,
    mappingStatus: "pending_first_sign_in",
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

function createStore(): TestStore {
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
      role: "supervisor",
      isActive: true,
    }),
    createManagedUser({
      id: "admin-sl",
      displayName: "Sam Lee",
      initials: "SL",
      email: "sam.lee@actiondesk.local",
      role: "admin",
      isActive: true,
      hasSignedIn: true,
      entraObjectId: "entra-admin",
      mappingStatus: "mapped",
    }),
  ];
  const sessions = new Map<string, { role: Role }>([
    ["session-admin", { role: "admin" }],
    ["session-supervisor", { role: "supervisor" }],
  ]);

  const store: TestStore = {
    sessions,
    users,
    getSessionSummary(sessionId) {
      const session = store.sessions.get(sessionId);

      return {
        currentUser: session
          ? {
              id: sessionId,
              role: session.role,
            }
          : null,
      };
    },
    listUsers(sessionId) {
      requireAdmin(store, sessionId);
      return [...store.users];
    },
    createUser(sessionId, payload) {
      requireAdmin(store, sessionId);
      const now = new Date().toISOString();

      store.users.push(
        createManagedUser({
          id: `rep-${store.users.length + 1}`,
          displayName: String(payload.displayName),
          initials: String(payload.initials || "RP"),
          email: String(payload.email),
          role: (payload.role as Role) || "rep",
          isActive: payload.isActive !== false,
          createdAt: now,
          updatedAt: now,
        }),
      );

      return [...store.users];
    },
    updateUser(sessionId, payload) {
      requireAdmin(store, sessionId);
      const user = store.users.find((entry) => entry.id === payload.userId);

      if (!user) {
        throw new Error("User not found.");
      }

      user.displayName = String(payload.displayName || user.displayName);
      user.initials = String(payload.initials || user.initials);
      user.role = (payload.role as Role) || user.role;
      user.isActive = payload.isActive === undefined ? user.isActive : payload.isActive === true;
      user.updatedAt = new Date().toISOString();

      return [...store.users];
    },
    deactivateUser(sessionId, userId) {
      requireAdmin(store, sessionId);
      const user = store.users.find((entry) => entry.id === userId);

      if (!user) {
        throw new Error("User not found.");
      }

      user.isActive = false;
      user.updatedAt = new Date().toISOString();

      return [...store.users];
    },
  };

  return store;
}

async function startServer() {
  const store = createStore();
  const server = http.createServer(
    createRequestHandler({
      distDir: path.resolve("."),
      databasePath: path.resolve("tmp-shared.sqlite"),
      store,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      authProvider: {
        hasSessionContext: () => true,
        signOutSession: () => {},
      },
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

async function getJson(context: TestContext, pathname: string, sessionId: string) {
  const response = await nativeFetch(`${context.origin}${pathname}?sessionId=${sessionId}`);
  const payload = await response.json();
  return { response, payload };
}

async function postJson(
  context: TestContext,
  pathname: string,
  body: Record<string, unknown>,
) {
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

describe("admin user management routes", () => {
  const contexts: TestContext[] = [];

  afterEach(async () => {
    while (contexts.length > 0) {
      const context = contexts.pop();

      if (context) {
        await stopServer(context);
      }
    }
  });

  it("lets an admin list users with mapping status details", async () => {
    const context = await startServer();
    contexts.push(context);

    const { response, payload } = await getJson(context, "/api/admin/users", "session-admin");
    const adminUser = payload.users.find((user: ManagedUser) => user.email === "sam.lee@actiondesk.local");
    const pendingUser = payload.users.find((user: ManagedUser) => user.email === "mia.johnson@actiondesk.local");

    expect(response.status).toBe(200);
    expect(adminUser).toMatchObject({
      hasSignedIn: true,
      mappingStatus: "mapped",
    });
    expect(pendingUser).toMatchObject({
      hasSignedIn: false,
      mappingStatus: "pending_first_sign_in",
    });
  });

  it("lets an admin add a new Action Desk user", async () => {
    const context = await startServer();
    contexts.push(context);

    const { response, payload } = await postJson(context, "/api/admin/users/create", {
      sessionId: "session-admin",
      displayName: "Jordan Kim",
      initials: "JK",
      email: "jordan.kim@actiondesk.local",
      role: "rep",
      isActive: true,
    });
    const createdUser = payload.users.find((user: ManagedUser) => user.email === "jordan.kim@actiondesk.local");

    expect(response.status).toBe(200);
    expect(createdUser).toMatchObject({
      displayName: "Jordan Kim",
      initials: "JK",
      role: "rep",
      isActive: true,
      hasSignedIn: false,
      mappingStatus: "pending_first_sign_in",
    });
  });

  it("lets an admin update a user's role and profile fields", async () => {
    const context = await startServer();
    contexts.push(context);
    await postJson(context, "/api/admin/users/create", {
      sessionId: "session-admin",
      displayName: "Jordan Kim",
      initials: "JK",
      email: "jordan.kim@actiondesk.local",
      role: "rep",
      isActive: true,
    });
    const createdUser = context.store.users.find((user) => user.email === "jordan.kim@actiondesk.local");

    const { response, payload } = await postJson(context, "/api/admin/users/update", {
      sessionId: "session-admin",
      userId: createdUser?.id,
      displayName: "Jordan Kline",
      initials: "JDK",
      role: "supervisor",
      isActive: true,
    });
    const updatedUser = payload.users.find((user: ManagedUser) => user.id === createdUser?.id);

    expect(response.status).toBe(200);
    expect(updatedUser).toMatchObject({
      displayName: "Jordan Kline",
      initials: "JDK",
      role: "supervisor",
      isActive: true,
    });
  });

  it("lets an admin deactivate a user", async () => {
    const context = await startServer();
    contexts.push(context);
    await postJson(context, "/api/admin/users/create", {
      sessionId: "session-admin",
      displayName: "Jordan Kim",
      initials: "JK",
      email: "jordan.kim@actiondesk.local",
      role: "rep",
      isActive: true,
    });
    const createdUser = context.store.users.find((user) => user.email === "jordan.kim@actiondesk.local");

    const { response, payload } = await postJson(context, "/api/admin/users/deactivate", {
      sessionId: "session-admin",
      userId: createdUser?.id,
    });
    const updatedUser = payload.users.find((user: ManagedUser) => user.id === createdUser?.id);

    expect(response.status).toBe(200);
    expect(updatedUser).toMatchObject({
      isActive: false,
    });
  });

  it("rejects non-admin access to user management routes", async () => {
    const context = await startServer();
    contexts.push(context);

    const { response, payload } = await getJson(context, "/api/admin/users", "session-supervisor");

    expect(response.status).toBe(403);
    expect(payload.error).toMatchObject({
      code: "forbidden",
      message: "You are not allowed to perform this action.",
    });
  });

  it("shows pending mapping state until a first sign-in mapping exists", async () => {
    const context = await startServer();
    contexts.push(context);
    await postJson(context, "/api/admin/users/create", {
      sessionId: "session-admin",
      displayName: "Taylor Brooks",
      initials: "TB",
      email: "taylor.brooks@actiondesk.local",
      role: "rep",
      isActive: true,
    });
    const pendingUser = context.store.users.find((user) => user.email === "taylor.brooks@actiondesk.local");

    if (!pendingUser) {
      throw new Error("Expected test user to exist.");
    }

    pendingUser.hasSignedIn = true;
    pendingUser.entraObjectId = "entra-taylor";
    pendingUser.mappingStatus = "mapped";

    const { payload } = await getJson(context, "/api/admin/users", "session-admin");
    const mappedUser = payload.users.find((user: ManagedUser) => user.email === "taylor.brooks@actiondesk.local");

    expect(mappedUser).toMatchObject({
      hasSignedIn: true,
      mappingStatus: "mapped",
      entraObjectId: "entra-taylor",
    });
  });
});
