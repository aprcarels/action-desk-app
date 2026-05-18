import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DetailActionBar } from "./DetailActionBar";
import { buildWorkflowThreads } from "../services/workflowSelectors";
import { getDefaultWorkflowState } from "../services/workflowState";
import type { ProcessedEmail, SavedCustomer } from "../types/actionDesk";

function buildProcessedEmail(): ProcessedEmail {
  return {
    email: {
      id: "email-1",
      senderName: "Acme Billing",
      senderEmail: "billing@acme.com",
      subject: "Need invoice help",
      receivedAt: "2026-04-21T11:15:00.000Z",
      body: "Can you help with this invoice?",
    },
    status: "processed",
    result: {
      analysis: {
        summary: "Customer needs invoice help.",
        intent: "general_support",
        urgency: "medium",
        confidence: "medium",
        risks: [],
        nextAction: "Review the invoice request.",
      },
      analysisSource: "fallback",
      replyDraft: "Reply",
      priorityScore: 50,
    },
    issueCount: 0,
    previewText: "Can you help with this invoice?",
  };
}

describe("DetailActionBar assignment display", () => {
  it("shows the assigned CSR when a thread resolves through domain ownership", () => {
    const workflowState = getDefaultWorkflowState();
    const customers: SavedCustomer[] = [
      {
        id: "customer-domain",
        name: "Acme Domain",
        emails: [],
        domains: ["acme.com"],
        ownerRepId: workflowState.reps[0].id,
      },
    ];
    const [thread] = buildWorkflowThreads({
      items: [buildProcessedEmail()],
      workflowState,
      customers,
      now: new Date("2026-04-21T12:00:00.000Z"),
    });

    expect(thread?.assignmentResolution).toMatchObject({
      assignmentStatus: "assigned",
      assignmentSource: "customer_domain",
      primaryRepId: workflowState.reps[0].id,
    });

    const markup = renderToStaticMarkup(
      <DetailActionBar
        thread={thread!}
        currentRep={workflowState.reps[2]}
        assignableReps={workflowState.reps.filter((rep) => rep.role === "rep")}
        macros={[]}
        currentRepAvailable={true}
        hasExactOutlookLink={true}
        canTakeThread={true}
        takeThreadReason="Covering for colleague"
        onTakeThreadReasonChange={vi.fn()}
        onOpenInOutlook={vi.fn()}
        onThreadStatusChange={vi.fn()}
        onAssignThread={vi.fn()}
        onApplyMacro={vi.fn()}
        onLogReply={vi.fn()}
        onJumpToNotes={vi.fn()}
        onSnooze={vi.fn()}
        onUnsnooze={vi.fn()}
        onTakeThread={vi.fn()}
      />,
    );

    expect(markup).toContain("Mia Johnson");
    expect(markup).not.toContain('<option value="">Unassigned</option>');
  });
});
