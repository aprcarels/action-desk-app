export {};

declare global {
  interface Window {
    actionDeskDesktop?: {
      isElectron?: boolean;
      ingestRawEmails?: (rawEmails: unknown[]) => Promise<{
        queueItems: unknown[];
      }>;
      getDesktopRuntimeInfo?: () => Promise<{
        isElectron: boolean;
        isDev: boolean;
        userDataPath: string;
        recommendedRepositoryBackend: "sqlite";
        inboxSource?: string;
      }>;
      loadQueue?: (options?: {
        cursor?: string;
        interactiveAuth?: boolean;
      }) => Promise<{
        queueItems: unknown[];
        nextCursor?: string | null;
      }>;
      loadQueueMore?: (options?: {
        cursor?: string;
        interactiveAuth?: boolean;
      }) => Promise<{
        queueItems: unknown[];
        nextCursor?: string | null;
      }>;
      recomputePriority?: (queueItemId: string) => Promise<unknown>;
      updateWorkStatus?: (
        queueItemId: string,
        status: string,
      ) => Promise<unknown>;
      markResolved?: (queueItemId: string) => Promise<unknown>;
      signIn?: () => Promise<{
        username: string;
        expiresAt: number;
      }>;
      getAccessToken?: () => Promise<string>;
    };
  }
}