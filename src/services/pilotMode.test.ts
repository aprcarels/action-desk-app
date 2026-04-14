import { describe, expect, it } from "vitest";
import { filterInboxEmailsForPilotMode } from "./pilotMode";

describe("filterInboxEmailsForPilotMode", () => {
  it("hides dev_json inbox items in pilot mode", () => {
    const filtered = filterInboxEmailsForPilotMode(
      [
        {
          id: "seed-1",
          externalId: "seed-1",
          provider: "dev_json",
          subject: "Seeded",
          fromName: "Seeded Sender",
          fromEmail: "seed@example.com",
          receivedAt: "2026-04-01T10:00:00Z",
          bodyText: "Seeded body",
        },
        {
          id: "live-1",
          externalId: "live-1",
          provider: "outlook_graph",
          subject: "Live",
          fromName: "Live Sender",
          fromEmail: "live@example.com",
          receivedAt: "2026-04-01T10:05:00Z",
          bodyText: "Live body",
        },
      ],
      true,
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("live-1");
  });

  it("keeps dev_json inbox items outside pilot mode", () => {
    const filtered = filterInboxEmailsForPilotMode(
      [
        {
          id: "seed-1",
          externalId: "seed-1",
          provider: "dev_json",
          subject: "Seeded",
          fromName: "Seeded Sender",
          fromEmail: "seed@example.com",
          receivedAt: "2026-04-01T10:00:00Z",
          bodyText: "Seeded body",
        },
      ],
      false,
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("seed-1");
  });
});
