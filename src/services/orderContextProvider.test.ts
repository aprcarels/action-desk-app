import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createOrderContextProvider,
} from "./orderContextProvider";

async function expectMockOrderContext(
  provider: ReturnType<typeof createOrderContextProvider>,
  orderNumber: string,
) {
  const result = await provider.getOrderContext(orderNumber);

  expect(result).toMatchObject({
    orderNumber,
    status: "Mock Status",
    shipmentStatus: "Mock Shipment Status",
  });
  expect(typeof result?.lastUpdated).toBe("string");
  expect(Number.isNaN(Date.parse(result?.lastUpdated ?? ""))).toBe(false);
}

describe("createOrderContextProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("uses the mock provider by default", async () => {
    vi.stubEnv("VITE_PILOT_MODE", "false");

    const provider = createOrderContextProvider({
      source: "mock",
    });

    await expectMockOrderContext(provider, "ORD-1001");
  });

  it("falls back to the mock provider when real is selected without API config", async () => {
    vi.stubEnv("VITE_PILOT_MODE", "false");

    const provider = createOrderContextProvider({
      source: "real",
    });

    await expectMockOrderContext(provider, "ORD-1002");
  });

  it("uses the real provider when explicitly enabled with an API base URL", async () => {
    vi.stubEnv("VITE_PILOT_MODE", "false");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          orderNumber: "ORD-3001",
          status: "Processing",
          shipmentStatus: "Label Created",
          lastUpdated: "2026-04-02T08:00:00Z",
        }),
      }),
    );

    const provider = createOrderContextProvider({
      source: "real",
      apiBaseUrl: "https://orders.example.com/api",
    });

    await expect(provider.getOrderContext("ORD-3001")).resolves.toEqual({
      orderNumber: "ORD-3001",
      status: "Processing",
      shipmentStatus: "Label Created",
      lastUpdated: "2026-04-02T08:00:00.000Z",
    });
  });

  it("does not use pilot mode to suppress an explicitly selected mock provider", async () => {
    vi.stubEnv("VITE_PILOT_MODE", "true");

    const provider = createOrderContextProvider({
      source: "mock",
    });

    await expectMockOrderContext(provider, "ORD-1001");
  });
});
