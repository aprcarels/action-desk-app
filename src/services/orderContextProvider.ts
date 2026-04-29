import { mockOrderContextProvider } from "./orderContextProviders/mockOrderContextProvider";
import { createRealOrderContextProvider } from "./orderContextProviders/realOrderContextProvider";

export type OrderContextProvider = {
  getOrderContext(orderNumber: string): Promise<{
    orderNumber: string;
    status: string;
    shipmentStatus: string;
    lastUpdated: string;
  } | null>;
};

type OrderContextSource = "real" | "mock";
type CreateOrderContextProviderOptions = {
  source?: OrderContextSource;
  apiBaseUrl?: string;
};

function getEnvValue(name: string): string | undefined {
  if (typeof process !== "undefined" && process.env && typeof process.env[name] === "string") {
    return process.env[name];
  }

  return undefined;
}

function resolveOrderContextSource(): OrderContextSource {
  const envValue = getEnvValue("VITE_ORDER_CONTEXT_SOURCE");
  return envValue === "real" ? "real" : "mock";
}

function resolveOrderContextApiBaseUrl(): string | undefined {
  const envValue = getEnvValue("VITE_ORDER_CONTEXT_API_BASE_URL")?.trim();
  return envValue || undefined;
}

export function getOrderContextProvider(): OrderContextProvider {
  const source = resolveOrderContextSource();
  const apiBaseUrl = resolveOrderContextApiBaseUrl();

  return createOrderContextProvider({
    source,
    apiBaseUrl,
  });
}

export function createOrderContextProvider(
  options?: CreateOrderContextProviderOptions,
): OrderContextProvider {
  const source = options?.source ?? resolveOrderContextSource();
  const apiBaseUrl = options?.apiBaseUrl ?? resolveOrderContextApiBaseUrl();

  if (source === "real" && apiBaseUrl) {
    return createRealOrderContextProvider({
      apiBaseUrl,
    });
  }

  return mockOrderContextProvider;
}
