"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const pilotQueueState_1 = require("./pilotQueueState");
(0, vitest_1.describe)("pilotQueueState", () => {
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.it)("hides done and not relevant items from the active queue", () => {
        const now = new Date("2026-04-01T09:00:00Z");
        const doneState = (0, pilotQueueState_1.getPilotQueueItemState)((0, pilotQueueState_1.setPilotWorkflowStatus)({}, "email-1", "done", now), "email-1", now);
        const notRelevantState = (0, pilotQueueState_1.getPilotQueueItemState)((0, pilotQueueState_1.setPilotWorkflowStatus)({}, "email-2", "not_relevant", now), "email-2", now);
        (0, vitest_1.expect)((0, pilotQueueState_1.shouldShowPilotQueueItemInView)(doneState, "active", now)).toBe(false);
        (0, vitest_1.expect)((0, pilotQueueState_1.shouldShowPilotQueueItemInView)(notRelevantState, "active", now)).toBe(false);
    });
    (0, vitest_1.it)("hides snoozed items until tomorrow", () => {
        const now = new Date("2026-04-01T09:00:00Z");
        const state = (0, pilotQueueState_1.getPilotQueueItemState)((0, pilotQueueState_1.snoozePilotQueueItemUntilTomorrow)({}, "email-3", now), "email-3", now);
        (0, vitest_1.expect)((0, pilotQueueState_1.shouldShowPilotQueueItemInView)(state, "active", now)).toBe(false);
        (0, vitest_1.expect)((0, pilotQueueState_1.shouldShowPilotQueueItemInView)(state, "snoozed", now)).toBe(true);
        (0, vitest_1.expect)(Date.parse(state.snoozedUntil ?? "")).toBeGreaterThan(now.getTime());
    });
    (0, vitest_1.it)("captures helpful and not helpful feedback safely", () => {
        const helpfulState = (0, pilotQueueState_1.getPilotQueueItemState)((0, pilotQueueState_1.setPilotUsefulnessFeedback)({}, "email-4", "helpful"), "email-4");
        const notHelpfulState = (0, pilotQueueState_1.getPilotQueueItemState)((0, pilotQueueState_1.setPilotUsefulnessFeedback)({}, "email-5", "not_helpful"), "email-5");
        (0, vitest_1.expect)(helpfulState.usefulness).toBe("helpful");
        (0, vitest_1.expect)(notHelpfulState.usefulness).toBe("not_helpful");
    });
    (0, vitest_1.it)("creates a tomorrow snooze timestamp in the future", () => {
        const now = new Date("2026-04-01T09:00:00Z");
        const snoozedUntil = (0, pilotQueueState_1.createSnoozeUntilTomorrow)(now);
        (0, vitest_1.expect)(Date.parse(snoozedUntil)).toBeGreaterThan(now.getTime());
    });
    (0, vitest_1.it)("does not throw when localStorage is unavailable", () => {
        const setItem = vitest_1.vi.fn(() => {
            throw new Error("storage unavailable");
        });
        vitest_1.vi.stubGlobal("window", {
            localStorage: {
                setItem,
            },
        });
        (0, vitest_1.expect)(() => (0, pilotQueueState_1.savePilotQueueStateMap)({})).not.toThrow();
        (0, vitest_1.expect)(setItem).toHaveBeenCalled();
    });
});
