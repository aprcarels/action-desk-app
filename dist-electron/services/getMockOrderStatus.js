"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMockOrderStatus = getMockOrderStatus;
const mockOrders = {
    "ORD-1001": {
        orderNumber: "ORD-1001",
        status: "Shipped",
        shipmentStatus: "In Transit",
        lastUpdated: "2026-03-30T09:15:00Z",
    },
    "ORD-1002": {
        orderNumber: "ORD-1002",
        status: "Processing",
        shipmentStatus: "Label Created",
        lastUpdated: "2026-03-30T08:00:00Z",
    },
    "ORD-1003": {
        orderNumber: "ORD-1003",
        status: "Delayed",
        shipmentStatus: "Exception",
        lastUpdated: "2026-03-29T16:40:00Z",
    },
    "ORD-1004": {
        orderNumber: "ORD-1004",
        status: "Delivered",
        shipmentStatus: "Delivered",
        lastUpdated: "2026-03-30T14:18:00Z",
    },
    "ORD-1005": {
        orderNumber: "ORD-1005",
        status: "Delivered",
        shipmentStatus: "Delivered",
        lastUpdated: "2026-03-31T07:52:00Z",
    },
    "ORD-1006": {
        orderNumber: "ORD-1006",
        status: "Processing",
        shipmentStatus: "Label Created",
        lastUpdated: "2026-03-31T09:10:00Z",
    },
    "ORD-1007": {
        orderNumber: "ORD-1007",
        status: "Delivered",
        shipmentStatus: "Delivered",
        lastUpdated: "2026-03-31T08:22:00Z",
    },
    "ORD-1008": {
        orderNumber: "ORD-1008",
        status: "Delivered",
        shipmentStatus: "Delivered",
        lastUpdated: "2026-03-31T08:48:00Z",
    },
    "ORD-1009": {
        orderNumber: "ORD-1009",
        status: "Shipped",
        shipmentStatus: "In Transit",
        lastUpdated: "2026-03-31T09:36:00Z",
    },
    "ORD-1010": {
        orderNumber: "ORD-1010",
        status: "Completed",
        shipmentStatus: "Delivered",
        lastUpdated: "2026-03-30T15:05:00Z",
    },
};
async function getMockOrderStatus(orderNumber) {
    return mockOrders[orderNumber] ?? null;
}
