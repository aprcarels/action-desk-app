"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasExactOutlookMessageLink = hasExactOutlookMessageLink;
exports.getOpenInOutlookFallbackMessage = getOpenInOutlookFallbackMessage;
exports.getOutlookOpenTarget = getOutlookOpenTarget;
const MISSING_EXACT_MESSAGE_LINK_MESSAGE = "We could not open this exact message in Outlook. Please search your Outlook inbox for this subject.";
function getEmailSource(email) {
    return "email" in email ? email.email : email;
}
function hasExactOutlookMessageLink(email) {
    return Boolean(getEmailSource(email).outlookWebLink?.trim());
}
function getOpenInOutlookFallbackMessage() {
    return MISSING_EXACT_MESSAGE_LINK_MESSAGE;
}
function getOutlookOpenTarget(email) {
    const emailSource = getEmailSource(email);
    const exactLink = emailSource.outlookWebLink?.trim();
    if (exactLink) {
        return {
            type: "exact",
            url: exactLink,
        };
    }
    return {
        type: "missing_exact_link",
        message: MISSING_EXACT_MESSAGE_LINK_MESSAGE,
    };
}
