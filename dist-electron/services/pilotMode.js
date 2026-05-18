"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PILOT_ORDER_DATA_MESSAGE = void 0;
exports.isPilotModeEnabled = isPilotModeEnabled;
exports.filterInboxEmailsForPilotMode = filterInboxEmailsForPilotMode;
const env_1 = require("../utils/env");
exports.PILOT_ORDER_DATA_MESSAGE = "Order context is currently using pilot/demo-safe data unless otherwise noted.";
function isPilotModeEnabled() {
    return (0, env_1.getEnv)("VITE_PILOT_MODE") === "true";
}
function filterInboxEmailsForPilotMode(items, pilotMode = isPilotModeEnabled()) {
    if (!pilotMode) {
        return items;
    }
    return items.filter((item) => {
        const source = item?.source;
        const provider = item?.provider;
        return (source === "outlook_import" ||
            source === "outlook_graph" ||
            source === "test_data" ||
            provider === "outlook_addin_import" ||
            provider === "outlook_graph" ||
            provider === "test_data");
    });
}
