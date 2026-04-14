import type { OrderContext } from "../types/actionDesk";
import { mockOrderContextProvider } from "./orderContextProviders/mockOrderContextProvider";
import { createRealOrderContextProvider } from "./orderContextProviders/realOrderContextProvider";
import { isPilotModeEnabled } from "./pilotMode";

export interface OrderContextProvider {
  getOrderContext(orderNumber: string): Promise<OrderContext | null>;
}

const disconnectedOrderContextProvider: OrderContextProvider = {
  async getOrderContext(): Promise<OrderContext | null> {
    return null;
  },
};

type OrderContextSource = "mock" | "real";

type OrderContextRuntimeConfig = {
  source: OrderContextSource;
  apiBaseUrl?: string;
};

export function getOrderContextRuntimeConfig(): OrderContextRuntimeConfig {
  return {
    source: import.meta.env.VITE_ORDER_CONTEXT_SOURCE === "real" ? "real" : "mock",
    apiBaseUrl: import.meta.env.VITE_ORDER_CONTEXT_API_BASE_URL?.trim() || undefined,
  };
}

export function createOrderContextProvider(
  config: OrderContextRuntimeConfig,
): OrderContextProvider {
  if (config.source === "real" && config.apiBaseUrl) {
    return createRealOrderContextProvider({
      apiBaseUrl: config.apiBaseUrl,
    });
  }

  if (isPilotModeEnabled()) {
    return disconnectedOrderContextProvider;
  }

  return mockOrderContextProvider;
}

export function getOrderContextProvider(): OrderContextProvider {
  return createOrderContextProvider(getOrderContextRuntimeConfig());
}
