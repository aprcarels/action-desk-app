import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRealOrderContextProvider,
  normalizeRealOrderContextResponse,
} from "./realOrderContextProvider";

describe("normalizeRealOrderContextResponse", () => {
  it("maps a real provider response into the existing OrderContext shape", () => {
    const result = normalizeRealOrderContextResponse(
      {
        order: {
          orderNumber: "ORD-2001",
          status: "Shipped",
        },
        shipment: {
          status: "In Transit",
          updatedAt: "2026-04-01T09:30:00-07:00",
        },
      },
      "ORD-2001",
    );

    expect(result).toEqual({
      orderNumber: "ORD-2001",
      status: "Shipped",
      shipmentStatus: "In Transit",
      lastUpdated: "2026-04-01T16:30:00.000Z",
    });
  });

  it("returns null for unusable payloads", () => {
    expect(normalizeRealOrderContextResponse({ foo: "bar" }, "ORD-2002")).toBeNull();
  });
});

describe("createRealOrderContextProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when the real API reports order not found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 404,
        ok: false,
      }),
    );

    const provider = createRealOrderContextProvider({
      apiBaseUrl: "https://orders.example.com/api",
    });

    await expect(provider.getOrderContext("ORD-404")).resolves.toBeNull();
  });

  it("handles API failures safely without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const provider = createRealOrderContextProvider({
      apiBaseUrl: "https://orders.example.com/api",
    });

    await expect(provider.getOrderContext("ORD-500")).resolves.toBeNull();
  });
});
