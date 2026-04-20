"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const redirect_bridge_1 = require("@azure/msal-browser/redirect-bridge");
async function completePopupAuth() {
    try {
        await (0, redirect_bridge_1.broadcastResponseToMainFrame)();
    }
    catch (error) {
        console.error("[auth] popup callback bridge failed", error);
        try {
            window.close();
        }
        catch {
            // Ignore close failures in restricted browsers.
        }
    }
}
void completePopupAuth();
