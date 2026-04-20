"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockOrderContextProvider = void 0;
exports.mockOrderContextProvider = {
    async getOrderContext(orderNumber) {
        return {
            orderNumber,
            status: "Mock Status",
            shipmentStatus: "Mock Shipment Status",
            lastUpdated: new Date().toISOString(),
        };
    },
};
