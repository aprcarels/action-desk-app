"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const queueAging_1 = require("./queueAging");
function buildPilotState(overrides) {
    return {
        workflowStatus: "active",
        updatedAt: "2026-04-02T12:00:00Z",
        ...overrides,
    };
}
(0, vitest_1.describe)("queueAging", () => {
    (0, vitest_1.it)("marks a fresh active item as new", () => {
        const age = (0, queueAging_1.getQueueAgeInfo)({
            receivedAt: "2026-04-02T06:00:00Z",
            now: new Date("2026-04-02T12:00:00Z"),
        });
        (0, vitest_1.expect)(age.bucket).toBe("new");
        (0, vitest_1.expect)(age.label).toBe("New");
        (0, vitest_1.expect)(age.isActiveAgingWork).toBe(true);
    });
    (0, vitest_1.it)("marks older active items as aging, stale, and overdue", () => {
        (0, vitest_1.expect)((0, queueAging_1.getQueueAgeInfo)({
            receivedAt: "2026-04-01T08:00:00Z",
            now: new Date("2026-04-02T12:00:00Z"),
        }).bucket).toBe("aging");
        (0, vitest_1.expect)((0, queueAging_1.getQueueAgeInfo)({
            receivedAt: "2026-03-29T08:00:00Z",
            now: new Date("2026-04-02T12:00:00Z"),
        }).bucket).toBe("stale");
        (0, vitest_1.expect)((0, queueAging_1.getQueueAgeInfo)({
            receivedAt: "2026-03-20T08:00:00Z",
            now: new Date("2026-04-02T12:00:00Z"),
        }).bucket).toBe("overdue");
    });
    (0, vitest_1.it)("does not treat done items as active aging work", () => {
        const age = (0, queueAging_1.getQueueAgeInfo)({
            receivedAt: "2026-03-20T08:00:00Z",
            pilotItemState: buildPilotState({
                workflowStatus: "done",
            }),
            now: new Date("2026-04-02T12:00:00Z"),
        });
        (0, vitest_1.expect)(age.status).toBe("done");
        (0, vitest_1.expect)(age.isActiveAgingWork).toBe(false);
        (0, vitest_1.expect)(age.label).toBe("Done");
    });
    (0, vitest_1.it)("does not treat not relevant items as active aging work", () => {
        const age = (0, queueAging_1.getQueueAgeInfo)({
            receivedAt: "2026-03-20T08:00:00Z",
            pilotItemState: buildPilotState({
                workflowStatus: "not_relevant",
            }),
            now: new Date("2026-04-02T12:00:00Z"),
        });
        (0, vitest_1.expect)(age.status).toBe("not_relevant");
        (0, vitest_1.expect)(age.isActiveAgingWork).toBe(false);
        (0, vitest_1.expect)(age.label).toBe("Not Relevant");
    });
    (0, vitest_1.it)("does not treat snoozed items as stale while snooze is active", () => {
        const age = (0, queueAging_1.getQueueAgeInfo)({
            receivedAt: "2026-03-20T08:00:00Z",
            pilotItemState: buildPilotState({
                snoozedUntil: "2026-04-03T08:00:00Z",
            }),
            now: new Date("2026-04-02T12:00:00Z"),
        });
        (0, vitest_1.expect)(age.status).toBe("snoozed");
        (0, vitest_1.expect)(age.isStale).toBe(false);
        (0, vitest_1.expect)(age.label).toBe("Snoozed");
    });
    (0, vitest_1.it)("handles waiting on customer more gently and labels it distinctly", () => {
        const age = (0, queueAging_1.getQueueAgeInfo)({
            receivedAt: "2026-03-30T12:00:00Z",
            pilotItemState: buildPilotState({
                workflowStatus: "waiting_on_customer",
            }),
            now: new Date("2026-04-02T12:00:00Z"),
        });
        (0, vitest_1.expect)(age.status).toBe("waiting_on_customer");
        (0, vitest_1.expect)(age.label).toBe("Waiting 3d");
        (0, vitest_1.expect)(age.isActiveAgingWork).toBe(false);
    });
    (0, vitest_1.it)("allows overdue waiting items to surface more visibly", () => {
        const age = (0, queueAging_1.getQueueAgeInfo)({
            receivedAt: "2026-03-20T12:00:00Z",
            pilotItemState: buildPilotState({
                workflowStatus: "waiting_on_customer",
            }),
            now: new Date("2026-04-02T12:00:00Z"),
        });
        (0, vitest_1.expect)(age.bucket).toBe("overdue");
        (0, vitest_1.expect)(age.isStale).toBe(true);
        (0, vitest_1.expect)(age.sortWeight).toBeGreaterThan(0);
    });
});
