import type { OrderContextProvider } from "../orderContextProvider";

export const mockOrderContextProvider: OrderContextProvider = {
  async getOrderContext(orderNumber: string) {
    return {
      orderNumber,
      status: "Mock Status",
      shipmentStatus: "Mock Shipment Status",
      lastUpdated: new Date().toISOString(),
    };
  },
};