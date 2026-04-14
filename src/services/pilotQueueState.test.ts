import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSnoozeUntilTomorrow,
  getPilotQueueItemState,
  savePilotQueueStateMap,
  setPilotUsefulnessFeedback,
  setPilotWorkflowStatus,
  shouldShowPilotQueueItemInView,
  snoozePilotQueueItemUntilTomorrow,
} from "./pilotQueueState";

describe("pilotQueueState", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides done and not relevant items from the active queue", () => {
    const now = new Date("2026-04-01T09:00:00Z");
    const doneState = getPilotQueueItemState(
      setPilotWorkflowStatus({}, "email-1", "done", now),
      "email-1",
      now,
    );
    const notRelevantState = getPilotQueueItemState(
      setPilotWorkflowStatus({}, "email-2", "not_relevant", now),
      "email-2",
      now,
    );

    expect(shouldShowPilotQueueItemInView(doneState, "active", now)).toBe(false);
    expect(shouldShowPilotQueueItemInView(notRelevantState, "active", now)).toBe(false);
  });

  it("hides snoozed items until tomorrow", () => {
    const now = new Date("2026-04-01T09:00:00Z");
    const state = getPilotQueueItemState(
      snoozePilotQueueItemUntilTomorrow({}, "email-3", now),
      "email-3",
      now,
    );

    expect(shouldShowPilotQueueItemInView(state, "active", now)).toBe(false);
    expect(shouldShowPilotQueueItemInView(state, "snoozed", now)).toBe(true);
    expect(Date.parse(state.snoozedUntil ?? "")).toBeGreaterThan(now.getTime());
  });

  it("captures helpful and not helpful feedback safely", () => {
    const helpfulState = getPilotQueueItemState(
      setPilotUsefulnessFeedback({}, "email-4", "helpful"),
      "email-4",
    );
    const notHelpfulState = getPilotQueueItemState(
      setPilotUsefulnessFeedback({}, "email-5", "not_helpful"),
      "email-5",
    );

    expect(helpfulState.usefulness).toBe("helpful");
    expect(notHelpfulState.usefulness).toBe("not_helpful");
  });

  it("creates a tomorrow snooze timestamp in the future", () => {
    const now = new Date("2026-04-01T09:00:00Z");
    const snoozedUntil = createSnoozeUntilTomorrow(now);

    expect(Date.parse(snoozedUntil)).toBeGreaterThan(now.getTime());
  });

  it("does not throw when localStorage is unavailable", () => {
    const setItem = vi.fn(() => {
      throw new Error("storage unavailable");
    });

    vi.stubGlobal("window", {
      localStorage: {
        setItem,
      },
    });

    expect(() => savePilotQueueStateMap({})).not.toThrow();
    expect(setItem).toHaveBeenCalled();
  });
});
