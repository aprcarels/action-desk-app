import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyEmailWithAi,
  draftReplyWithAi,
  createOutlookReplyDraft,
  createSharedWorkflowBackup,
  getSharedWorkflowErrorMessage,
  loadAuthSession,
  loadSharedWorkflowBootstrap,
  loadSharedWorkflowHealth,
  saveSharedWorkflowPreferences,
  setBackendApiOrigin,
} from "./sharedWorkflowApi";

describe("sharedWorkflowApi", () => {
  afterEach(() => {
    setBackendApiOrigin(null);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("normalizes network failures into a retryable shared workflow error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")),
    );

    await expect(loadSharedWorkflowHealth()).rejects.toMatchObject({
      code: "network_error",
      retryable: true,
      context: "/api/health",
      message: "The shared workflow service could not be reached.",
    });
  });

  it("normalizes server errors into a consistent shared workflow error shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            code: "forbidden",
            message: "Only supervisors can create backups.",
            retryable: false,
            context: "/api/admin/backup",
          },
        }),
      }),
    );

    await expect(createSharedWorkflowBackup()).rejects.toMatchObject({
      code: "forbidden",
      retryable: false,
      context: "/api/admin/backup",
      message: "Only supervisors can create backups.",
    });
  });

  it("sends the stored session only as a header on shared workflow requests", async () => {
    const storage = new Map<string, string>([
      ["action-desk.shared-session-id", "session-secure"],
    ]);
    const preferences = {
      queueScopeView: "my_queue" as const,
      queueDisplayMode: "list" as const,
      statusFilter: "open" as const,
      showSnoozed: false,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        preferences,
      }),
    });

    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
      location: { origin: "http://localhost:5173" },
    });
    vi.stubGlobal("fetch", fetchMock);

    await saveSharedWorkflowPreferences(preferences);

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(String(requestUrl));
    const headers = requestInit?.headers as Record<string, string>;

    expect(url.pathname).toBe("/api/workflow/preferences");
    expect(url.search).toBe("");
    expect(headers["x-action-desk-session-id"]).toBe("session-secure");
    expect(JSON.parse(String(requestInit?.body))).toEqual({ preferences });
  });

  it("sends Outlook reply draft creation through the local API without session query params", async () => {
    const storage = new Map<string, string>([
      ["action-desk.shared-session-id", "session-draft"],
    ]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        draft: {
          id: "draft-1",
          webLink: "https://outlook.office.com/mail/deeplink/compose/draft-1",
        },
      }),
    });

    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
      location: { origin: "http://localhost:5173" },
    });
    vi.stubGlobal("fetch", fetchMock);

    const liveReplyDraft =
      "Hi Casey,\n\nThis is the live Action Desk generated reply.\nLine two stays on its own line.\n\nBest,\nSupport Team";

    const draft = await createOutlookReplyDraft({
      messageId: "msg-1",
      replyText: liveReplyDraft,
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(String(requestUrl));
    const headers = requestInit?.headers as Record<string, string>;

    expect(draft).toEqual({
      id: "draft-1",
      webLink: "https://outlook.office.com/mail/deeplink/compose/draft-1",
      subject: undefined,
    });
    expect(url.pathname).toBe("/api/outlook/reply-drafts");
    expect(url.search).toBe("");
    expect(headers["x-action-desk-session-id"]).toBe("session-draft");
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      messageId: "msg-1",
      replyText: liveReplyDraft,
    });
    expect(String(requestInit?.body)).not.toContain("Reply draft");
  });

  it("sends AI classification to the configured backend API route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        category: "vendor sales outreach",
        actionable: false,
        urgency: "low",
        summary: "Vendor is pitching hardware and asking for a call.",
        confidence: 0.91,
        aiSource: "ollama",
      }),
    });

    setBackendApiOrigin("http://192.168.15.177:4000/");
    vi.stubGlobal("fetch", fetchMock);

    const result = await classifyEmailWithAi({
      subject: "RE: AP Express Logistics priorities",
      from: "casey@duagon.example",
      body: "Would AP Express be open to a quick chat?",
    });
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(String(requestUrl));

    expect(result).toMatchObject({
      category: "vendor sales outreach",
      aiSource: "ollama",
    });
    expect(url.origin).toBe("http://192.168.15.177:4000");
    expect(url.pathname).toBe("/api/ai/classify-email");
    expect(requestInit?.method).toBe("POST");
    expect(JSON.parse(String(requestInit?.body))).toMatchObject({
      subject: "RE: AP Express Logistics priorities",
      from: "casey@duagon.example",
    });
  });

  it("sends AI reply drafting to the configured backend API route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        replyDraft: "Hi,\n\nPlease send the order number so I can check the shipment.\n\nBest,\nSupport Team",
        aiSource: "ollama",
      }),
    });

    setBackendApiOrigin("http://192.168.15.177:4000/");
    vi.stubGlobal("fetch", fetchMock);

    const result = await draftReplyWithAi({
      subject: "Where is my order?",
      from: "customer@example.com",
      body: "Where is my order?",
      analysis: {
        summary: "Customer is asking for an order update but did not provide a usable identifier.",
        intent: "where_is_my_order",
        urgency: "medium",
        confidence: "medium",
        risks: [],
        nextAction: "Request the order number or usable reference for the shipment status request.",
        actionability: "action_required",
        replyNeeded: "yes",
        workType: "customer_support",
        messageType: "customer_request",
      },
      recommendedNextAction: "Request the order number or usable reference for the shipment status request.",
    });
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(String(requestUrl));

    expect(result).toMatchObject({
      aiSource: "ollama",
    });
    expect(url.origin).toBe("http://192.168.15.177:4000");
    expect(url.pathname).toBe("/api/ai/draft-reply");
    expect(requestInit?.method).toBe("POST");
    expect(JSON.parse(String(requestInit?.body))).toMatchObject({
      subject: "Where is my order?",
      from: "customer@example.com",
      recommendedNextAction: expect.stringContaining("Request the order number"),
    });
  });

  it("clears a stale stored session when session hydration reports expired Microsoft auth", async () => {
    const storage = new Map<string, string>();

    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
      location: { origin: "http://localhost:5173" },
    });

    storage.set("action-desk.shared-session-id", "session-stale");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          sessionId: "",
          currentUser: null,
          capabilities: [],
          reps: [],
          staleSessionCleared: true,
          authMessage: "Your Microsoft session expired. Please sign in again.",
        }),
      }),
    );

    const session = await loadAuthSession();

    expect(session.currentUser).toBeNull();
    expect(session.authMessage).toBe(
      "Your Microsoft session expired. Please sign in again.",
    );
    expect(storage.has("action-desk.shared-session-id")).toBe(false);
  });

  it("forces sign-out when a protected shared workflow route returns unauthorized for a stale saved session", async () => {
    const storage = new Map<string, string>();
    const dispatchedEvents: Array<{ type?: string; detail?: unknown }> = [];

    vi.stubGlobal("CustomEvent", class {
      type: string;
      detail: unknown;

      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    });

    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
      location: { origin: "http://localhost:5173" },
      dispatchEvent: (event: { type?: string; detail?: unknown }) => {
        dispatchedEvents.push(event);
        return true;
      },
    });

    storage.set("action-desk.shared-session-id", "session-stale");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: {
            code: "auth_required",
            message: "You must sign in before using the shared workflow.",
            retryable: false,
            context: "/api/workflow/bootstrap",
          },
        }),
      }),
    );

    await expect(loadSharedWorkflowBootstrap()).rejects.toMatchObject({
      code: "stale_microsoft_session",
      retryable: false,
      context: "/api/workflow/bootstrap",
      message: "Your Microsoft session expired. Please sign in again.",
    });

    expect(storage.has("action-desk.shared-session-id")).toBe(false);
    expect(dispatchedEvents).toEqual([
      {
        type: "action-desk:shared-session-expired",
        detail: {
          message: "Your Microsoft session expired. Please sign in again.",
        },
      },
    ]);
  });

  it("forces sign-out when a protected route reports missing Microsoft token context", async () => {
    const storage = new Map<string, string>();
    const dispatchedEvents: Array<{ type?: string; detail?: unknown }> = [];

    vi.stubGlobal("CustomEvent", class {
      type: string;
      detail: unknown;

      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    });

    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
      location: { origin: "http://localhost:5173" },
      dispatchEvent: (event: { type?: string; detail?: unknown }) => {
        dispatchedEvents.push(event);
        return true;
      },
    });

    storage.set("action-desk.shared-session-id", "backend-session-3");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: {
            code: "microsoft_token_context_missing",
            message: "Microsoft token context missing for session",
            retryable: false,
            context: "/api/workflow/bootstrap",
          },
        }),
      }),
    );

    await expect(loadSharedWorkflowBootstrap()).rejects.toMatchObject({
      code: "stale_microsoft_session",
      retryable: false,
      context: "/api/workflow/bootstrap",
      message: "Your Microsoft session expired. Please sign in again.",
    });

    expect(storage.has("action-desk.shared-session-id")).toBe(false);
    expect(dispatchedEvents).toEqual([
      {
        type: "action-desk:shared-session-expired",
        detail: {
          message: "Your Microsoft session expired. Please sign in again.",
        },
      },
    ]);
  });

  it("preserves the access-changed message when the backend invalidates the current user's session", async () => {
    const storage = new Map<string, string>();
    const dispatchedEvents: Array<{ type?: string; detail?: unknown }> = [];

    vi.stubGlobal("CustomEvent", class {
      type: string;
      detail: unknown;

      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    });

    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
      location: { origin: "http://localhost:5173" },
      dispatchEvent: (event: { type?: string; detail?: unknown }) => {
        dispatchedEvents.push(event);
        return true;
      },
    });

    storage.set("action-desk.shared-session-id", "session-self");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: {
            code: "access_changed",
            message: "Your access changed. Please sign in again.",
            retryable: false,
            context: "/api/workflow/bootstrap",
          },
        }),
      }),
    );

    await expect(loadSharedWorkflowBootstrap()).rejects.toMatchObject({
      code: "access_changed",
      retryable: false,
      context: "/api/workflow/bootstrap",
      message: "Your access changed. Please sign in again.",
    });

    expect(storage.has("action-desk.shared-session-id")).toBe(false);
    expect(dispatchedEvents).toEqual([
      {
        type: "action-desk:shared-session-expired",
        detail: {
          message: "Your access changed. Please sign in again.",
        },
      },
    ]);
  });

  it("prefers normalized shared workflow messages for UI copy", () => {
    const error = Object.assign(new Error("Shared workflow offline"), {
      code: "network_error",
      retryable: true,
    });

    expect(
      getSharedWorkflowErrorMessage(error, "Fallback message"),
    ).toBe("Shared workflow offline");
  });

  it("preserves CSR email aliases from workflow bootstrap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          currentUser: {
            id: "admin-1",
            name: "Avery Admin",
            initials: "AA",
            email: "avery.admin@apexpress.com",
            role: "admin",
          },
          capabilities: ["manage_users", "manage_customer_ownership"],
          reps: [
            {
              employee_id: "rep-1",
              display_name: "Mia Johnson",
              employee_email: "mia.johnson@apexpress.com",
              role: "csr",
              department: "apexpress_irwindale",
              is_active: true,
            },
          ],
          customers: [],
          slaSettings: {
            firstResponseSlaMinutes: 60,
            resolutionSlaMinutes: 1440,
            warningThresholdPercent: 75,
            warningMinutesBeforeBreach: 15,
          },
          workflowState: {
            reps: [
              {
                employee_id: "rep-1",
                display_name: "Mia Johnson",
                employee_email: "mia.johnson@apexpress.com",
                role: "csr",
                department: "apexpress_irwindale",
                is_active: true,
              },
            ],
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
        }),
      }),
    );

    const bootstrap = await loadSharedWorkflowBootstrap();

    expect(bootstrap.workflowState.reps).toEqual([
      expect.objectContaining({
        id: "rep-1",
        email: "mia.johnson@apexpress.com",
      }),
    ]);
  });
});
