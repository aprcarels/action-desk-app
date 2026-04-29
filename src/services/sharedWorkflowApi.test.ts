import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSharedWorkflowBackup,
  getSharedWorkflowErrorMessage,
  loadAuthSession,
  loadSharedWorkflowBootstrap,
  loadSharedWorkflowHealth,
} from "./sharedWorkflowApi";

describe("sharedWorkflowApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
});
