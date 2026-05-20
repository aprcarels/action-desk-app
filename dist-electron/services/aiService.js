"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeEmailWithSource = analyzeEmailWithSource;
const env_1 = require("../utils/env");
const analyzeEmail_1 = require("./analyzeEmail");
const analysisInput_1 = require("./analysisInput");
const aiEmailClassification_1 = require("./aiEmailClassification");
const sharedWorkflowApi_1 = require("./sharedWorkflowApi");
const DEFAULT_CLIENT_AI_TIMEOUT_MS = 5500;
function getErrorDiagnostic(error) {
    if (!error || typeof error !== "object") {
        return {
            message: String(error),
        };
    }
    const candidate = error;
    return {
        code: typeof candidate.code === "string" ? candidate.code : undefined,
        message: typeof candidate.message === "string" ? candidate.message : String(error),
        retryable: typeof candidate.retryable === "boolean" ? candidate.retryable : undefined,
        context: typeof candidate.context === "string" ? candidate.context : undefined,
        details: candidate.details,
    };
}
function logAiDiagnostic(level, event, metadata) {
    const logger = level === "warn" ? console.warn : console.info;
    logger("[Action Desk AI diagnostics]", event, metadata);
}
function isDisabledValue(value) {
    return ["false", "0", "off", "disabled"].includes(String(value ?? "").trim().toLowerCase());
}
function isAiClassificationEnabled() {
    return !(isDisabledValue((0, env_1.getEnv)("VITE_AI_CLASSIFICATION_ENABLED")) ||
        isDisabledValue((0, env_1.getEnv)("ACTION_DESK_AI_ENABLED")));
}
function withTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error("AI classification timed out."));
        }, timeoutMs);
        promise.then((value) => {
            clearTimeout(timeoutId);
            resolve(value);
        }, (error) => {
            clearTimeout(timeoutId);
            reject(error);
        });
    });
}
function buildAiRequest(email, options) {
    const parsedInput = (0, analysisInput_1.parseAnalysisInput)(email);
    return {
        subject: (options?.aiInput?.subject ?? parsedInput.subject).trim(),
        from: (options?.aiInput?.from ?? "").trim(),
        body: ((options?.aiInput?.body ?? parsedInput.body) || email).trim(),
    };
}
async function getAssistiveAiClassification(email, options) {
    if (!isAiClassificationEnabled()) {
        logAiDiagnostic("info", "aiClassificationSkipped", {
            reason: "disabled",
            source: "client",
        });
        return undefined;
    }
    try {
        const response = await withTimeout((0, sharedWorkflowApi_1.classifyEmailWithAi)(buildAiRequest(email, options)), DEFAULT_CLIENT_AI_TIMEOUT_MS);
        const classification = (0, aiEmailClassification_1.normalizeAiEmailClassification)(response);
        if (!classification) {
            logAiDiagnostic("warn", "aiUnavailableFallback", {
                reason: "invalid_ai_classification_response",
                source: "client",
            });
            return undefined;
        }
        logAiDiagnostic("info", "aiClassificationReceived", {
            source: "client",
            provider: classification.aiSource,
            category: classification.category,
            actionable: classification.actionable,
            urgency: classification.urgency,
            confidence: classification.confidence,
        });
        return classification;
    }
    catch (error) {
        logAiDiagnostic("warn", "aiUnavailableFallback", {
            reason: "ai_route_unavailable",
            source: "client",
            ...getErrorDiagnostic(error),
        });
        return undefined;
    }
}
async function analyzeEmailWithSource(email, options) {
    const analysis = (0, analyzeEmail_1.analyzeEmail)(email);
    const aiClassification = await getAssistiveAiClassification(email, options);
    return {
        analysis,
        analysisSource: aiClassification ? "hybrid" : "fallback",
        aiClassification,
    };
}
