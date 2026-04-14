import { getPilotQueueViewForItem } from "./pilotQueueState";
import type {
  PilotQueueItemState,
  QueueAgeBucket,
  QueueAgeStatus,
} from "../types/actionDesk";

export type QueueAgeInfo = {
  ageInHours: number;
  ageInDays: number;
  bucket: QueueAgeBucket;
  status: QueueAgeStatus;
  label: string;
  shortLabel: string;
  isStale: boolean;
  isActiveAgingWork: boolean;
  sortWeight: number;
};

function getAgeInHours(receivedAt: string, now: Date): number {
  const receivedAtTime = Date.parse(receivedAt);

  if (Number.isNaN(receivedAtTime)) {
    return 0;
  }

  return Math.max(0, Math.floor((now.getTime() - receivedAtTime) / 3600000));
}

function getAgeBucket(ageInHours: number): QueueAgeBucket {
  if (ageInHours < 24) {
    return "new";
  }

  if (ageInHours < 72) {
    return "aging";
  }

  if (ageInHours < 168) {
    return "stale";
  }

  return "overdue";
}

function getWaitingAgeBucket(ageInHours: number): QueueAgeBucket {
  if (ageInHours < 48) {
    return "new";
  }

  if (ageInHours < 120) {
    return "aging";
  }

  if (ageInHours < 240) {
    return "stale";
  }

  return "overdue";
}

function formatAgeCompact(ageInHours: number): string {
  if (ageInHours < 24) {
    return `${ageInHours}h`;
  }

  return `${Math.floor(ageInHours / 24)}d`;
}

function getSortWeight(status: QueueAgeStatus, bucket: QueueAgeBucket): number {
  if (status === "done" || status === "not_relevant" || status === "snoozed") {
    return 0;
  }

  if (status === "waiting_on_customer") {
    return bucket === "overdue" ? 2 : bucket === "stale" ? 1 : 0;
  }

  if (bucket === "overdue") {
    return 4;
  }

  if (bucket === "stale") {
    return 3;
  }

  if (bucket === "aging") {
    return 1;
  }

  return 0;
}

export function getQueueAgeInfo(options: {
  receivedAt: string;
  pilotItemState?: PilotQueueItemState;
  now?: Date;
}): QueueAgeInfo {
  const now = options.now ?? new Date();
  const ageInHours = getAgeInHours(options.receivedAt, now);
  const ageInDays = Math.floor(ageInHours / 24);
  const status = options.pilotItemState
    ? getPilotQueueViewForItem(options.pilotItemState, now)
    : "active";
  const bucket =
    status === "waiting_on_customer"
      ? getWaitingAgeBucket(ageInHours)
      : getAgeBucket(ageInHours);

  if (status === "done") {
    return {
      ageInHours,
      ageInDays,
      bucket,
      status,
      label: "Done",
      shortLabel: "Done",
      isStale: false,
      isActiveAgingWork: false,
      sortWeight: 0,
    };
  }

  if (status === "not_relevant") {
    return {
      ageInHours,
      ageInDays,
      bucket,
      status,
      label: "Not Relevant",
      shortLabel: "Not Relevant",
      isStale: false,
      isActiveAgingWork: false,
      sortWeight: 0,
    };
  }

  if (status === "snoozed") {
    return {
      ageInHours,
      ageInDays,
      bucket,
      status,
      label: "Snoozed",
      shortLabel: "Snoozed",
      isStale: false,
      isActiveAgingWork: false,
      sortWeight: 0,
    };
  }

  if (status === "waiting_on_customer") {
    return {
      ageInHours,
      ageInDays,
      bucket,
      status,
      label: `Waiting ${formatAgeCompact(ageInHours)}`,
      shortLabel: `Waiting ${formatAgeCompact(ageInHours)}`,
      isStale: bucket === "overdue",
      isActiveAgingWork: false,
      sortWeight: getSortWeight(status, bucket),
    };
  }

  return {
    ageInHours,
    ageInDays,
    bucket,
    status,
    label:
      bucket === "new"
        ? "New"
        : bucket === "aging"
          ? `Aging ${formatAgeCompact(ageInHours)}`
          : bucket === "stale"
            ? `Stale ${formatAgeCompact(ageInHours)}`
            : `Overdue ${formatAgeCompact(ageInHours)}`,
    shortLabel:
      bucket === "new"
        ? "New"
        : bucket === "aging"
          ? "Aging"
          : bucket === "stale"
            ? "Stale"
            : "Overdue",
    isStale: bucket === "stale" || bucket === "overdue",
    isActiveAgingWork: true,
    sortWeight: getSortWeight(status, bucket),
  };
}
