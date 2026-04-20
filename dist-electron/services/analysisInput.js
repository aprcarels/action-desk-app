"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAnalysisInput = buildAnalysisInput;
exports.parseAnalysisInput = parseAnalysisInput;
const SUBJECT_MARKER = "Action Desk Subject:";
const BODY_MARKER = "Action Desk Body:";
function buildAnalysisInput(email) {
    const subject = email.subject.trim();
    const body = email.body.trim();
    if (!subject) {
        return body;
    }
    return `${SUBJECT_MARKER} ${subject}\n${BODY_MARKER}\n${body}`;
}
function parseAnalysisInput(email) {
    const normalizedEmail = email.replace(/\r/g, "");
    if (!normalizedEmail.startsWith(SUBJECT_MARKER)) {
        return {
            subject: "",
            body: normalizedEmail,
            fullText: normalizedEmail,
        };
    }
    const bodyMarkerIndex = normalizedEmail.indexOf(`\n${BODY_MARKER}\n`);
    if (bodyMarkerIndex === -1) {
        return {
            subject: normalizedEmail.slice(SUBJECT_MARKER.length).trim(),
            body: "",
            fullText: normalizedEmail,
        };
    }
    const subject = normalizedEmail
        .slice(SUBJECT_MARKER.length, bodyMarkerIndex)
        .trim();
    const body = normalizedEmail
        .slice(bodyMarkerIndex + `\n${BODY_MARKER}\n`.length)
        .trim();
    return {
        subject,
        body,
        fullText: [subject, body].filter(Boolean).join("\n"),
    };
}
