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
});
