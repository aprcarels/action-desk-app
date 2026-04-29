import { describe, expect, it } from "vitest";
import { getEffectiveAssignment } from "./assignmentLogic";
import type {
  ProcessedEmail,
  RepProfile,
  SavedCustomer,
  ThreadWorkflowState,
} from "../types/actionDesk";

const reps: RepProfile[] = [
  { id: "rep-1", name: "Mia Johnson", initials: "MJ", email: "mia@example.com", role: "rep" },
  { id: "rep-2", name: "Alex Rivera", initials: "AR", email: "alex@example.com", role: "rep" },
];

function buildProcessedEmail(overrides?: Partial<ProcessedEmail>): ProcessedEmail {
  return {
    email: {
      id: "email-1",
      senderName: "Acme",
      senderEmail: "orders@acme.com",
      subject: "Need update",
      receivedAt: "2026-04-21T12:00:00.000Z",
      body: "Need help",
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
    previewText: "Need help",
    ...overrides,
  };
}

describe("getEffectiveAssignment", () => {
  it("auto-assigns a matched customer to its owner rep", () => {
    const item = buildProcessedEmail({
      customerMatch: {
        customerId: "customer-1",
        customerName: "Acme",
        matchedOn: "sender_email",
        matchedValue: "orders@acme.com",
        ownerRepId: "rep-1",
      },
    });
    const customers: SavedCustomer[] = [
      {
        id: "customer-1",
        name: "Acme",
        emails: ["orders@acme.com"],
        domains: ["acme.com"],
        ownerRepId: "rep-1",
      },
    ];

    expect(getEffectiveAssignment(undefined, item, customers, reps)).toMatchObject({
      type: "auto",
      assignedRepId: "rep-1",
      assignedRepName: "Mia Johnson",
    });
  });

  it("lets manual assignment override auto-assignment", () => {
    const item = buildProcessedEmail({
      customerMatch: {
        customerId: "customer-1",
        customerName: "Acme",
        matchedOn: "sender_email",
        matchedValue: "orders@acme.com",
        ownerRepId: "rep-1",
      },
    });
    const customers: SavedCustomer[] = [
      {
        id: "customer-1",
        name: "Acme",
        emails: ["orders@acme.com"],
        domains: ["acme.com"],
        ownerRepId: "rep-1",
      },
    ];
    const threadState: ThreadWorkflowState = {
      manualAssignment: {
        type: "manual",
        assignedRepId: "rep-2",
        assignedRepName: "Alex Rivera",
        assignedAt: "2026-04-21T12:15:00.000Z",
        reason: "Overflow",
      },
      assignmentHistory: [],
      notes: [],
      replyLog: [],
    };

    expect(getEffectiveAssignment(threadState, item, customers, reps)).toMatchObject({
      type: "manual",
      assignedRepId: "rep-2",
      assignedRepName: "Alex Rivera",
    });
  });

  it("auto-assigns a domain-matched customer to its owner rep", () => {
    const item = buildProcessedEmail({
      customerMatch: {
        customerId: "customer-1",
        customerName: "Acme",
        matchedOn: "sender_domain",
        matchedValue: "acme.com",
        ownerRepId: "rep-1",
      },
    });
    const customers: SavedCustomer[] = [
      {
        id: "customer-1",
        name: "Acme",
        emails: [],
        domains: ["acme.com"],
        ownerRepId: "rep-1",
      },
    ];

    expect(getEffectiveAssignment(undefined, item, customers, reps)).toMatchObject({
      type: "auto",
      assignedRepId: "rep-1",
      assignedRepName: "Mia Johnson",
    });
  });
});
