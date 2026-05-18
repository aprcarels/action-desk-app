import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EmailDetail } from "./EmailDetail";
import type { ProcessedEmail } from "../types/actionDesk";

function buildFailedItem(overrides?: Partial<ProcessedEmail>): ProcessedEmail {
  return {
    email: {
      id: "email-1",
      senderName: "Customer",
      senderEmail: "customer@example.com",
      subject: "Need help",
      receivedAt: "2026-04-21T11:15:00.000Z",
      body: "",
      previewText: "",
    },
    status: "failed",
    result: undefined,
    processingError: "This email could not be analyzed because the body is missing.",
    issueCount: 0,
    previewText: "",
    ...overrides,
  };
}

function renderDetail(item: ProcessedEmail): string {
  return renderToStaticMarkup(
    <EmailDetail
      item={item}
      reps={[]}
      pilotMode={false}
      hasReplyDraft={false}
      copyFeedback="idle"
      caseCopyFeedback="idle"
      rawCaseCopyFeedback="idle"
      regeneratingReply={false}
      replyActionError={null}
      macros={[]}
      onCopyReply={vi.fn()}
      onCopyCaseForReview={vi.fn()}
      onCopyRawCaseJson={vi.fn()}
      onRegenerateReply={vi.fn()}
      onThreadStatusChange={vi.fn()}
      onAddInternalNote={vi.fn()}
      onLogReply={vi.fn()}
      onSnoozeThread={vi.fn()}
      onUnsnoozeThread={vi.fn()}
      onTakeThread={vi.fn()}
      onAssignThread={vi.fn()}
      onApplyMacro={vi.fn()}
      onRecomputePriority={vi.fn()}
      onMarkPilotItemActive={vi.fn()}
      onMarkPilotItemDone={vi.fn()}
      onMarkPilotItemNotRelevant={vi.fn()}
      onMarkPilotItemWaitingOnCustomer={vi.fn()}
      onSnoozePilotItemUntilTomorrow={vi.fn()}
      onSetPilotUsefulness={vi.fn()}
    />,
  );
}

describe("EmailDetail failed system reports", () => {
  it("renders missing-body system reports as muted informational state", () => {
    const markup = renderDetail(
      buildFailedItem({
        email: {
          ...buildFailedItem().email,
          senderName: "AP Express Systems",
          senderEmail: "systems@apexpress.com",
          subject: "OutboundYesterdayTracking_Summary",
        },
      }),
    );

    expect(markup).toContain("System/report email");
    expect(markup).toContain("No customer-service analysis or reply is needed");
    expect(markup).not.toContain(
      "This email could not be analyzed because the body is missing.",
    );
  });

  it("keeps true customer missing-body failures visible", () => {
    const markup = renderDetail(buildFailedItem());

    expect(markup).toContain(
      "This email could not be analyzed because the body is missing.",
    );
    expect(markup).not.toContain("System/report email");
  });
});
