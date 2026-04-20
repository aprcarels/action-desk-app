"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canOpenInOutlook = canOpenInOutlook;
exports.buildOutlookSearchUrl = buildOutlookSearchUrl;
function getEmailSource(email) {
    return "email" in email ? email.email : email;
}
function getSearchParts(email) {
    const subject = email.subject.trim();
    const sender = email.senderEmail.trim() || email.senderName.trim();
    const parts = [];
    if (subject) {
        parts.push(`subject:"${subject}"`);
    }
    if (sender) {
        parts.push(`from:"${sender}"`);
    }
    return parts;
}
function canOpenInOutlook(email) {
    return getSearchParts(getEmailSource(email)).length > 0;
}
function buildOutlookSearchUrl(email) {
    const parts = getSearchParts(getEmailSource(email));
    return `https://outlook.office.com/mail/?search=${encodeURIComponent(parts.join(" "))}`;
}
