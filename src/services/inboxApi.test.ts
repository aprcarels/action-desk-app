import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchInboxPage } from "./inboxApi";

describe("inboxApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("clears the stored shared session when the desktop inbox request finds a stale Microsoft session", async () => {
    const storage = new Map<string, string>();
    const dispatchedEvents: Array<{ type?: string; detail?: unknown }> = [];

    storage.set("action-desk.shared-session-id", "session-stale");

    vi.stubGlobal("CustomEvent", class {
      type: string;
      detail: unknown;

      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    });

    vi.stubGlobal("window", {
      actionDeskDesktop: {
        isElectron: true,
      },
      location: { origin: "http://localhost:5173" },
      dispatchEvent: (event: { type?: string; detail?: unknown }) => {
        dispatchedEvents.push(event);
        return true;
      },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: {
            code: "microsoft_session_missing",
            message: "Your Microsoft session expired. Please sign in again.",
          },
        }),
      }),
    );

    await expect(fetchInboxPage()).rejects.toMatchObject({
      code: "microsoft_session_missing",
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
});
