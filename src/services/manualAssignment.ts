import type {
  AssignmentReason,
  RepProfile,
  WorkflowThread,
} from "../types/actionDesk";

export const TAKE_THREAD_REASON_OPTIONS: AssignmentReason[] = [
  "Covering for colleague",
  "Unassigned",
  "Overflow",
];

export function canCurrentUserTakeThread(
  thread: WorkflowThread,
  currentRep?: RepProfile,
): boolean {
  if (!currentRep) {
    return false;
  }

  return !thread.assignmentResolution.assignedRepIds.includes(currentRep.id);
}

export function getDefaultTakeThreadReason(
  thread: WorkflowThread,
): AssignmentReason {
  return thread.assignmentResolution.assignmentStatus === "unassigned"
    ? "Unassigned"
    : "Covering for colleague";
}
