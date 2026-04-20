"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAnalysisResponse = parseAnalysisResponse;
const analysisTaxonomy_1 = require("./analysisTaxonomy");
function parseAnalysisResponse(raw) {
    try {
        const parsed = JSON.parse(raw);
        if (!isParsedEmailAnalysis(parsed)) {
            return null;
        }
        return {
            summary: parsed.summary,
            intent: (0, analysisTaxonomy_1.normalizeIntent)(parsed.intent),
            urgency: parsed.urgency,
            confidence: parsed.confidence,
            orderNumber: parsed.orderNumber ?? undefined,
            risks: (0, analysisTaxonomy_1.normalizeRisks)(parsed.risks),
            nextAction: parsed.nextAction,
        };
    }
    catch {
        return null;
    }
}
function isParsedEmailAnalysis(value) {
    if (!isRecord(value)) {
        return false;
    }
    if (typeof value.summary !== "string") {
        return false;
    }
    if (typeof value.intent !== "string") {
        return false;
    }
    if (!isUrgency(value.urgency)) {
        return false;
    }
    if (!isConfidence(value.confidence)) {
        return false;
    }
    if (!Array.isArray(value.risks) || !value.risks.every((risk) => typeof risk === "string")) {
        return false;
    }
    if (typeof value.nextAction !== "string") {
        return false;
    }
    if (value.orderNumber !== undefined && typeof value.orderNumber !== "string") {
        return false;
    }
    return true;
}
function isUrgency(value) {
    return value === "low" || value === "medium" || value === "high";
}
function isConfidence(value) {
    return value === "low" || value === "medium" || value === "high";
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
