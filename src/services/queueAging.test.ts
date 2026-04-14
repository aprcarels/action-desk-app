import { describe, expect, it } from "vitest";
import { getQueueAgeInfo } from "./queueAging";
import type { PilotQueueItemState } from "../types/actionDesk";

function buildPilotState(overrides?: Partial<PilotQueueItemState>): PilotQueueItemState {
  return {
    workflowStatus: "active",
    updatedAt: "2026-04-02T12:00:00Z",
    ...overrides,
  };
}

describe("queueAging", () => {
  it("marks a fresh active item as new", () => {
    const age = getQueueAgeInfo({
      receivedAt: "2026-04-02T06:00:00Z",
      now: new Date("2026-04-02T12:00:00Z"),
    });

    expect(age.bucket).toBe("new");
    expect(age.label).toBe("New");
    expect(age.isActiveAgingWork).toBe(true);
  });

  it("marks older active items as aging, stale, and overdue", () => {
    expect(
      getQueueAgeInfo({
        receivedAt: "2026-04-01T08:00:00Z",
        now: new Date("2026-04-02T12:00:00Z"),
      }).bucket,
    ).toBe("aging");

    expect(
      getQueueAgeInfo({
        receivedAt: "2026-03-29T08:00:00Z",
        now: new Date("2026-04-02T12:00:00Z"),
      }).bucket,
    ).toBe("stale");

    expect(
      getQueueAgeInfo({
        receivedAt: "2026-03-20T08:00:00Z",
        now: new Date("2026-04-02T12:00:00Z"),
      }).bucket,
    ).toBe("overdue");
  });

  it("does not treat done items as active aging work", () => {
    const age = getQueueAgeInfo({
      receivedAt: "2026-03-20T08:00:00Z",
      pilotItemState: buildPilotState({
        workflowStatus: "done",
      }),
      now: new Date("2026-04-02T12:00:00Z"),
    });

    expect(age.status).toBe("done");
    expect(age.isActiveAgingWork).toBe(false);
    expect(age.label).toBe("Done");
  });

  it("does not treat not relevant items as active aging work", () => {
    const age = getQueueAgeInfo({
      receivedAt: "2026-03-20T08:00:00Z",
      pilotItemState: buildPilotState({
        workflowStatus: "not_relevant",
      }),
      now: new Date("2026-04-02T12:00:00Z"),
    });

    expect(age.status).toBe("not_relevant");
    expect(age.isActiveAgingWork).toBe(false);
    expect(age.label).toBe("Not Relevant");
  });

  it("does not treat snoozed items as stale while snooze is active", () => {
    const age = getQueueAgeInfo({
      receivedAt: "2026-03-20T08:00:00Z",
      pilotItemState: buildPilotState({
        snoozedUntil: "2026-04-03T08:00:00Z",
      }),
      now: new Date("2026-04-02T12:00:00Z"),
    });

    expect(age.status).toBe("snoozed");
    expect(age.isStale).toBe(false);
    expect(age.label).toBe("Snoozed");
  });

  it("handles waiting on customer more gently and labels it distinctly", () => {
    const age = getQueueAgeInfo({
      receivedAt: "2026-03-30T12:00:00Z",
      pilotItemState: buildPilotState({
        workflowStatus: "waiting_on_customer",
      }),
      now: new Date("2026-04-02T12:00:00Z"),
    });

    expect(age.status).toBe("waiting_on_customer");
    expect(age.label).toBe("Waiting 3d");
    expect(age.isActiveAgingWork).toBe(false);
  });

  it("allows overdue waiting items to surface more visibly", () => {
    const age = getQueueAgeInfo({
      receivedAt: "2026-03-20T12:00:00Z",
      pilotItemState: buildPilotState({
        workflowStatus: "waiting_on_customer",
      }),
      now: new Date("2026-04-02T12:00:00Z"),
    });

    expect(age.bucket).toBe("overdue");
    expect(age.isStale).toBe(true);
    expect(age.sortWeight).toBeGreaterThan(0);
  });
});
