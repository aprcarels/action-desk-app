import { describe, expect, it } from "vitest";
import {
  addInternalNote,
  clearWorkflowThreadPresence,
  getDefaultWorkflowState,
  logReplyForThread,
  recordThreadPresence,
  setQueueDisplayMode,
  setShowSnoozed,
  setThreadSnooze,
  setThreadWorkflowStatus,
  takeThreadAssignment,
} from "./workflowState";

const defaultState = getDefaultWorkflowState();
const rep = defaultState.reps[0];

describe("workflowState", () => {
  it("logs manual take overrides", () => {
    const nextState = takeThreadAssignment(
      defaultState,
      "thread-1",
      rep,
      "Overflow",
      rep.id,
    );

    expect(nextState.threadStates["thread-1"]).toMatchObject({
      manualAssignment: {
        assignedRepId: rep.id,
        assignedRepName: rep.name,
        reason: "Overflow",
        assignedByRepId: rep.id,
      },
      status: "in_progress",
      updatedByRepId: rep.id,
      updatedByRepName: rep.name,
    });
    expect(nextState.threadStates["thread-1"]?.assignmentHistory).toHaveLength(1);
    expect(
      nextState.threadStates["thread-1"]?.assignmentHistory[0]?.assignedAt,
    ).toBeTruthy();
  });

  it("moves status to waiting_on_customer when a reply is logged", () => {
    const nextState = logReplyForThread(defaultState, "thread-1", rep);

    expect(nextState.threadStates["thread-1"]).toMatchObject({
      status: "waiting_on_customer",
    });
    expect(nextState.threadStates["thread-1"]?.replyLog).toHaveLength(1);
  });

  it("stores internal notes by thread", () => {
    const nextState = addInternalNote(defaultState, "thread-1", rep, "Need to check with warehouse");

    expect(nextState.threadStates["thread-1"]?.notes[0]).toMatchObject({
      authorRepId: rep.id,
      authorName: rep.name,
      body: "Need to check with warehouse",
    });
    expect(nextState.threadStates["thread-1"]?.updatedByRepId).toBe(rep.id);
    expect(nextState.threadStates["thread-1"]?.updatedByRepName).toBe(rep.name);
  });

  it("clears snooze when a thread is resolved", () => {
    const snoozedState = setThreadSnooze(
      defaultState,
      "thread-1",
      rep,
      "2026-04-22T12:00:00.000Z",
    );
    const resolvedState = setThreadWorkflowStatus(
      snoozedState,
      "thread-1",
      "resolved",
    );

    expect(resolvedState.threadStates["thread-1"]?.snooze).toBeUndefined();
    expect(resolvedState.threadStates["thread-1"]?.status).toBe("resolved");
  });

  it("persists show snoozed as a workflow preference", () => {
    const nextState = setShowSnoozed(defaultState, true);

    expect(nextState.preferences.showSnoozed).toBe(true);
  });

  it("persists queue display mode as a workflow preference", () => {
    const nextState = setQueueDisplayMode(defaultState, "grouped_by_rep");

    expect(nextState.preferences.queueDisplayMode).toBe("grouped_by_rep");
  });

  it("records, upgrades, and clears thread presence for a user", () => {
    const viewingState = recordThreadPresence(
      defaultState,
      "thread-1",
      rep,
      "viewing",
      "2026-04-21T12:00:00.000Z",
    );
    const workingState = recordThreadPresence(
      viewingState,
      "thread-1",
      rep,
      "working",
      "2026-04-21T12:01:00.000Z",
    );

    expect(workingState.threadPresence["thread-1"]).toHaveLength(1);
    expect(workingState.threadPresence["thread-1"]?.[0]).toMatchObject({
      activeUserId: rep.id,
      presenceType: "working",
      updatedAt: "2026-04-21T12:01:00.000Z",
    });
    expect(
      clearWorkflowThreadPresence(workingState, rep.id, "thread-1").threadPresence[
        "thread-1"
      ],
    ).toBeUndefined();
  });
});
