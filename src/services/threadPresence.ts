import type {
  RepProfile,
  ThreadPresenceRecord,
  ThreadPresenceType,
} from "../types/actionDesk";

export const THREAD_PRESENCE_TIMEOUT_MS = 3 * 60 * 1000;

function getTimestamp(value?: string): number {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function isThreadPresenceActive(
  presence: ThreadPresenceRecord,
  now = new Date(),
): boolean {
  return now.getTime() - getTimestamp(presence.updatedAt) <= THREAD_PRESENCE_TIMEOUT_MS;
}

export function getActiveThreadPresence(
  presenceRecords: ThreadPresenceRecord[] | undefined,
  options?: {
    currentUserId?: string;
    now?: Date;
    includeCurrentUser?: boolean;
  },
): ThreadPresenceRecord | undefined {
  const now = options?.now ?? new Date();
  const includeCurrentUser = options?.includeCurrentUser === true;
  const currentUserId = options?.currentUserId;

  return [...(presenceRecords ?? [])]
    .filter((presence) => isThreadPresenceActive(presence, now))
    .filter(
      (presence) =>
        includeCurrentUser || !currentUserId || presence.activeUserId !== currentUserId,
    )
    .sort((left, right) => {
      if (left.presenceType !== right.presenceType) {
        return left.presenceType === "working" ? -1 : 1;
      }

      return getTimestamp(right.updatedAt) - getTimestamp(left.updatedAt);
    })[0];
}

export function createThreadPresenceRecord(input: {
  threadId: string;
  user: RepProfile;
  presenceType: ThreadPresenceType;
  updatedAt?: string;
}): ThreadPresenceRecord {
  return {
    threadId: input.threadId,
    activeUserId: input.user.id,
    activeUserName: input.user.name,
    activeUserRole: input.user.role,
    presenceType: input.presenceType,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

export function upsertThreadPresence(
  presenceByThread: Record<string, ThreadPresenceRecord[]>,
  record: ThreadPresenceRecord,
): Record<string, ThreadPresenceRecord[]> {
  const currentRecords = presenceByThread[record.threadId] ?? [];
  const nextRecords = [
    ...currentRecords.filter(
      (presence) => presence.activeUserId !== record.activeUserId,
    ),
    record,
  ];

  return {
    ...presenceByThread,
    [record.threadId]: nextRecords,
  };
}

export function clearThreadPresenceForUser(
  presenceByThread: Record<string, ThreadPresenceRecord[]>,
  userId: string,
  threadId?: string,
): Record<string, ThreadPresenceRecord[]> {
  const entries = Object.entries(presenceByThread)
    .map(([currentThreadId, records]) => {
      if (threadId && currentThreadId !== threadId) {
        return [currentThreadId, records] as const;
      }

      return [
        currentThreadId,
        records.filter((presence) => presence.activeUserId !== userId),
      ] as const;
    })
    .filter(([, records]) => records.length > 0);

  return Object.fromEntries(entries);
}

export function getPresenceConflictWarning(
  presence: ThreadPresenceRecord | undefined,
): string | undefined {
  if (!presence || presence.presenceType !== "working") {
    return undefined;
  }

  return `${presence.activeUserName} is currently working this thread. Please coordinate before making changes.`;
}
