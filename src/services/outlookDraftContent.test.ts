import { describe, expect, it } from "vitest";
import {
  getOutlookReplyDraftText,
  hasOutlookReplyDraftText,
} from "./outlookDraftContent";
import type { ProcessedEmail } from "../types/actionDesk";

function buildProcessedEmail(replyDraft: string): ProcessedEmail {
  return {
    email: {
      id: "email-1",
      senderName: "Casey Jones",
      senderEmail: "casey@example.com",
      subject: "Need a shipment update",
      receivedAt: "2026-04-21T11:15:00.000Z",
      body: "Can you check this shipment?",
    },
    status: "processed",
    result: {
      analysis: {
        summary: "Customer needs a shipment update.",
        intent: "where_is_my_order",
        urgency: "medium",
        confidence: "medium",
        risks: [],
        nextAction: "Check shipment status.",
        replyNeeded: "yes",
        actionability: "action_required",
        workType: "customer_support",
      },
      analysisSource: "ai",
      replyDraft,
      priorityScore: 50,
    },
    issueCount: 0,
    previewText: "Can you check this shipment?",
  };
}

describe("outlookDraftContent", () => {
  it("uses the exact visible Action Desk reply draft text", () => {
    const visibleReplyDraft =
      "Hi Casey,\n\nThis is the live Action Desk generated reply.\nLine two stays on its own line.\n\nBest,\nSupport Team\n";
    const item = buildProcessedEmail(visibleReplyDraft);

    expect(getOutlookReplyDraftText(item)).toBe(visibleReplyDraft);
    expect(hasOutlookReplyDraftText(getOutlookReplyDraftText(item))).toBe(true);
  });

  it("treats whitespace-only drafts as unavailable without changing real content", () => {
    const failedItem: ProcessedEmail = {
      ...buildProcessedEmail("Reply"),
      status: "failed",
      result: undefined,
    };

    expect(hasOutlookReplyDraftText(" \n\t ")).toBe(false);
    expect(getOutlookReplyDraftText(failedItem)).toBe("");
  });
});
