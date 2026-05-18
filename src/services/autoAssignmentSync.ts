import type {
  AssignmentRecord,
  ThreadWorkflowState,
  WorkflowState,
  WorkflowThread,
} from "../types/actionDesk";

type AutoAssignmentSyncUpdate = {
  threadId: string;
  threadState: ThreadWorkflowState;
};

export type AutoAssignmentSyncResult = {
  workflowState: WorkflowState;
  updates: AutoAssignmentSyncUpdate[];
};

function emptyThreadState(): ThreadWorkflowState {
  return {
    assignmentHistory: [],
    notes: [],
    replyLog: [],
  };
}

function getAutoAssignment(thread: WorkflowThread): AssignmentRecord | undefined {
  return thread.currentAssignment?.type === "auto"
    ? thread.currentAssignment
    : undefined;
}

function assignmentsEqual(
  left: AssignmentRecord | undefined,
  right: AssignmentRecord | undefined,
): boolean {
  return (
    left?.type === right?.type &&
    left?.assignedRepId === right?.assignedRepId &&
    left?.assignedRepName === right?.assignedRepName &&
    left?.assignedAt === right?.assignedAt
  );
}

function needsAutoAssignmentUpdate(
  currentState: ThreadWorkflowState | undefined,
  thread: WorkflowThread,
  autoAssignment: AssignmentRecord | undefined,
): boolean {
  if (currentState?.manualAssignment) {
    return false;
  }

  if (!assignmentsEqual(currentState?.autoAssignment, autoAssignment)) {
    return true;
  }

  return Boolean(autoAssignment && thread.locationId && !currentState?.locationId);
}

export function syncAutoAssignmentsToWorkflowState(
  workflowState: WorkflowState,
  threads: WorkflowThread[],
): AutoAssignmentSyncResult {
  let nextThreadStates = workflowState.threadStates;
  const updates: AutoAssignmentSyncUpdate[] = [];
  const updatedAt = new Date().toISOString();

  for (const thread of threads) {
    const currentState = workflowState.threadStates[thread.id];
    const autoAssignment = getAutoAssignment(thread);

    if (!needsAutoAssignmentUpdate(currentState, thread, autoAssignment)) {
      continue;
    }

    const nextThreadState: ThreadWorkflowState = {
      ...(currentState ?? emptyThreadState()),
      autoAssignment,
      locationId: currentState?.locationId ?? thread.locationId,
      updatedAt,
    };

    nextThreadStates = {
      ...nextThreadStates,
      [thread.id]: nextThreadState,
    };
    updates.push({
      threadId: thread.id,
      threadState: nextThreadState,
    });
  }

  if (updates.length === 0) {
    return {
      workflowState,
      updates,
    };
  }

  return {
    workflowState: {
      ...workflowState,
      threadStates: nextThreadStates,
    },
    updates,
  };
}
