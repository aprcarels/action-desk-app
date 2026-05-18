import { describe, expect, it } from "vitest";
import {
  buildWorkflowThreads,
  applySupervisorQuickFilter,
  calculateWorkflowMetrics,
  calculateRepWorkloadSummaries,
  calculateSupervisorSummaryMetrics,
  canViewSupervisorVisibility,
  flattenRepGroupedQueueSections,
  filterWorkflowThreads,
  groupWorkflowThreadsByAssignedRep,
  getWorkflowThreadNavigation,
  getAvailableQueueScopeViews,
  getWorkloadVisibleReps,
  getVisibleWorkflowThreads,
  sanitizeQueueScopeView,
} from "./workflowSelectors";
import { getPresenceConflictWarning } from "./threadPresence";
import {
  getDefaultWorkflowState,
  recordThreadPresence,
  logReplyForThread,
  setThreadSnooze,
  setThreadWorkflowStatus,
  takeThreadAssignment,
} from "./workflowState";
import type { ProcessedEmail, SavedCustomer } from "../types/actionDesk";

function buildProcessedEmail(overrides?: Partial<ProcessedEmail>): ProcessedEmail {
  return {
    email: {
      id: "email-1",
      senderName: "Acme Logistics",
      senderEmail: "orders@acme.com",
      subject: "Need update",
      receivedAt: "2026-04-21T08:00:00.000Z",
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
        nextAction: "Check status",
      },
      analysisSource: "fallback",
      replyDraft: "Reply",
      priorityScore: 60,
    },
    issueCount: 0,
    previewText: "Where is my order?",
    ...overrides,
  };
}

describe("workflowSelectors", () => {
  const baseState = getDefaultWorkflowState();
  const reps = baseState.reps;
  const now = new Date("2026-04-21T12:00:00.000Z");
  const customers: SavedCustomer[] = [
    {
      id: "customer-1",
      name: "Acme",
      emails: ["orders@acme.com"],
      domains: ["acme.com"],
      ownerRepId: reps[0].id,
    },
  ];

  it("groups multiple emails from the same customer into one thread", () => {
    const threads = buildWorkflowThreads({
      items: [
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-1",
            receivedAt: "2026-04-21T08:00:00.000Z",
          },
          customerMatch: {
            customerId: "customer-1",
            customerName: "Acme",
            matchedOn: "email",
            matchedValue: "orders@acme.com",
            ownerRepId: reps[0].id,
          },
        }),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-2",
            receivedAt: "2026-04-21T10:00:00.000Z",
            subject: "Still waiting",
          },
          customerMatch: {
            customerId: "customer-1",
            customerName: "Acme",
            matchedOn: "email",
            matchedValue: "orders@acme.com",
            ownerRepId: reps[0].id,
          },
        }),
      ],
      workflowState: baseState,
      customers,
      now,
    });

    expect(threads).toHaveLength(1);
    expect(threads[0]?.itemCount).toBe(2);
  });

  it("matches undecorated feed items against customer settings before rendering", () => {
    const [thread] = buildWorkflowThreads({
      items: [buildProcessedEmail()],
      workflowState: baseState,
      customers,
      now,
    });

    expect(thread).toMatchObject({
      id: "customer:customer-1",
      assignedRepId: reps[0].id,
      assignedRepName: reps[0].name,
      customerAssignedRepNames: [reps[0].name],
      assignmentResolution: {
        assignmentStatus: "assigned",
        assignmentSource: "customer_domain",
        primaryRepId: reps[0].id,
        primaryRepName: reps[0].name,
        assignedRepIds: [reps[0].id],
        matchType: "domain",
      },
    });
    expect(thread?.representativeItem.customerMatch).toMatchObject({
      customerId: "customer-1",
      matchedOn: "domain",
    });
  });

  it("keeps primary and additional customer CSRs available for card display", () => {
    const multiOwnerCustomers: SavedCustomer[] = [
      {
        ...customers[0],
        ownerRepId: reps[0].id,
        ownerRepIds: [reps[0].id, reps[1].id],
        assignedCSRs: [
          {
            repId: reps[0].id,
            assignmentRole: "primary",
            isActive: true,
          },
          {
            repId: reps[1].id,
            assignmentRole: "secondary",
            isActive: true,
          },
        ],
      },
    ];
    const [thread] = buildWorkflowThreads({
      items: [buildProcessedEmail()],
      workflowState: baseState,
      customers: multiOwnerCustomers,
      now,
    });

    expect(thread).toMatchObject({
      assignedRepId: reps[0].id,
      assignedRepName: reps[0].name,
      customerAssignedRepIds: [reps[0].id, reps[1].id],
      customerAssignedRepNames: [reps[0].name, reps[1].name],
    });
  });

  it("keeps assigned customer work out of the supervisor unassigned filter", () => {
    const threads = buildWorkflowThreads({
      items: [buildProcessedEmail()],
      workflowState: baseState,
      customers,
      now,
    });
    const unassignedThreads = applySupervisorQuickFilter({
      threads,
      quickFilter: "unassigned",
      now,
    });

    expect(threads[0]?.assignedRepId).toBe(reps[0].id);
    expect(threads[0]?.assignmentResolution.assignmentStatus).toBe("assigned");
    expect(unassignedThreads).toEqual([]);
  });

  it("keeps domain-owned customer work out of the unassigned queue", () => {
    const [thread] = buildWorkflowThreads({
      items: [
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            senderName: "Acme Billing",
            senderEmail: "billing@acme.com",
          },
        }),
      ],
      workflowState: baseState,
      customers: [
        {
          id: "customer-domain",
          name: "Acme Domain",
          emails: [],
          domains: ["acme.com"],
          ownerRepId: reps[0].id,
        },
      ],
      now,
    });

    const unassignedThreads = filterWorkflowThreads({
      threads: thread ? [thread] : [],
      currentRep: reps[2],
      queueScopeView: "unassigned",
      statusFilter: "open",
      searchQuery: "",
    });

    expect(thread).toMatchObject({
      assignedRepId: reps[0].id,
      assignmentResolution: {
        assignmentStatus: "assigned",
        assignmentSource: "customer_domain",
        primaryRepId: reps[0].id,
        matchType: "domain",
      },
    });
    expect(unassignedThreads).toEqual([]);
  });

  it("assigns customer work matched from body text to the configured CSR", () => {
    const [thread] = buildWorkflowThreads({
      items: [
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-body-match",
            senderName: "Hector Salas",
            senderEmail: "hsalas@apexpress.com",
            subject: "Please review",
            body: "Meliibaby is asking whether ORD-1001 has shipped.",
          },
        }),
      ],
      workflowState: baseState,
      customers: [
        {
          id: "customer-meliibaby",
          name: "Meliibaby",
          emails: [],
          domains: [],
          ownerRepId: reps[1].id,
          assignedCSRs: [
            {
              repId: reps[1].id,
              assignmentRole: "primary",
              isActive: true,
            },
          ],
        },
      ],
      now,
    });

    expect(thread).toMatchObject({
      id: "customer:customer-meliibaby",
      assignedRepId: reps[1].id,
      assignmentResolution: {
        assignmentStatus: "assigned",
        assignmentSource: "customer_body",
        primaryRepId: reps[1].id,
        matchType: "body",
      },
    });
    expect(thread?.representativeItem.customerMatch).toMatchObject({
      customerId: "customer-meliibaby",
      matchedOn: "body",
    });
  });

  it("assigns customer work matched from thread text and excludes it from Unassigned", () => {
    const threads = buildWorkflowThreads({
      items: [
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-thread-internal",
            conversationId: "conversation-meliibaby",
            senderName: "Hector Salas",
            senderEmail: "hsalas@apexpress.com",
            subject: "Please review",
            receivedAt: "2026-04-21T10:00:00.000Z",
            body: "Looping in the shared queue for visibility.",
          },
        }),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-thread-customer",
            conversationId: "conversation-meliibaby",
            senderName: "Buyer",
            senderEmail: "buyer@example.com",
            subject: "POD request",
            receivedAt: "2026-04-21T09:00:00.000Z",
            body: "Meliibaby needs the POD for ORD-1001.",
          },
          result: {
            ...buildProcessedEmail().result!,
            priorityScore: 20,
          },
        }),
      ],
      workflowState: baseState,
      customers: [
        {
          id: "customer-meliibaby",
          name: "Meliibaby",
          emails: [],
          domains: [],
          ownerRepId: reps[1].id,
        },
      ],
      now,
    });
    const [thread] = threads;
    const unassignedThreads = applySupervisorQuickFilter({
      threads,
      quickFilter: "unassigned",
      now,
    });

    expect(thread).toMatchObject({
      id: "customer:customer-meliibaby",
      assignedRepId: reps[1].id,
      assignmentResolution: {
        assignmentStatus: "assigned",
        assignmentSource: "customer_thread",
        matchType: "thread",
      },
    });
    expect(thread?.representativeItem.customerMatch).toMatchObject({
      matchedOn: "thread",
    });
    expect(unassignedThreads).toEqual([]);
  });

  it("uses an existing CSR reply in the thread to satisfy first response SLA", () => {
    const [thread] = buildWorkflowThreads({
      items: [
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-customer",
            conversationId: "conversation-replied",
            senderName: "Customer",
            senderEmail: "buyer@example.com",
            subject: "Need update",
            receivedAt: "2026-04-21T08:00:00.000Z",
            body: "Can someone help?",
          },
        }),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-csr-reply",
            conversationId: "conversation-replied",
            senderName: reps[0].name,
            senderEmail: reps[0].email,
            subject: "Re: Need update",
            receivedAt: "2026-04-21T08:30:00.000Z",
            sentAt: "2026-04-21T08:30:00.000Z",
            toRecipients: ["buyer@example.com"],
            body: "I am checking with the warehouse now.",
          },
        }),
      ],
      workflowState: baseState,
      customers: [],
      now,
    });

    expect(thread?.firstReplyAt).toBe("2026-04-21T08:30:00.000Z");
    expect(thread?.firstReplySource).toBe("thread");
    expect(thread?.sla.firstResponse.state).toBe("met");
    expect(thread?.sla.current.target).toBe("resolution");
  });

  it("shows a clear fallback when an assigned CSR id is missing from reps", () => {
    const [thread] = buildWorkflowThreads({
      items: [buildProcessedEmail()],
      workflowState: {
        ...baseState,
        reps: [],
      },
      customers: [
        {
          ...customers[0],
          ownerRepId: "rep-missing",
          ownerRepIds: ["rep-missing"],
          assignedCSRs: [
            {
              repId: "rep-missing",
              assignmentRole: "primary",
              isActive: true,
            },
          ],
        },
      ],
      now,
    });
    const sections = groupWorkflowThreadsByAssignedRep({
      threads: thread ? [thread] : [],
      reps: [],
      now,
    });

    expect(thread).toMatchObject({
      assignedRepId: "rep-missing",
      assignedRepName: "Assigned Rep Missing",
      customerAssignedRepNames: ["Assigned Rep Missing"],
    });
    expect(sections[0]).toMatchObject({
      groupId: "rep-missing",
      repId: "rep-missing",
      repName: "Assigned Rep Missing",
    });
  });

  it("filters my queue by effective assignment", () => {
    const threads = buildWorkflowThreads({
      items: [
        buildProcessedEmail({
          email: { ...buildProcessedEmail().email, id: "email-1" },
          customerMatch: {
            customerId: "customer-1",
            customerName: "Acme",
            matchedOn: "email",
            matchedValue: "orders@acme.com",
            ownerRepId: reps[0].id,
          },
        }),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-2",
            senderName: "Unknown Customer",
            senderEmail: "unknown@example.com",
          },
        }),
      ],
      workflowState: baseState,
      customers,
      now,
    });

    const myQueue = filterWorkflowThreads({
      threads,
      currentRep: reps[0],
      queueScopeView: "my_queue",
      statusFilter: "open",
      searchQuery: "",
    });
    const unassigned = filterWorkflowThreads({
      threads,
      currentRep: reps[0],
      queueScopeView: "unassigned",
      statusFilter: "open",
      searchQuery: "",
    });

    expect(myQueue).toHaveLength(2);
    expect(unassigned).toHaveLength(1);
  });

  it("scopes non-admin users away from other locations", () => {
    const threads = buildWorkflowThreads({
      items: [
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-ap",
            senderEmail: "ap@example.com",
            locationId: "apexpress-1",
          },
        }),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-worldpack",
            senderEmail: "worldpack@example.com",
            locationId: "worldpackusa",
          },
        }),
      ],
      workflowState: baseState,
      customers: [],
      now,
    });

    const visibleForRep = filterWorkflowThreads({
      threads,
      currentRep: reps[0],
      queueScopeView: "unassigned",
      statusFilter: "all",
      searchQuery: "",
    });
    const visibleForAdmin = filterWorkflowThreads({
      threads,
      currentRep: { ...reps[0], role: "admin", locationId: undefined },
      queueScopeView: "all_emails",
      statusFilter: "all",
      searchQuery: "",
    });

    expect(visibleForRep.map((thread) => thread.representativeItem.email.id)).toEqual([
      "email-ap",
    ]);
    expect(visibleForAdmin).toHaveLength(2);
  });

  it("honors allowed locations when a signed-in rep has no primary location", () => {
    const threads = buildWorkflowThreads({
      items: [
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-worldpack",
            senderEmail: "worldpack@example.com",
            locationId: "worldpackusa",
          },
        }),
      ],
      workflowState: baseState,
      customers: [],
      now,
    });

    const visibleForAllowedLocationRep = filterWorkflowThreads({
      threads,
      currentRep: {
        ...reps[0],
        locationId: undefined,
        allowedLocations: ["worldpackusa_las_vegas"],
      },
      queueScopeView: "unassigned",
      statusFilter: "all",
      searchQuery: "",
    });

    expect(visibleForAllowedLocationRep).toHaveLength(1);
  });

  it("lets All Inbox bypass assignment filtering while keeping location scope", () => {
    const assignedToOtherRepState = takeThreadAssignment(
      baseState,
      "sender:other@example.com",
      reps[1],
      "Overflow",
      reps[1].id,
    );
    const threads = buildWorkflowThreads({
      items: [
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            senderEmail: "other@example.com",
          },
        }),
      ],
      workflowState: assignedToOtherRepState,
      customers: [],
      now,
    });

    const scopedMyQueue = filterWorkflowThreads({
      threads,
      currentRep: reps[0],
      queueScopeView: "my_queue",
      statusFilter: "open",
      searchQuery: "",
    });
    const allInbox = filterWorkflowThreads({
      threads,
      currentRep: reps[0],
      queueScopeView: "my_queue",
      statusFilter: "open",
      searchQuery: "",
      bypassAssignmentScope: true,
    });

    expect(scopedMyQueue).toEqual([]);
    expect(allInbox).toHaveLength(1);
  });

  it("limits All Emails scope to supervisors and admins", () => {
    expect(getAvailableQueueScopeViews(reps[0])).toEqual([
      "my_queue",
      "unassigned",
    ]);
    expect(getAvailableQueueScopeViews(reps[2])).toEqual([
      "my_queue",
      "unassigned",
      "all_emails",
    ]);
    expect(getAvailableQueueScopeViews(reps[3])).toEqual([
      "my_queue",
      "unassigned",
      "all_emails",
    ]);
    expect(sanitizeQueueScopeView("all_emails", reps[0])).toBe("my_queue");
    expect(sanitizeQueueScopeView("all_emails", reps[2])).toBe("all_emails");
    expect(sanitizeQueueScopeView("all_emails", reps[3])).toBe("all_emails");
  });

  it("keeps manual override history and assignment data on grouped threads", () => {
    const senderThreadId = "sender:orders@acme.com";
    const stateWithOverride = takeThreadAssignment(
      baseState,
      senderThreadId,
      reps[1],
      "Covering for colleague",
      reps[2].id,
    );
    const threads = buildWorkflowThreads({
      items: [
        buildProcessedEmail({
          customerMatch: {
            customerId: "customer-1",
            customerName: "Acme",
            matchedOn: "email",
            matchedValue: "orders@acme.com",
            ownerRepId: reps[0].id,
          },
        }),
      ],
      workflowState: stateWithOverride,
      customers,
      now,
    });

    expect(threads[0]).toMatchObject({
      id: "customer:customer-1",
      assignmentType: "manual",
      assignedRepId: reps[1].id,
      assignmentResolution: {
        assignmentStatus: "assigned",
        assignmentSource: "manual",
        primaryRepId: reps[1].id,
      },
      currentAssignment: {
        type: "manual",
        reason: "Covering for colleague",
      },
    });
    expect(threads[0]?.assignmentHistory).toHaveLength(1);
  });

  it("keeps manual override state visible in supervisor queue views", () => {
    const stateWithOverride = takeThreadAssignment(
      baseState,
      "sender:orders@acme.com",
      reps[1],
      "Covering for colleague",
      reps[2].id,
    );
    const threads = buildWorkflowThreads({
      items: [buildProcessedEmail()],
      workflowState: stateWithOverride,
      customers,
      now,
    });
    const supervisorView = filterWorkflowThreads({
      threads,
      currentRep: reps[2],
      queueScopeView: "all_emails",
      statusFilter: "open",
      searchQuery: "",
    });

    expect(supervisorView[0]).toMatchObject({
      assignmentType: "manual",
      assignedRepId: reps[1].id,
      currentAssignment: {
        reason: "Covering for colleague",
        assignedByRepId: reps[2].id,
      },
    });
    expect(supervisorView[0]?.assignmentHistory).toHaveLength(1);
  });

  it("separates hidden snoozed work from visible metrics", () => {
    const threadId = "sender:orders@acme.com";
    const stateWithWorkflow = setThreadSnooze(
      logReplyForThread(
        takeThreadAssignment(baseState, threadId, reps[0], "Overflow", reps[0].id),
        threadId,
        reps[0],
      ),
      threadId,
      reps[0],
      "2026-04-21T13:00:00.000Z",
    );
    const withResolved = setThreadWorkflowStatus(
      stateWithWorkflow,
      "sender:resolved@example.com",
      "resolved",
    );
    const threads = buildWorkflowThreads({
      items: [
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-1",
          },
        }),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-2",
            senderEmail: "resolved@example.com",
          },
        }),
      ],
      workflowState: withResolved,
      customers: [],
      now,
    });
    const visibleThreads = getVisibleWorkflowThreads(threads, false);
    const metrics = calculateWorkflowMetrics({
      visibleThreads,
      scopedThreads: threads,
      now,
    });

    expect(threads[0]?.isSnoozed).toBe(true);
    expect(visibleThreads).toHaveLength(1);
    expect(metrics.totalOpen).toBe(0);
    expect(metrics.snoozed).toBe(1);
    expect(metrics.resolvedToday).toBe(1);
  });

  it("attaches active thread presence and ignores expired presence", () => {
    const threadId = "sender:orders@acme.com";
    const stateWithActivePresence = recordThreadPresence(
      baseState,
      threadId,
      reps[1],
      "working",
      "2026-04-21T11:58:00.000Z",
    );
    const activeThreads = buildWorkflowThreads({
      items: [buildProcessedEmail()],
      workflowState: stateWithActivePresence,
      customers,
      now,
    });
    const stateWithExpiredPresence = recordThreadPresence(
      baseState,
      threadId,
      reps[1],
      "working",
      "2026-04-21T11:55:00.000Z",
    );
    const expiredThreads = buildWorkflowThreads({
      items: [buildProcessedEmail()],
      workflowState: stateWithExpiredPresence,
      customers,
      now,
    });

    expect(activeThreads[0]?.activePresence).toMatchObject({
      activeUserName: reps[1].name,
      presenceType: "working",
    });
    expect(activeThreads[0]?.activePresenceRecords).toHaveLength(1);
    expect(expiredThreads[0]?.activePresence).toBeUndefined();
    expect(expiredThreads[0]?.activePresenceRecords).toEqual([]);
  });

  it("creates a conflict warning only for another active worker", () => {
    const activeWorker = recordThreadPresence(
      baseState,
      "sender:orders@acme.com",
      reps[1],
      "working",
      "2026-04-21T11:58:00.000Z",
    ).threadPresence["sender:orders@acme.com"]?.[0];
    const viewer = recordThreadPresence(
      baseState,
      "sender:orders@acme.com",
      reps[1],
      "viewing",
      "2026-04-21T11:58:00.000Z",
    ).threadPresence["sender:orders@acme.com"]?.[0];

    expect(getPresenceConflictWarning(activeWorker)).toBe(
      "Alex Rivera is currently working this thread. Please coordinate before making changes.",
    );
    expect(getPresenceConflictWarning(viewer)).toBeUndefined();
    expect(getPresenceConflictWarning(undefined)).toBeUndefined();
  });

  it("calculates supervisor summary metrics for visible scope", () => {
    const stateWithTwoAssignments = takeThreadAssignment(
      takeThreadAssignment(
        baseState,
        "sender:orders@acme.com",
        reps[0],
        "Overflow",
        reps[2].id,
      ),
      "sender:waiting@example.com",
      reps[1],
      "Overflow",
      reps[2].id,
    );
    const stateWithAssignments = setThreadWorkflowStatus(
      stateWithTwoAssignments,
      "sender:waiting@example.com",
      "waiting_on_customer",
      reps[1],
    );
    const stateWithResolved = {
      ...stateWithAssignments,
      threadStates: {
        ...stateWithAssignments.threadStates,
        "sender:resolved@example.com": {
          assignmentHistory: [],
          notes: [],
          replyLog: [],
          status: "resolved" as const,
          updatedAt: "2026-04-21T11:00:00.000Z",
        },
      },
    };
    const threads = buildWorkflowThreads({
      items: [
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            senderEmail: "orders@acme.com",
            receivedAt: "2026-04-21T07:00:00.000Z",
          },
        }),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-2",
            senderEmail: "waiting@example.com",
            receivedAt: "2026-04-21T10:00:00.000Z",
          },
        }),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-3",
            senderEmail: "unassigned@example.com",
            receivedAt: "2026-04-21T06:30:00.000Z",
          },
        }),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-4",
            senderEmail: "resolved@example.com",
            receivedAt: "2026-04-21T05:00:00.000Z",
          },
        }),
      ],
      workflowState: stateWithResolved,
      customers: [],
      now,
    });
    const visibleThreads = threads.filter((thread) => thread.status !== "resolved");
    const metrics = calculateSupervisorSummaryMetrics({
      visibleThreads,
      scopedThreads: threads,
      statusFilter: "open",
      now,
    });

    expect(metrics).toMatchObject({
      totalOpen: 3,
      unassigned: 1,
      avgWaitMinutes: 250,
      oldestOpenMinutes: 330,
      breached: 3,
      resolvedToday: 1,
    });
  });

  it("calculates rep workload summaries", () => {
    const stateWithAssignments = setThreadWorkflowStatus(
      takeThreadAssignment(
        takeThreadAssignment(
          baseState,
          "sender:orders@acme.com",
          reps[0],
          "Overflow",
          reps[2].id,
        ),
        "sender:waiting@example.com",
        reps[0],
        "Overflow",
        reps[2].id,
      ),
      "sender:waiting@example.com",
      "waiting_on_customer",
      reps[0],
    );
    const stateWithResolved = {
      ...stateWithAssignments,
      threadStates: {
        ...stateWithAssignments.threadStates,
        "sender:resolved@example.com": {
          assignmentHistory: [
            {
              type: "manual" as const,
              assignedRepId: reps[0].id,
              assignedRepName: reps[0].name,
              assignedAt: "2026-04-21T09:00:00.000Z",
            },
          ],
          manualAssignment: {
            type: "manual" as const,
            assignedRepId: reps[0].id,
            assignedRepName: reps[0].name,
            assignedAt: "2026-04-21T09:00:00.000Z",
          },
          notes: [],
          replyLog: [],
          status: "resolved" as const,
          updatedAt: "2026-04-21T11:00:00.000Z",
        },
      },
    };
    const threads = buildWorkflowThreads({
      items: [
        buildProcessedEmail(),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-2",
            senderEmail: "waiting@example.com",
            receivedAt: "2026-04-21T09:00:00.000Z",
          },
        }),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-3",
            senderEmail: "resolved@example.com",
            receivedAt: "2026-04-21T07:00:00.000Z",
          },
        }),
      ],
      workflowState: stateWithResolved,
      customers: [],
      now,
    });
    const workloads = calculateRepWorkloadSummaries({
      threads,
      reps,
      now,
    });

    expect(workloads[0]).toMatchObject({
      repId: reps[0].id,
      openThreadCount: 2,
      waitingOnCustomerCount: 1,
      oldestOpenMinutes: 240,
      resolvedTodayCount: 1,
    });
  });

  it("scopes workload reps by role and stable location id", () => {
    const workloadReps = [
      reps[0],
      reps[1],
      {
        id: "rep-corona",
        name: "Casey Corona",
        initials: "CC",
        email: "casey@example.com",
        role: "rep" as const,
        locationId: "apexpress-2",
        isActive: true,
      },
      {
        id: "rep-irwindale-label",
        name: "Ira Label",
        initials: "IL",
        email: "ira@example.com",
        role: "rep" as const,
        locationId: "Apexpress Irwindale",
        isActive: true,
      },
      {
        id: "rep-inactive",
        name: "Inactive Rep",
        initials: "IR",
        email: "inactive@example.com",
        role: "rep" as const,
        locationId: "apexpress-1",
        isActive: false,
      },
      reps[2],
      reps[3],
    ];

    expect(
      getWorkloadVisibleReps(workloadReps, {
        ...reps[2],
        role: "supervisor",
        locationId: "apexpress-1",
      }).map((rep) => rep.id),
    ).toEqual([reps[0].id, reps[1].id, "rep-irwindale-label"]);

    expect(
      getWorkloadVisibleReps(workloadReps, {
        ...reps[3],
        role: "admin",
        locationId: undefined,
      }).map((rep) => rep.id),
    ).toEqual([reps[0].id, reps[1].id, "rep-corona", "rep-irwindale-label"]);
  });

  it("keeps zero-ticket CSRs in supervisor workload when they are in the scoped location", () => {
    const zeroTicketRep = {
      id: "rep-zero-ticket",
      name: "Zoe Zero",
      initials: "ZZ",
      email: "zoe.zero@example.com",
      role: "rep" as const,
      locationId: "Apexpress Irwindale",
      isActive: true,
    };
    const visibleReps = getWorkloadVisibleReps(
      [reps[0], zeroTicketRep],
      {
        ...reps[2],
        role: "supervisor",
        locationId: "apexpress-1",
      },
    );
    const workloads = calculateRepWorkloadSummaries({
      threads: [],
      reps: visibleReps,
      now,
    });

    expect(visibleReps.map((rep) => rep.id)).toEqual([
      reps[0].id,
      zeroTicketRep.id,
    ]);
    expect(workloads).toEqual([
      expect.objectContaining({
        repId: reps[0].id,
        openThreadCount: 0,
      }),
      expect.objectContaining({
        repId: zeroTicketRep.id,
        openThreadCount: 0,
      }),
    ]);
  });

  it("applies supervisor quick filters for over-SLA and unassigned work", () => {
    const threads = buildWorkflowThreads({
      items: [
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            senderEmail: "old@example.com",
            receivedAt: "2026-04-21T07:00:00.000Z",
          },
        }),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-2",
            senderEmail: "new@example.com",
            receivedAt: "2026-04-21T11:00:00.000Z",
          },
        }),
      ],
      workflowState: baseState,
      customers: [],
      now,
    });

    expect(
      applySupervisorQuickFilter({
        threads,
        quickFilter: "over_sla",
        now,
      }).map((thread) => thread.representativeItem.email.senderEmail),
    ).toEqual(["old@example.com", "new@example.com"]);
    expect(
      applySupervisorQuickFilter({
        threads,
        quickFilter: "unassigned",
        now,
      }).map((thread) => thread.representativeItem.email.senderEmail),
    ).toEqual(["old@example.com", "new@example.com"]);
  });

  it("uses configured SLA settings for the supervisor over-SLA filter", () => {
    const item = buildProcessedEmail({
      email: {
        ...buildProcessedEmail().email,
        senderEmail: "ninety-minutes@example.com",
        receivedAt: "2026-04-21T10:30:00.000Z",
      },
    });
    const relaxedThreads = buildWorkflowThreads({
      items: [item],
      workflowState: baseState,
      customers: [],
      slaSettings: {
        firstResponseSlaMinutes: 120,
        resolutionSlaMinutes: 24 * 60,
        warningThresholdPercent: 75,
        warningMinutesBeforeBreach: 15,
      },
      now,
    });
    const strictThreads = buildWorkflowThreads({
      items: [item],
      workflowState: baseState,
      customers: [],
      slaSettings: {
        firstResponseSlaMinutes: 60,
        resolutionSlaMinutes: 24 * 60,
        warningThresholdPercent: 75,
        warningMinutesBeforeBreach: 15,
      },
      now,
    });

    expect(
      applySupervisorQuickFilter({
        threads: relaxedThreads,
        quickFilter: "over_sla",
        now,
      }),
    ).toHaveLength(0);
    expect(
      applySupervisorQuickFilter({
        threads: strictThreads,
        quickFilter: "over_sla",
        now,
      }).map((thread) => thread.representativeItem.email.senderEmail),
    ).toEqual(["ninety-minutes@example.com"]);
  });

  it("returns previous and next navigation targets from the visible thread list", () => {
    const threads = buildWorkflowThreads({
      items: [
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-1",
            senderEmail: "first@example.com",
          },
        }),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-2",
            senderEmail: "second@example.com",
          },
        }),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-3",
            senderEmail: "third@example.com",
          },
        }),
      ],
      workflowState: baseState,
      customers: [],
      now,
    });

    expect(getWorkflowThreadNavigation(threads, "email-2")).toMatchObject({
      currentIndex: 1,
      total: 3,
      previousEmailId: "email-1",
      nextEmailId: "email-3",
    });
    expect(getWorkflowThreadNavigation(threads, "email-1")).toMatchObject({
      currentIndex: 0,
      total: 3,
      previousEmailId: undefined,
      nextEmailId: "email-2",
    });
    expect(getWorkflowThreadNavigation(threads, "email-3")).toMatchObject({
      currentIndex: 2,
      total: 3,
      previousEmailId: "email-2",
      nextEmailId: undefined,
    });
  });

  it("groups visible threads by assigned rep and includes an unassigned section", () => {
    const stateWithAssignments = takeThreadAssignment(
      takeThreadAssignment(
        baseState,
        "sender:first@example.com",
        reps[0],
        "Overflow",
        reps[2].id,
      ),
      "sender:second@example.com",
      reps[1],
      "Overflow",
      reps[2].id,
    );
    const threads = buildWorkflowThreads({
      items: [
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-1",
            senderEmail: "first@example.com",
            receivedAt: "2026-04-21T06:00:00.000Z",
          },
        }),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-2",
            senderEmail: "second@example.com",
            receivedAt: "2026-04-21T10:00:00.000Z",
          },
        }),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-3",
            senderEmail: "unassigned@example.com",
            receivedAt: "2026-04-21T11:00:00.000Z",
          },
        }),
      ],
      workflowState: stateWithAssignments,
      customers: [],
      now,
    });

    const sections = groupWorkflowThreadsByAssignedRep({
      threads,
      reps,
      now,
    });

    expect(sections.map((section) => section.repName)).toEqual([
      "Unassigned",
      reps[0].name,
      reps[1].name,
    ]);
    expect(sections[0]).toMatchObject({
      repName: "Unassigned",
      openThreadCount: 1,
      waitingOnCustomerCount: 0,
      overSlaCount: 1,
    });
  });

  it("groups supervisor CSR cards from canonical domain ownership", () => {
    const outsideLocationRep = {
      id: "rep-corona",
      name: "Casey Corona",
      initials: "CC",
      email: "casey@example.com",
      role: "rep" as const,
      locationId: "apexpress-2",
      isActive: true,
    };
    const stateWithOutsideRep = {
      ...baseState,
      reps: [...baseState.reps, outsideLocationRep],
    };
    const threads = buildWorkflowThreads({
      items: [
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-ap-domain",
            senderName: "AP Domain",
            senderEmail: "orders@ap-domain.com",
          },
        }),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-corona-domain",
            senderName: "Corona Domain",
            senderEmail: "orders@corona-domain.com",
          },
        }),
      ],
      workflowState: stateWithOutsideRep,
      customers: [
        {
          id: "customer-ap-domain",
          name: "AP Domain",
          emails: [],
          domains: ["ap-domain.com"],
          ownerRepId: reps[0].id,
        },
        {
          id: "customer-corona-domain",
          name: "Corona Domain",
          emails: [],
          domains: ["corona-domain.com"],
          ownerRepId: outsideLocationRep.id,
        },
      ],
      now,
    });

    const sections = groupWorkflowThreadsByAssignedRep({
      threads,
      reps: [reps[0], reps[1]],
      now,
    });

    expect(threads.map((thread) => thread.assignmentResolution.assignmentSource)).toEqual([
      "customer_domain",
      "customer_domain",
    ]);
    expect(sections.map((section) => section.repId)).toEqual([reps[0].id]);
    expect(sections[0]?.threads.map((thread) => thread.id)).toEqual([
      "customer:customer-ap-domain",
    ]);
  });

  it("calculates per-section counts from the filtered visible work", () => {
    const stateWithWorkflow = setThreadWorkflowStatus(
      takeThreadAssignment(
        takeThreadAssignment(
          baseState,
          "sender:first@example.com",
          reps[0],
          "Overflow",
          reps[2].id,
        ),
        "sender:second@example.com",
        reps[0],
        "Overflow",
        reps[2].id,
      ),
      "sender:second@example.com",
      "waiting_on_customer",
      reps[0],
    );
    const threads = buildWorkflowThreads({
      items: [
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-1",
            senderEmail: "first@example.com",
            receivedAt: "2026-04-21T02:00:00.000Z",
          },
        }),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-2",
            senderEmail: "second@example.com",
            receivedAt: "2026-04-21T09:00:00.000Z",
          },
        }),
      ],
      workflowState: stateWithWorkflow,
      customers: [],
      now,
    });

    const [section] = groupWorkflowThreadsByAssignedRep({
      threads,
      reps,
      now,
    });

    expect(section).toMatchObject({
      repName: reps[0].name,
      openThreadCount: 2,
      waitingOnCustomerCount: 1,
      overSlaCount: 2,
    });
    expect(section.oldestOpenMinutes).toBe(600);
  });

  it("applies filters before grouping by rep", () => {
    const stateWithWorkflow = setThreadWorkflowStatus(
      takeThreadAssignment(
        takeThreadAssignment(
          baseState,
          "sender:first@example.com",
          reps[0],
          "Overflow",
          reps[2].id,
        ),
        "sender:second@example.com",
        reps[1],
        "Overflow",
        reps[2].id,
      ),
      "sender:second@example.com",
      "waiting_on_customer",
      reps[1],
    );
    const threads = buildWorkflowThreads({
      items: [
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-1",
            senderEmail: "first@example.com",
          },
        }),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-2",
            senderEmail: "second@example.com",
          },
        }),
      ],
      workflowState: stateWithWorkflow,
      customers: [],
      now,
    });

    const waitingOnly = applySupervisorQuickFilter({
      threads,
      quickFilter: "waiting_on_customer",
      now,
    });
    const sections = groupWorkflowThreadsByAssignedRep({
      threads: waitingOnly,
      reps,
      now,
    });

    expect(sections).toHaveLength(1);
    expect(sections[0]?.repName).toBe(reps[1].name);
    expect(sections[0]?.threads.map((thread) => thread.representativeItem.email.id)).toEqual([
      "email-2",
    ]);
  });

  it("supports navigation through the grouped display order when flattened", () => {
    const stateWithAssignments = takeThreadAssignment(
      takeThreadAssignment(
        baseState,
        "sender:first@example.com",
        reps[0],
        "Overflow",
        reps[2].id,
      ),
      "sender:third@example.com",
      reps[0],
      "Overflow",
      reps[2].id,
    );
    const threads = buildWorkflowThreads({
      items: [
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-1",
            senderEmail: "first@example.com",
            receivedAt: "2026-04-21T08:00:00.000Z",
          },
        }),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-2",
            senderEmail: "second@example.com",
            receivedAt: "2026-04-21T07:00:00.000Z",
          },
        }),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-3",
            senderEmail: "third@example.com",
            receivedAt: "2026-04-21T06:00:00.000Z",
          },
        }),
      ],
      workflowState: stateWithAssignments,
      customers: [],
      now,
    });
    const groupedOrder = flattenRepGroupedQueueSections(
      groupWorkflowThreadsByAssignedRep({
        threads,
        reps,
        now,
      }),
    );

    expect(getWorkflowThreadNavigation(groupedOrder, "email-3")).toMatchObject({
      previousEmailId: "email-2",
      nextEmailId: "email-1",
    });
  });

  it("navigates grouped threads by the current filtered thread list", () => {
    const threads = buildWorkflowThreads({
      items: [
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-1",
            senderEmail: "grouped@example.com",
            receivedAt: "2026-04-21T08:00:00.000Z",
          },
        }),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-2",
            senderEmail: "grouped@example.com",
            receivedAt: "2026-04-21T09:00:00.000Z",
            subject: "Second message",
          },
        }),
        buildProcessedEmail({
          email: {
            ...buildProcessedEmail().email,
            id: "email-3",
            senderEmail: "next@example.com",
          },
        }),
      ],
      workflowState: baseState,
      customers: [],
      now,
    });

    const navigation = getWorkflowThreadNavigation(threads, "email-1");

    expect(navigation).toMatchObject({
      currentIndex: 0,
      total: 2,
      previousEmailId: undefined,
      nextEmailId: "email-3",
    });
  });

  it("keeps supervisor visibility gated to supervisors and admins", () => {
    expect(canViewSupervisorVisibility(reps[0])).toBe(false);
    expect(canViewSupervisorVisibility(reps[2])).toBe(true);
    expect(canViewSupervisorVisibility(reps[3])).toBe(true);
    expect(canViewSupervisorVisibility(null)).toBe(false);
  });
});
