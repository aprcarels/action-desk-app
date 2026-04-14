import { broadcastResponseToMainFrame } from "@azure/msal-browser/redirect-bridge";

async function completePopupAuth(): Promise<void> {
  try {
    await broadcastResponseToMainFrame();
  } catch (error) {
    console.error("[auth] popup callback bridge failed", error);

    try {
      window.close();
    } catch {
      // Ignore close failures in restricted browsers.
    }
  }
}

void completePopupAuth();
