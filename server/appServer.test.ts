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
        code: "stale_microsoft_session",
        message: "Your Microsoft session expired. Please sign in again.",
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
