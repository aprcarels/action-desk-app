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
        recommendedRepositoryBackend: "sqlite" | "api";
        actionDeskApiUrl?: string | null;
        inboxSource?: string;
        appOrigin?: string | null;
        apiOrigin?: string | null;
        logFilePath?: string | null;
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
      signInWithMicrosoft?: () => Promise<{
        sessionId: string;
        currentUser: {
          id: string;
          name: string;
          initials: string;
          email: string;
          role: "rep" | "supervisor" | "admin";
          locationId?: string;
          isActive?: boolean;
        } | null;
        reps?: Array<{
          id: string;
          name: string;
          initials: string;
          email: string;
          role: "rep" | "supervisor" | "admin";
          locationId?: string;
          isActive?: boolean;
        }>;
        capabilities: string[];
      }>;
      signOut?: (sessionId: string) => Promise<{
        sessionId: string;
      }>;
    };
  }
}
