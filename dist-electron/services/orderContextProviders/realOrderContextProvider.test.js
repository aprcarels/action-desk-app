"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const realOrderContextProvider_1 = require("./realOrderContextProvider");
(0, vitest_1.describe)("normalizeRealOrderContextResponse", () => {
    (0, vitest_1.it)("maps a real provider response into the existing OrderContext shape", () => {
        const result = (0, realOrderContextProvider_1.normalizeRealOrderContextResponse)({
            order: {
                orderNumber: "ORD-2001",
                status: "Shipped",
            },
            shipment: {
                status: "In Transit",
                updatedAt: "2026-04-01T09:30:00-07:00",
            },
        }, "ORD-2001");
        (0, vitest_1.expect)(result).toEqual({
            orderNumber: "ORD-2001",
            status: "Shipped",
            shipmentStatus: "In Transit",
            lastUpdated: "2026-04-01T16:30:00.000Z",
        });
    });
    (0, vitest_1.it)("returns null for unusable payloads", () => {
        (0, vitest_1.expect)((0, realOrderContextProvider_1.normalizeRealOrderContextResponse)({ foo: "bar" }, "ORD-2002")).toBeNull();
    });
});
(0, vitest_1.describe)("createRealOrderContextProvider", () => {
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.it)("returns null when the real API reports order not found", async () => {
        vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockResolvedValue({
            status: 404,
            ok: false,
        }));
        const provider = (0, realOrderContextProvider_1.createRealOrderContextProvider)({
            apiBaseUrl: "https://orders.example.com/api",
        });
        await (0, vitest_1.expect)(provider.getOrderContext("ORD-404")).resolves.toBeNull();
    });
    (0, vitest_1.it)("handles API failures safely without throwing", async () => {
        vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockRejectedValue(new Error("network down")));
        const provider = (0, realOrderContextProvider_1.createRealOrderContextProvider)({
            apiBaseUrl: "https://orders.example.com/api",
        });
        await (0, vitest_1.expect)(provider.getOrderContext("ORD-500")).resolves.toBeNull();
    });
});
