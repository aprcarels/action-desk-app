"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setRuntimeEnv = setRuntimeEnv;
exports.getEnv = getEnv;
function normalizeEnvValue(value) {
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "boolean") {
        return value ? "true" : "false";
    }
    return undefined;
}
function getRuntimeEnvStore() {
    const runtimeGlobal = globalThis;
    return runtimeGlobal.__ACTION_DESK_ENV__;
}
function readFromRuntimeStore(key) {
    return normalizeEnvValue(getRuntimeEnvStore()?.[key]);
}
function readFromProcessEnv(key) {
    if (typeof process === "undefined" ||
        !process.env ||
        typeof process.env[key] !== "string") {
        return undefined;
    }
    return process.env[key];
}
function setRuntimeEnv(source) {
    const runtimeGlobal = globalThis;
    runtimeGlobal.__ACTION_DESK_ENV__ = source;
}
function getEnv(key) {
    return readFromRuntimeStore(key) ?? readFromProcessEnv(key);
}
