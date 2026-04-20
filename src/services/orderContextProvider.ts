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

  if (source === "real") {
    return createRealOrderContextProvider({
      apiBaseUrl,
    });
  }

  return mockOrderContextProvider;
}