import type { OrderContextProvider } from "../orderContextProvider";

type CreateRealOrderContextProviderOptions = {
  apiBaseUrl?: string;
};

export function createRealOrderContextProvider(
  options?: CreateRealOrderContextProviderOptions,
): OrderContextProvider {
  return {
    async getOrderContext(orderNumber: string) {
      const baseUrl = options?.apiBaseUrl?.trim();

      if (!baseUrl) {
        return null;
      }

      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/orders/${encodeURIComponent(orderNumber)}`);

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      return {
        orderNumber: data.orderNumber ?? orderNumber,
        status: data.status ?? "Unknown",
        shipmentStatus: data.shipmentStatus ?? "Unknown",
        lastUpdated: data.lastUpdated ?? new Date().toISOString(),
      };
    },
  };
}