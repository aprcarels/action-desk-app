import { afterEach, describe, expect, it, vi } from "vitest";
import { getMockOrderStatus } from "./getMockOrderStatus";
import {
  createOrderContextProvider,
} from "./orderContextProvider";

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

    await expect(provider.getOrderContext("ORD-1001")).resolves.toEqual(
      await getMockOrderStatus("ORD-1001"),
    );
  });

  it("falls back to the mock provider when real is selected without API config", async () => {
    vi.stubEnv("VITE_PILOT_MODE", "false");

    const provider = createOrderContextProvider({
      source: "real",
    });

    await expect(provider.getOrderContext("ORD-1002")).resolves.toEqual(
      await getMockOrderStatus("ORD-1002"),
    );
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

  it("suppresses mock order context in pilot mode when real lookup is not enabled", async () => {
    vi.stubEnv("VITE_PILOT_MODE", "true");

    const provider = createOrderContextProvider({
      source: "mock",
    });

    await expect(provider.getOrderContext("ORD-1001")).resolves.toBeNull();
  });
});
