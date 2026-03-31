declare global {
  type OfficeAsyncResult<T> = {
    status?: "succeeded" | "failed";
    value?: T;
    error?: {
      message?: string;
    };
  };

  interface Window {
    Office?: {
      EventType?: {
        ItemChanged?: string;
      };
      HostType?: {
        Outlook?: string;
      };
      onReady?: (
        callback?: (info: { host?: string; platform?: string }) => void,
      ) => Promise<{ host?: string; platform?: string }> | void;
      context?: {
        mailbox?: {
          addHandlerAsync?: (
            eventType: string,
            handler: () => void,
            callback?: (result: OfficeAsyncResult<void>) => void,
          ) => void;
          removeHandlerAsync?: (
            eventType: string,
            options?: { handler?: () => void },
            callback?: (result: OfficeAsyncResult<void>) => void,
          ) => void;
          item?: {
            itemId?: string;
            subject?: string;
            from?: {
              displayName?: string;
              emailAddress?: string;
            };
            body?: {
              getAsync?: (
                coercionType?: string,
                callback?: (result: OfficeAsyncResult<string>) => void,
              ) => void;
            };
          };
        };
      };
    };
  }
}

export {};
