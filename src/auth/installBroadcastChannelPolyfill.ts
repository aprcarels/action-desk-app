type MessageListener = (event: MessageEvent) => void;

const LOCALHOST_DESKTOP_PORT = "3960";
const STORAGE_KEY_PREFIX = "action-desk.broadcast-channel";
const WINDOW_MESSAGE_TYPE = "action-desk:broadcast-channel";

let polyfillInstalled = false;

function shouldInstallPolyfill(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.location.protocol === "http:" &&
    window.location.hostname === "localhost" &&
    window.location.port === LOCALHOST_DESKTOP_PORT
  );
}

class LocalStorageBroadcastChannel implements BroadcastChannel {
  readonly name: string;
  onmessage: ((this: BroadcastChannel, ev: MessageEvent) => unknown) | null = null;
  onmessageerror: ((this: BroadcastChannel, ev: MessageEvent) => unknown) | null = null;

  private readonly senderId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  private readonly storageKey: string;
  private readonly listeners = new Set<MessageListener>();
  private readonly handleWindowMessage = (event: MessageEvent) => {
    const data = event.data as
      | {
          type?: string;
          channelName?: string;
          senderId?: string;
          message?: unknown;
        }
      | undefined;

    if (
      !data ||
      data.type !== WINDOW_MESSAGE_TYPE ||
      data.channelName !== this.name ||
      data.senderId === this.senderId
    ) {
      return;
    }

    console.info("[auth][BroadcastChannelPolyfill] received window message", {
      channelName: this.name,
    });

    this.dispatchMessage(data.message);
  };
  private readonly handleStorage = (event: StorageEvent) => {
    if (event.key !== this.storageKey || !event.newValue) {
      return;
    }

    try {
      const payload = JSON.parse(event.newValue) as {
        senderId?: string;
        message?: unknown;
      };

      if (payload.senderId === this.senderId) {
        return;
      }

      console.info("[auth][BroadcastChannelPolyfill] received storage message", {
        channelName: this.name,
      });

      this.dispatchMessage(payload.message);
    } catch (error) {
      const errorEvent = new MessageEvent("messageerror", {
        data: error,
      });

      this.onmessageerror?.call(this, errorEvent);
    }
  };

  constructor(name: string) {
    this.name = name;
    this.storageKey = `${STORAGE_KEY_PREFIX}:${name}`;
    window.addEventListener("storage", this.handleStorage);
    window.addEventListener("message", this.handleWindowMessage);
  }

  postMessage(message: unknown): void {
    const payload = JSON.stringify({
      senderId: this.senderId,
      message,
      timestamp: Date.now(),
      nonce: Math.random().toString(36).slice(2),
    });

    console.info("[auth][BroadcastChannelPolyfill] posting message", {
      channelName: this.name,
      hasOpener: Boolean(window.opener),
    });

    localStorage.setItem(this.storageKey, payload);
    localStorage.removeItem(this.storageKey);

    if (window.opener && typeof window.opener.postMessage === "function") {
      try {
        window.opener.postMessage(
          {
            type: WINDOW_MESSAGE_TYPE,
            channelName: this.name,
            senderId: this.senderId,
            message,
          },
          window.location.origin,
        );
        console.info("[auth][BroadcastChannelPolyfill] opener.postMessage sent", {
          channelName: this.name,
          targetOrigin: window.location.origin,
        });
      } catch (error) {
        console.error("[auth][BroadcastChannelPolyfill] opener.postMessage failed", {
          channelName: this.name,
          error,
        });
      }
    } else {
      console.warn("[auth][BroadcastChannelPolyfill] no opener available for postMessage", {
        channelName: this.name,
      });
    }
  }

  close(): void {
    window.removeEventListener("storage", this.handleStorage);
    window.removeEventListener("message", this.handleWindowMessage);
    this.listeners.clear();
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ): void {
    if (type !== "message" || !listener) {
      return;
    }

    if (typeof listener === "function") {
      this.listeners.add(listener as MessageListener);
      return;
    }

    this.listeners.add((event) => {
      listener.handleEvent(event);
    });
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ): void {
    if (type !== "message" || !listener) {
      return;
    }

    if (typeof listener === "function") {
      this.listeners.delete(listener as MessageListener);
    }
  }

  dispatchEvent(): boolean {
    return true;
  }

  private dispatchMessage(message: unknown): void {
    const messageEvent = new MessageEvent("message", {
      data: message,
    });

    this.onmessage?.call(this, messageEvent);
    this.listeners.forEach((listener) => listener(messageEvent));
  }
}

export function installBroadcastChannelPolyfill(): void {
  if (polyfillInstalled || !shouldInstallPolyfill()) {
    return;
  }

  window.BroadcastChannel = LocalStorageBroadcastChannel as typeof BroadcastChannel;
  polyfillInstalled = true;
  console.info("[auth][BroadcastChannelPolyfill] installed", {
    origin: window.location.origin,
  });
}
