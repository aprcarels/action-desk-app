"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeEmailWithSource = analyzeEmailWithSource;
const analyzeEmail_1 = require("./analyzeEmail");
function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
async function analyzeEmailWithSource(email) {
    await delay(50);
    const analysis = (0, analyzeEmail_1.analyzeEmail)(email);
    return {
        analysis,
        analysisSource: "fallback",
    };
}
