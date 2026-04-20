"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const emailWorkHeuristics_1 = require("./emailWorkHeuristics");
(0, vitest_1.describe)("emailWorkHeuristics", () => {
    (0, vitest_1.it)("extracts the newest visible message before quoted thread headers", () => {
        const email = [
            "Thanks for sending that over, Please cancel all of those PTs since the only style on them is TGWD15+MUL and we will put it on a new PO. Pls confirm once canceled",
            "",
            "From: Support Team",
            "Sent: Monday, April 1, 2026 8:00 AM",
            "Subject: Prior thread",
            "FYI only.",
        ].join("\n");
        const latestMessage = (0, emailWorkHeuristics_1.extractLatestMessageText)(email);
        (0, vitest_1.expect)(latestMessage).toContain("Please cancel all of those PTs");
        (0, vitest_1.expect)(latestMessage).not.toContain("FYI only");
        (0, vitest_1.expect)((0, emailWorkHeuristics_1.hasClearRequest)(latestMessage)).toBe(true);
    });
    (0, vitest_1.it)("keeps short continuation replies suppressible when they have no clear ask", () => {
        const email = [
            "I just sent it in a separate email.",
            "",
            "From: Previous Sender",
            "Sent: earlier",
            "Subject: Earlier thread",
        ].join("\n");
        const latestMessage = (0, emailWorkHeuristics_1.extractLatestMessageText)(email);
        (0, vitest_1.expect)((0, emailWorkHeuristics_1.isLikelyThreadContinuation)(latestMessage, email)).toBe(true);
        (0, vitest_1.expect)((0, emailWorkHeuristics_1.hasClearRequest)(latestMessage)).toBe(false);
    });
});
