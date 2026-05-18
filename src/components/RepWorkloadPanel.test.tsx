import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RepWorkloadPanel } from "./RepWorkloadPanel";

describe("RepWorkloadPanel", () => {
  it("shows CSR email addresses in workload rows", () => {
    const markup = renderToStaticMarkup(
      <RepWorkloadPanel
        now={new Date("2026-05-01T12:00:00.000Z")}
        defaultCollapsed={false}
        workloads={[
          {
            repId: "rep-1",
            repName: "Mia Johnson",
            repEmail: "mia.johnson@apexpress.com",
            repRole: "rep",
            openThreadCount: 2,
            waitingOnCustomerCount: 1,
            breachedCount: 0,
            oldestOpenMinutes: 45,
            resolvedTodayCount: 3,
          },
        ]}
      />,
    );

    expect(markup).toContain("Mia Johnson");
    expect(markup).toContain("mia.johnson@apexpress.com");
  });
});
