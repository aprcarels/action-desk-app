import type { OrderContext } from "../../types/actionDesk";
import { getMockOrderStatus } from "../getMockOrderStatus";
import type { OrderContextProvider } from "../orderContextProvider";

export const mockOrderContextProvider: OrderContextProvider = {
  async getOrderContext(orderNumber: string): Promise<OrderContext | null> {
    return getMockOrderStatus(orderNumber);
  },
};
