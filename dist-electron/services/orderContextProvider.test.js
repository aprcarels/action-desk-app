"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const getMockOrderStatus_1 = require("./getMockOrderStatus");
const orderContextProvider_1 = require("./orderContextProvider");
(0, vitest_1.describe)("createOrderContextProvider", () => {
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.restoreAllMocks();
        vitest_1.vi.unstubAllEnvs();
    });
    (0, vitest_1.it)("uses the mock provider by default", async () => {
        vitest_1.vi.stubEnv("VITE_PILOT_MODE", "false");
        const provider = (0, orderContextProvider_1.createOrderContextProvider)({
            source: "mock",
        });
        await (0, vitest_1.expect)(provider.getOrderContext("ORD-1001")).resolves.toEqual(await (0, getMockOrderStatus_1.getMockOrderStatus)("ORD-1001"));
    });
    (0, vitest_1.it)("falls back to the mock provider when real is selected without API config", async () => {
        vitest_1.vi.stubEnv("VITE_PILOT_MODE", "false");
        const provider = (0, orderContextProvider_1.createOrderContextProvider)({
            source: "real",
        });
        await (0, vitest_1.expect)(provider.getOrderContext("ORD-1002")).resolves.toEqual(await (0, getMockOrderStatus_1.getMockOrderStatus)("ORD-1002"));
    });
    (0, vitest_1.it)("uses the real provider when explicitly enabled with an API base URL", async () => {
        vitest_1.vi.stubEnv("VITE_PILOT_MODE", "false");
        vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockResolvedValue({
            status: 200,
            ok: true,
            json: async () => ({
                orderNumber: "ORD-3001",
                status: "Processing",
                shipmentStatus: "Label Created",
                lastUpdated: "2026-04-02T08:00:00Z",
            }),
        }));
        const provider = (0, orderContextProvider_1.createOrderContextProvider)({
            source: "real",
            apiBaseUrl: "https://orders.example.com/api",
        });
        await (0, vitest_1.expect)(provider.getOrderContext("ORD-3001")).resolves.toEqual({
            orderNumber: "ORD-3001",
            status: "Processing",
            shipmentStatus: "Label Created",
            lastUpdated: "2026-04-02T08:00:00.000Z",
        });
    });
    (0, vitest_1.it)("suppresses mock order context in pilot mode when real lookup is not enabled", async () => {
        vitest_1.vi.stubEnv("VITE_PILOT_MODE", "true");
        const provider = (0, orderContextProvider_1.createOrderContextProvider)({
            source: "mock",
        });
        await (0, vitest_1.expect)(provider.getOrderContext("ORD-1001")).resolves.toBeNull();
    });
});
