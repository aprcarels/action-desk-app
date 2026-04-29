import { describe, expect, it } from "vitest";
import {
  advanceToWorkingTime,
  calculateBusinessMinutes,
  getSlaState,
  getWorkingIntervals,
  type SlaSchedule,
} from "./slaRepository";

const standardSchedule: SlaSchedule = {
  businessHours: [
    { queueId: null, dayOfWeek: 1, startTime: "09:00:00", endTime: "17:00:00" },
    { queueId: null, dayOfWeek: 2, startTime: "09:00:00", endTime: "17:00:00" },
    { queueId: null, dayOfWeek: 3, startTime: "09:00:00", endTime: "17:00:00" },
    { queueId: null, dayOfWeek: 4, startTime: "09:00:00", endTime: "17:00:00" },
    { queueId: null, dayOfWeek: 5, startTime: "09:00:00", endTime: "17:00:00" },
  ],
  holidays: [],
};

describe("MariaDB SLA schedule calculations", () => {
  it("advances nights to the next morning in UTC", () => {
    const nextWorkingTime = advanceToWorkingTime(
      new Date("2026-04-28T20:30:00.000Z"),
      standardSchedule,
    );

    expect(nextWorkingTime.toISOString()).toBe("2026-04-29T09:00:00.000Z");
  });

  it("skips weekends when calculating working intervals", () => {
    const intervals = getWorkingIntervals(
      standardSchedule,
      new Date("2026-05-01T16:00:00.000Z"),
      new Date("2026-05-04T10:30:00.000Z"),
    );

    expect(intervals.map((interval) => ({
      start: interval.start.toISOString(),
      end: interval.end.toISOString(),
    }))).toEqual([
      {
        start: "2026-05-01T16:00:00.000Z",
        end: "2026-05-01T17:00:00.000Z",
      },
      {
        start: "2026-05-04T09:00:00.000Z",
        end: "2026-05-04T10:30:00.000Z",
      },
    ]);
    expect(calculateBusinessMinutes(
      new Date("2026-05-01T16:00:00.000Z"),
      new Date("2026-05-04T10:30:00.000Z"),
      standardSchedule,
    )).toBe(150);
  });

  it("skips non-working holidays", () => {
    const holidaySchedule: SlaSchedule = {
      ...standardSchedule,
      holidays: [
        {
          queueId: null,
          holidayDate: "2026-05-04",
          name: "Closed Monday",
          isWorkingDay: false,
        },
      ],
    };

    const nextWorkingTime = advanceToWorkingTime(
      new Date("2026-05-04T10:00:00.000Z"),
      holidaySchedule,
    );

    expect(nextWorkingTime.toISOString()).toBe("2026-05-05T09:00:00.000Z");
  });

  it("uses profile thresholds for SLA state", () => {
    const profile = {
      targetMinutes: 100,
      warningThresholdPct: 70,
      criticalThresholdPct: 90,
    };

    expect(getSlaState(69, profile)).toBe("OK");
    expect(getSlaState(70, profile)).toBe("WARNING");
    expect(getSlaState(90, profile)).toBe("CRITICAL");
    expect(getSlaState(100, profile)).toBe("BREACHED");
  });
});
