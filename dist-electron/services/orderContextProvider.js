"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrderContextProvider = getOrderContextProvider;
const mockOrderContextProvider_1 = require("./orderContextProviders/mockOrderContextProvider");
const realOrderContextProvider_1 = require("./orderContextProviders/realOrderContextProvider");
function getEnvValue(name) {
    if (typeof process !== "undefined" && process.env && typeof process.env[name] === "string") {
        return process.env[name];
    }
    return undefined;
}
function resolveOrderContextSource() {
    const envValue = getEnvValue("VITE_ORDER_CONTEXT_SOURCE");
    return envValue === "real" ? "real" : "mock";
}
function resolveOrderContextApiBaseUrl() {
    const envValue = getEnvValue("VITE_ORDER_CONTEXT_API_BASE_URL")?.trim();
    return envValue || undefined;
}
function getOrderContextProvider() {
    const source = resolveOrderContextSource();
    const apiBaseUrl = resolveOrderContextApiBaseUrl();
    if (source === "real") {
        return (0, realOrderContextProvider_1.createRealOrderContextProvider)({
            apiBaseUrl,
        });
    }
    return mockOrderContextProvider_1.mockOrderContextProvider;
}
