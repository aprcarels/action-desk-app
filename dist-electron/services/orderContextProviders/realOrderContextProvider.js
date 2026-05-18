"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeRealOrderContextResponse = normalizeRealOrderContextResponse;
exports.createRealOrderContextProvider = createRealOrderContextProvider;
function normalizeRealOrderContextResponse(payload, fallbackOrderNumber) {
    if (!payload || typeof payload !== "object") {
        return null;
    }
    const candidate = payload;
    const orderNumber = typeof candidate.order?.orderNumber === "string"
        ? candidate.order.orderNumber
        : typeof candidate.orderNumber === "string"
            ? candidate.orderNumber
            : fallbackOrderNumber;
    const status = typeof candidate.order?.status === "string"
        ? candidate.order.status
        : typeof candidate.status === "string"
            ? candidate.status
            : undefined;
    const shipmentStatus = typeof candidate.shipment?.status === "string"
        ? candidate.shipment.status
        : typeof candidate.shipmentStatus === "string"
            ? candidate.shipmentStatus
            : undefined;
    const rawLastUpdated = typeof candidate.shipment?.updatedAt === "string"
        ? candidate.shipment.updatedAt
        : typeof candidate.lastUpdated === "string"
            ? candidate.lastUpdated
            : undefined;
    if (!status || !shipmentStatus) {
        return null;
    }
    const normalizedLastUpdated = rawLastUpdated && !Number.isNaN(Date.parse(rawLastUpdated))
        ? new Date(rawLastUpdated).toISOString()
        : new Date().toISOString();
    return {
        orderNumber,
        status,
        shipmentStatus,
        lastUpdated: normalizedLastUpdated,
    };
}
function createRealOrderContextProvider(options) {
    return {
        async getOrderContext(orderNumber) {
            const baseUrl = options?.apiBaseUrl?.trim();
            if (!baseUrl) {
                return null;
            }
            try {
                const response = await fetch(`${baseUrl.replace(/\/$/, "")}/orders/${encodeURIComponent(orderNumber)}`);
                if (!response.ok) {
                    return null;
                }
                const data = await response.json();
                return normalizeRealOrderContextResponse(data, orderNumber);
            }
            catch {
                return null;
            }
        },
    };
}
