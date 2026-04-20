"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const pilotMode_1 = require("./pilotMode");
(0, vitest_1.describe)("filterInboxEmailsForPilotMode", () => {
    (0, vitest_1.it)("hides dev_json inbox items in pilot mode", () => {
        const filtered = (0, pilotMode_1.filterInboxEmailsForPilotMode)([
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
        ], true);
        (0, vitest_1.expect)(filtered).toHaveLength(1);
        (0, vitest_1.expect)(filtered[0].id).toBe("live-1");
    });
    (0, vitest_1.it)("keeps dev_json inbox items outside pilot mode", () => {
        const filtered = (0, pilotMode_1.filterInboxEmailsForPilotMode)([
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
        ], false);
        (0, vitest_1.expect)(filtered).toHaveLength(1);
        (0, vitest_1.expect)(filtered[0].id).toBe("seed-1");
    });
});
