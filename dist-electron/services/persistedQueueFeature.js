"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPersistedQueueEnabled = isPersistedQueueEnabled;
const env_1 = require("../utils/env");
function isPersistedQueueEnabled() {
    return (0, env_1.getEnv)("VITE_USE_PERSISTED_QUEUE") === "true";
}
