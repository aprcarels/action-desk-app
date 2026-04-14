import type { OrderContext } from "../../types/actionDesk";
import type { OrderContextProvider } from "../orderContextProvider";

type RealOrderContextRuntimeConfig = {
  apiBaseUrl: string;
};

type RealOrderApiResponse = {
  orderNumber?: unknown;
  status?: unknown;
  shipmentStatus?: unknown;
  lastUpdated?: unknown;
  updatedAt?: unknown;
  order?: {
    orderNumber?: unknown;
    number?: unknown;
    status?: unknown;
    orderStatus?: unknown;
    lastUpdated?: unknown;
    updatedAt?: unknown;
  };
  shipment?: {
    status?: unknown;
    shipmentStatus?: unknown;
    lastUpdated?: unknown;
    updatedAt?: unknown;
  };
  tracking?: {
    status?: unknown;
    updatedAt?: unknown;
  };
};

function getStringValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeTimestamp(value?: string): string {
  if (!value) {
    return "";
  }

  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? value : new Date(timestamp).toISOString();
}

function getMeaningfulString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const normalized = getStringValue(value);

    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

export function normalizeRealOrderContextResponse(
  payload: unknown,
  requestedOrderNumber: string,
): OrderContext | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as RealOrderApiResponse;
  const orderNumber = getMeaningfulString(
    candidate.orderNumber,
    candidate.order?.orderNumber,
    candidate.order?.number,
    requestedOrderNumber,
  );
  const status = getMeaningfulString(
    candidate.status,
    candidate.order?.status,
    candidate.order?.orderStatus,
  );
  const shipmentStatus = getMeaningfulString(
    candidate.shipmentStatus,
    candidate.shipment?.shipmentStatus,
    candidate.shipment?.status,
    candidate.tracking?.status,
  );
  const lastUpdated = normalizeTimestamp(
    getMeaningfulString(
      candidate.lastUpdated,
      candidate.updatedAt,
      candidate.order?.lastUpdated,
      candidate.order?.updatedAt,
      candidate.shipment?.lastUpdated,
      candidate.shipment?.updatedAt,
      candidate.tracking?.updatedAt,
    ),
  );

  if (!orderNumber || (!status && !shipmentStatus && !lastUpdated)) {
    return null;
  }

  return {
    orderNumber,
    status: status ?? "Unknown",
    shipmentStatus: shipmentStatus ?? "Unknown",
    lastUpdated: lastUpdated || "Unknown",
  };
}

function buildOrderContextUrl(apiBaseUrl: string, orderNumber: string): string {
  const normalizedBaseUrl = apiBaseUrl.endsWith("/")
    ? apiBaseUrl.slice(0, -1)
    : apiBaseUrl;
  const baseOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost";

  return new URL(
    `${normalizedBaseUrl}/orders/${encodeURIComponent(orderNumber)}`,
    baseOrigin,
  ).toString();
}

export function createRealOrderContextProvider(
  config: RealOrderContextRuntimeConfig,
): OrderContextProvider {
  return {
    async getOrderContext(orderNumber: string): Promise<OrderContext | null> {
      const normalizedOrderNumber = orderNumber.trim();

      if (!normalizedOrderNumber) {
        return null;
      }

      try {
        const response = await fetch(buildOrderContextUrl(config.apiBaseUrl, normalizedOrderNumber), {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });

        if (response.status === 404) {
          return null;
        }

        if (!response.ok) {
          return null;
        }

        const payload: unknown = await response.json();
        return normalizeRealOrderContextResponse(payload, normalizedOrderNumber);
      } catch {
        return null;
      }
    },
  };
}
