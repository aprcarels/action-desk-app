import type { OrderContextProvider } from "../orderContextProvider";

type CreateRealOrderContextProviderOptions = {
  apiBaseUrl?: string;
};

type NormalizedOrderContext = Awaited<
  ReturnType<OrderContextProvider["getOrderContext"]>
>;

export function normalizeRealOrderContextResponse(
  payload: unknown,
  fallbackOrderNumber: string,
): NormalizedOrderContext {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as {
    order?: {
      orderNumber?: unknown;
      status?: unknown;
    };
    shipment?: {
      status?: unknown;
      updatedAt?: unknown;
    };
    orderNumber?: unknown;
    status?: unknown;
    shipmentStatus?: unknown;
    lastUpdated?: unknown;
  };

  const orderNumber =
    typeof candidate.order?.orderNumber === "string"
      ? candidate.order.orderNumber
      : typeof candidate.orderNumber === "string"
        ? candidate.orderNumber
        : fallbackOrderNumber;
  const status =
    typeof candidate.order?.status === "string"
      ? candidate.order.status
      : typeof candidate.status === "string"
        ? candidate.status
        : undefined;
  const shipmentStatus =
    typeof candidate.shipment?.status === "string"
      ? candidate.shipment.status
      : typeof candidate.shipmentStatus === "string"
        ? candidate.shipmentStatus
        : undefined;
  const rawLastUpdated =
    typeof candidate.shipment?.updatedAt === "string"
      ? candidate.shipment.updatedAt
      : typeof candidate.lastUpdated === "string"
        ? candidate.lastUpdated
        : undefined;

  if (!status || !shipmentStatus) {
    return null;
  }

  const normalizedLastUpdated =
    rawLastUpdated && !Number.isNaN(Date.parse(rawLastUpdated))
      ? new Date(rawLastUpdated).toISOString()
      : new Date().toISOString();

  return {
    orderNumber,
    status,
    shipmentStatus,
    lastUpdated: normalizedLastUpdated,
  };
}

export function createRealOrderContextProvider(
  options?: CreateRealOrderContextProviderOptions,
): OrderContextProvider {
  return {
    async getOrderContext(orderNumber: string) {
      const baseUrl = options?.apiBaseUrl?.trim();

      if (!baseUrl) {
        return null;
      }

      try {
        const response = await fetch(
          `${baseUrl.replace(/\/$/, "")}/orders/${encodeURIComponent(orderNumber)}`,
        );

        if (!response.ok) {
          return null;
        }

        const data = await response.json();
        return normalizeRealOrderContextResponse(data, orderNumber);
      } catch {
        return null;
      }
    },
  };
}
