import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WorkflowToolbar } from "./WorkflowToolbar";

describe("WorkflowToolbar", () => {
  it("shows the grouped-by-rep toggle only for supervisor/admin visibility", () => {
    const repMarkup = renderToStaticMarkup(
      createElement(WorkflowToolbar, {
        currentRepRole: "rep",
        queueScopeView: "my_queue",
        queueDisplayMode: "list",
        canUseGroupedRepView: false,
        statusFilter: "open",
        showSnoozed: false,
        onQueueScopeViewChange: vi.fn(),
        onQueueDisplayModeChange: vi.fn(),
        onStatusFilterChange: vi.fn(),
        onShowSnoozedChange: vi.fn(),
      }),
    );
    const supervisorMarkup = renderToStaticMarkup(
      createElement(WorkflowToolbar, {
        currentRepRole: "supervisor",
        queueScopeView: "all_emails",
        queueDisplayMode: "grouped_by_rep",
        canUseGroupedRepView: true,
        statusFilter: "open",
        showSnoozed: false,
        onQueueScopeViewChange: vi.fn(),
        onQueueDisplayModeChange: vi.fn(),
        onStatusFilterChange: vi.fn(),
        onShowSnoozedChange: vi.fn(),
      }),
    );
    const adminMarkup = renderToStaticMarkup(
      createElement(WorkflowToolbar, {
        currentRepRole: "admin",
        queueScopeView: "all_emails",
        queueDisplayMode: "list",
        canUseGroupedRepView: true,
        statusFilter: "open",
        showSnoozed: false,
        onQueueScopeViewChange: vi.fn(),
        onQueueDisplayModeChange: vi.fn(),
        onStatusFilterChange: vi.fn(),
        onShowSnoozedChange: vi.fn(),
      }),
    );

    expect(repMarkup).not.toContain("Grouped by Rep");
    expect(supervisorMarkup).toContain("Grouped by Rep");
    expect(supervisorMarkup).toContain("View");
    expect(adminMarkup).toContain("Grouped by Rep");
  });
});
