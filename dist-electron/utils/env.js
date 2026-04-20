"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEnv = getEnv;
function getEnv(name) {
    if (typeof process !== "undefined" && process.env) {
        const value = process.env[name];
        if (typeof value === "string") {
            return value;
        }
    }
    return undefined;
}
