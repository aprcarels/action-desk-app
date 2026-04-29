import { installBroadcastChannelPolyfill } from "./installBroadcastChannelPolyfill";
import { broadcastResponseToMainFrame } from "@azure/msal-browser/redirect-bridge";

async function completePopupAuth(): Promise<void> {
  installBroadcastChannelPolyfill();
  console.info("[auth][popup-callback] callback page loaded", {
    href: window.location.href,
    hasOpener: Boolean(window.opener),
    broadcastChannelType: typeof window.BroadcastChannel,
  });

  try {
    console.info("[auth][popup-callback] calling broadcastResponseToMainFrame");
    await broadcastResponseToMainFrame();
    console.info("[auth][popup-callback] broadcastResponseToMainFrame completed");
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
