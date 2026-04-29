import { describe, expect, it } from "vitest";
import {
  buildThreadSla,
  getDefaultSlaSettings,
  normalizeSlaSettings,
} from "./sla";

const now = new Date("2026-04-21T12:00:00.000Z");
const settings = getDefaultSlaSettings();

describe("buildThreadSla", () => {
  it("keeps first response on track before the warning threshold", () => {
    const sla = buildThreadSla({
      receivedAt: "2026-04-21T11:20:00.000Z",
      settings,
      now,
    });

    expect(sla.current).toMatchObject({
      target: "first_response",
      state: "on_track",
      elapsedMinutes: 40,
    });
  });

  it("marks first response at risk when the warning threshold is reached", () => {
    const sla = buildThreadSla({
      receivedAt: "2026-04-21T11:15:00.000Z",
      settings,
      now,
    });

    expect(sla.current).toMatchObject({
      target: "first_response",
      state: "at_risk",
      elapsedMinutes: 45,
      warningStartsAtMinutes: 45,
    });
  });

  it("marks first response breached once the SLA target is reached", () => {
    const sla = buildThreadSla({
      receivedAt: "2026-04-21T11:00:00.000Z",
      settings,
      now,
    });

    expect(sla.current).toMatchObject({
      target: "first_response",
      state: "breached",
      elapsedMinutes: 60,
    });
  });

  it("uses the first logged reply timestamp to satisfy first response SLA", () => {
    const sla = buildThreadSla({
      receivedAt: "2026-04-21T10:00:00.000Z",
      firstReplyAt: "2026-04-21T10:25:00.000Z",
      settings,
      now,
    });

    expect(sla.firstResponse).toMatchObject({
      target: "first_response",
      state: "met",
      elapsedMinutes: 25,
      completedAt: "2026-04-21T10:25:00.000Z",
    });
    expect(sla.current.target).toBe("resolution");
  });

  it("marks resolution breached for an old unresolved thread", () => {
    const sla = buildThreadSla({
      receivedAt: "2026-04-20T11:00:00.000Z",
      firstReplyAt: "2026-04-20T11:20:00.000Z",
      settings,
      now,
    });

    expect(sla.current).toMatchObject({
      target: "resolution",
      state: "breached",
      elapsedMinutes: 25 * 60,
    });
  });

  it("uses resolved timestamp for resolution SLA state", () => {
    const met = buildThreadSla({
      receivedAt: "2026-04-20T12:00:00.000Z",
      firstReplyAt: "2026-04-20T12:20:00.000Z",
      resolvedAt: "2026-04-21T11:00:00.000Z",
      settings,
      now,
    });
    const late = buildThreadSla({
      receivedAt: "2026-04-20T12:00:00.000Z",
      firstReplyAt: "2026-04-20T12:20:00.000Z",
      resolvedAt: "2026-04-21T12:00:00.000Z",
      settings,
      now,
    });

    expect(met.resolution).toMatchObject({
      target: "resolution",
      state: "met",
      elapsedMinutes: 23 * 60,
      completedAt: "2026-04-21T11:00:00.000Z",
    });
    expect(late.resolution).toMatchObject({
      target: "resolution",
      state: "breached",
      elapsedMinutes: 24 * 60,
      completedAt: "2026-04-21T12:00:00.000Z",
    });
  });
});

describe("normalizeSlaSettings", () => {
  it("uses practical defaults and clamps invalid values", () => {
    expect(normalizeSlaSettings({})).toMatchObject({
      firstResponseSlaMinutes: 60,
      resolutionSlaMinutes: 24 * 60,
      warningThresholdPercent: 75,
      warningMinutesBeforeBreach: 15,
    });
    expect(
      normalizeSlaSettings({
        firstResponseSlaMinutes: 0,
        resolutionSlaMinutes: -1,
        warningThresholdPercent: 200,
        warningMinutesBeforeBreach: 0,
      }),
    ).toMatchObject({
      firstResponseSlaMinutes: 60,
      resolutionSlaMinutes: 24 * 60,
      warningThresholdPercent: 99,
      warningMinutesBeforeBreach: 1,
    });
  });
});
