"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OLLAMA_TIMEOUT_MS = exports.OLLAMA_MODEL = exports.OLLAMA_URL = exports.OLLAMA_BASE_URL = exports.DEFAULT_OLLAMA_TIMEOUT_MS = exports.DEFAULT_OLLAMA_MODEL = exports.DEFAULT_OLLAMA_BASE_URL = void 0;
exports.getOllamaBaseUrl = getOllamaBaseUrl;
exports.getOllamaModel = getOllamaModel;
exports.getOllamaTimeoutMs = getOllamaTimeoutMs;
const env_1 = require("../utils/env");
exports.DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
exports.DEFAULT_OLLAMA_MODEL = "qwen2.5:3b";
exports.DEFAULT_OLLAMA_TIMEOUT_MS = 4000;
function getOllamaBaseUrl() {
    return (0, env_1.getEnv)("OLLAMA_BASE_URL")?.trim() || exports.DEFAULT_OLLAMA_BASE_URL;
}
function getOllamaModel() {
    return (0, env_1.getEnv)("OLLAMA_MODEL")?.trim() || exports.DEFAULT_OLLAMA_MODEL;
}
function getOllamaTimeoutMs() {
    const parsed = Number.parseInt((0, env_1.getEnv)("OLLAMA_TIMEOUT_MS") ?? "", 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return exports.DEFAULT_OLLAMA_TIMEOUT_MS;
    }
    return parsed;
}
exports.OLLAMA_BASE_URL = getOllamaBaseUrl();
exports.OLLAMA_URL = `${exports.OLLAMA_BASE_URL.replace(/\/+$/, "")}/api/generate`;
exports.OLLAMA_MODEL = getOllamaModel();
exports.OLLAMA_TIMEOUT_MS = getOllamaTimeoutMs();
