import type {
  PilotQueueItemState,
  PilotQueueView,
  PilotUsefulnessFeedback,
  PilotWorkflowStatus,
} from "../types/actionDesk";

const PILOT_QUEUE_STATE_STORAGE_KEY = "action-desk-pilot-queue-state";

export type PilotQueueStateMap = Record<string, PilotQueueItemState>;

export function getDefaultPilotQueueItemState(now = new Date()): PilotQueueItemState {
  return {
    workflowStatus: "active",
    updatedAt: now.toISOString(),
  };
}

export function createSnoozeUntilTomorrow(now = new Date()): string {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(8, 0, 0, 0);
  return next.toISOString();
}

function isPilotQueueItemState(value: unknown): value is PilotQueueItemState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    (candidate.workflowStatus === "active" ||
      candidate.workflowStatus === "done" ||
      candidate.workflowStatus === "not_relevant" ||
      candidate.workflowStatus === "waiting_on_customer") &&
    typeof candidate.updatedAt === "string" &&
    (candidate.snoozedUntil === undefined || typeof candidate.snoozedUntil === "string") &&
    (candidate.usefulness === undefined ||
      candidate.usefulness === "helpful" ||
      candidate.usefulness === "not_helpful")
  );
}

export function loadPilotQueueStateMap(): PilotQueueStateMap {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(PILOT_QUEUE_STATE_STORAGE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, PilotQueueItemState] =>
        isPilotQueueItemState(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}

export function savePilotQueueStateMap(stateMap: PilotQueueStateMap) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(PILOT_QUEUE_STATE_STORAGE_KEY, JSON.stringify(stateMap));
  } catch {
    // Ignore storage failures during pilot mode so queue actions do not break the session.
  }
}

export function getPilotQueueItemState(
  stateMap: PilotQueueStateMap,
  emailId: string,
  now = new Date(),
): PilotQueueItemState {
  return stateMap[emailId] ?? getDefaultPilotQueueItemState(now);
}

export function updatePilotQueueItemState(
  stateMap: PilotQueueStateMap,
  emailId: string,
  updates: Partial<PilotQueueItemState>,
  now = new Date(),
): PilotQueueStateMap {
  const current = getPilotQueueItemState(stateMap, emailId, now);
  const nextState: PilotQueueItemState = {
    ...current,
    ...updates,
    updatedAt: now.toISOString(),
  };

  if (nextState.workflowStatus !== "active" && nextState.workflowStatus !== "waiting_on_customer") {
    delete nextState.snoozedUntil;
  }

  return {
    ...stateMap,
    [emailId]: nextState,
  };
}

export function setPilotWorkflowStatus(
  stateMap: PilotQueueStateMap,
  emailId: string,
  workflowStatus: PilotWorkflowStatus,
  now = new Date(),
): PilotQueueStateMap {
  return updatePilotQueueItemState(
    stateMap,
    emailId,
    {
      workflowStatus,
      snoozedUntil: undefined,
    },
    now,
  );
}

export function snoozePilotQueueItemUntilTomorrow(
  stateMap: PilotQueueStateMap,
  emailId: string,
  now = new Date(),
): PilotQueueStateMap {
  return updatePilotQueueItemState(
    stateMap,
    emailId,
    {
      workflowStatus: "active",
      snoozedUntil: createSnoozeUntilTomorrow(now),
    },
    now,
  );
}

export function setPilotUsefulnessFeedback(
  stateMap: PilotQueueStateMap,
  emailId: string,
  usefulness: PilotUsefulnessFeedback,
  now = new Date(),
): PilotQueueStateMap {
  return updatePilotQueueItemState(
    stateMap,
    emailId,
    {
      usefulness,
    },
    now,
  );
}

export function getPilotQueueViewForItem(
  itemState: PilotQueueItemState,
  now = new Date(),
): Exclude<PilotQueueView, "all"> {
  if (itemState.snoozedUntil) {
    const snoozedUntilTime = Date.parse(itemState.snoozedUntil);

    if (!Number.isNaN(snoozedUntilTime) && snoozedUntilTime > now.getTime()) {
      return "snoozed";
    }
  }

  if (itemState.workflowStatus === "done") {
    return "done";
  }

  if (itemState.workflowStatus === "not_relevant") {
    return "not_relevant";
  }

  if (itemState.workflowStatus === "waiting_on_customer") {
    return "waiting_on_customer";
  }

  return "active";
}

export function shouldShowPilotQueueItemInView(
  itemState: PilotQueueItemState,
  view: PilotQueueView,
  now = new Date(),
): boolean {
  if (view === "all") {
    return true;
  }

  const derivedView = getPilotQueueViewForItem(itemState, now);

  if (view === "active") {
    return derivedView === "active" || derivedView === "waiting_on_customer";
  }

  return derivedView === view;
}
