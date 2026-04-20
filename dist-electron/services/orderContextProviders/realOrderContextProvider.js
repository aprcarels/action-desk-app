"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRealOrderContextProvider = createRealOrderContextProvider;
function createRealOrderContextProvider(options) {
    return {
        async getOrderContext(orderNumber) {
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
