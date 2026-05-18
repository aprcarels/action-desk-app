import { describe, expect, it } from "vitest";
import { syncAutoAssignmentsToWorkflowState } from "./autoAssignmentSync";
import { getDefaultWorkflowState, takeThreadAssignment } from "./workflowState";
import type {
  AssignmentResolution,
  ProcessedEmail,
  WorkflowThread,
} from "../types/actionDesk";

function buildProcessedEmail(): ProcessedEmail {
  return {
    email: {
      id: "email-1",
      senderName: "Acme",
      senderEmail: "orders@acme.com",
      subject: "Need update",
      receivedAt: "2026-04-21T12:00:00.000Z",
      body: "Where is my order?",
    },
    status: "processed",
    result: {
      analysis: {
        summary: "Summary",
        intent: "where_is_my_order",
        urgency: "medium",
        confidence: "medium",
        risks: [],
        nextAction: "Help",
      },
      analysisSource: "fallback",
      replyDraft: "Reply",
      priorityScore: 60,
    },
    issueCount: 0,
    previewText: "Need update",
  };
}

function buildThread(overrides?: Partial<WorkflowThread>): WorkflowThread {
  const item = buildProcessedEmail();
  const assignmentResolution: AssignmentResolution = {
    assignmentStatus: "assigned",
    assignmentSource: "customer_email",
    primaryRepId: "rep-mj",
    primaryRepName: "Mia Johnson",
    assignedRepIds: ["rep-mj"],
    assignedRepNames: ["Mia Johnson"],
    customerId: "customer-1",
    customerName: "Acme",
    matchType: "email",
  };

  return {
    id: "customer:customer-1",
    groupKey: "customer:customer-1",
    title: "Acme",
    subtitle: "orders@acme.com",
    items: [item],
    representativeItem: item,
    latestReceivedAt: "2026-04-21T12:00:00.000Z",
    oldestReceivedAt: "2026-04-21T12:00:00.000Z",
    latestActivityAt: "2026-04-21T12:00:00.000Z",
    itemCount: 1,
    locationId: "apexpress_irwindale",
    assignedRepId: "rep-mj",
    assignedRepName: "Mia Johnson",
    assignmentType: "auto",
    assignmentResolution,
    currentAssignment: {
      type: "auto",
      assignedRepId: "rep-mj",
      assignedRepName: "Mia Johnson",
      assignedAt: "2026-04-21T12:00:00.000Z",
    },
    assignmentHistory: [],
    status: "new",
    notes: [],
    replyLog: [],
    isSnoozed: false,
    noteCount: 0,
    replyCount: 0,
    activePresenceRecords: [],
    slaMinutes: 0,
    firstReplyAt: undefined,
    sla: {
      firstResponse: {
        target: "first_response",
        state: "on_track",
        elapsedMinutes: 0,
        targetMinutes: 60,
        warningStartsAtMinutes: 45,
        dueAt: "2026-04-21T13:00:00.000Z",
      },
      resolution: {
        target: "resolution",
        state: "on_track",
        elapsedMinutes: 0,
        targetMinutes: 1440,
        warningStartsAtMinutes: 1080,
        dueAt: "2026-04-22T12:00:00.000Z",
      },
      current: {
        target: "first_response",
        state: "on_track",
        elapsedMinutes: 0,
        targetMinutes: 60,
        warningStartsAtMinutes: 45,
        dueAt: "2026-04-21T13:00:00.000Z",
      },
    },
    ...overrides,
  };
}

describe("syncAutoAssignmentsToWorkflowState", () => {
  it("persists auto assignment from matched customer routing", () => {
    const result = syncAutoAssignmentsToWorkflowState(getDefaultWorkflowState(), [
      buildThread(),
    ]);

    expect(result.updates).toHaveLength(1);
    expect(result.workflowState.threadStates["customer:customer-1"]).toMatchObject({
      autoAssignment: {
        type: "auto",
        assignedRepId: "rep-mj",
        assignedRepName: "Mia Johnson",
      },
      locationId: "apexpress_irwindale",
    });
  });

  it("does not overwrite manual take assignments", () => {
    const manuallyAssignedState = takeThreadAssignment(
      getDefaultWorkflowState(),
      "customer:customer-1",
      getDefaultWorkflowState().reps[1],
      "Overflow",
      getDefaultWorkflowState().reps[1].id,
    );

    const result = syncAutoAssignmentsToWorkflowState(manuallyAssignedState, [
      buildThread(),
    ]);

    expect(result.updates).toHaveLength(0);
    expect(result.workflowState.threadStates["customer:customer-1"]).toMatchObject({
      manualAssignment: {
        assignedRepId: getDefaultWorkflowState().reps[1].id,
      },
    });
  });

  it("clears stale auto assignment when customer routing is removed", () => {
    const stateWithAutoAssignment = {
      ...getDefaultWorkflowState(),
      threadStates: {
        "customer:customer-1": {
          autoAssignment: {
            type: "auto" as const,
            assignedRepId: "rep-mj",
            assignedRepName: "Mia Johnson",
            assignedAt: "2026-04-21T12:00:00.000Z",
          },
          assignmentHistory: [],
          notes: [],
          replyLog: [],
        },
      },
    };
    const result = syncAutoAssignmentsToWorkflowState(stateWithAutoAssignment, [
      buildThread({
        assignedRepId: undefined,
        assignedRepName: undefined,
        assignmentType: undefined,
        assignmentResolution: {
          assignmentStatus: "unassigned",
          assignmentSource: "none",
          assignedRepIds: [],
          assignedRepNames: [],
          customerId: "customer-1",
          customerName: "Acme",
          matchType: "email",
        },
        currentAssignment: undefined,
      }),
    ]);

    expect(result.updates).toHaveLength(1);
    expect(
      result.workflowState.threadStates["customer:customer-1"]?.autoAssignment,
    ).toBeUndefined();
  });
});
