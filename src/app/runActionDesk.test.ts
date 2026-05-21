import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runActionDesk } from "./runActionDesk";
import { buildAnalysisInput } from "../services/analysisInput";
import { classifyEmailWithAi, draftReplyWithAi } from "../services/sharedWorkflowApi";

vi.mock("../services/sharedWorkflowApi", () => ({
  classifyEmailWithAi: vi.fn(),
  draftReplyWithAi: vi.fn(),
}));

const classifyEmailWithAiMock = vi.mocked(classifyEmailWithAi);
const draftReplyWithAiMock = vi.mocked(draftReplyWithAi);

describe("runActionDesk AI reply drafting", () => {
  beforeEach(() => {
    classifyEmailWithAiMock.mockReset();
    draftReplyWithAiMock.mockReset();
    classifyEmailWithAiMock.mockRejectedValue(new Error("classification offline"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("uses an AI-assisted reply for WIMO when the customer did not provide an order number", async () => {
    draftReplyWithAiMock.mockResolvedValue({
      replyDraft: [
        "Hi,",
        "",
        "I can help check the shipment status, but I need the order number or tracking number first.",
        "Please send that over and I will review the latest available details.",
        "",
        "Best,",
        "Support Team",
      ].join("\n"),
      aiSource: "ollama",
    });

    const result = await runActionDesk(
      buildAnalysisInput({
        subject: "Where is my order?",
        body: "Hi, where is my order? Can you send an update?",
      }),
      {
        aiInput: {
          subject: "Where is my order?",
          from: "customer@example.com",
          body: "Hi, where is my order? Can you send an update?",
        },
      },
    );

    expect(result.replyDraftSource).toBe("ai");
    expect(result.replyDraft).toContain("need the order number or tracking number");
    expect(draftReplyWithAiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Where is my order?",
        from: "customer@example.com",
        analysis: expect.objectContaining({
          intent: "where_is_my_order",
          replyNeeded: "yes",
          workType: "customer_support",
        }),
      }),
    );
  });

  it("uses an AI-assisted reply for a delayed shipment when order context is available", async () => {
    draftReplyWithAiMock.mockResolvedValue({
      replyDraft: [
        "Hi,",
        "",
        "I see order ORD-1002 in the available order context and will review the current shipment details before sending the next update.",
        "I will follow up once the latest carrier or warehouse detail is confirmed.",
        "",
        "Best,",
        "Support Team",
      ].join("\n"),
      aiSource: "ollama",
    });

    const result = await runActionDesk(
      buildAnalysisInput({
        subject: "Delayed shipment for ORD-1002",
        body: "Hi support, order ORD-1002 is delayed and the tracking has not moved. Can you send an updated ETA?",
      }),
      {
        aiInput: {
          subject: "Delayed shipment for ORD-1002",
          from: "customer@example.com",
          body: "Hi support, order ORD-1002 is delayed and the tracking has not moved. Can you send an updated ETA?",
        },
      },
    );

    expect(result.orderContext).toMatchObject({
      orderNumber: "ORD-1002",
    });
    expect(result.replyDraftSource).toBe("ai");
    expect(result.replyDraft).toContain("ORD-1002");
  });

  it("does not request AI replies for vendor outreach", async () => {
    const result = await runActionDesk(
      buildAnalysisInput({
        subject: "RE: AP Express Logistics priorities",
        body: [
          "Duagon builds made in America hardware for railroad environments.",
          "I am a Technical Sales Manager and wanted to see if AP Express is open to a quick chat.",
        ].join("\n"),
      }),
    );

    expect(result.analysis.workType).toBe("vendor");
    expect(result.replyDraft).toBe("");
    expect(result.replyDraftSource).toBe("rules");
    expect(draftReplyWithAiMock).not.toHaveBeenCalled();
  });

  it("does not request AI replies for internal operational reports", async () => {
    const result = await runActionDesk(
      buildAnalysisInput({
        subject: "EQISMART - EOD 05-19-26",
        body: [
          "All orders are on track.",
          "Tracking numbers are in Excel.",
          "Some orders are rolling over to process tomorrow.",
        ].join("\n"),
      }),
      {
        aiInput: {
          subject: "EQISMART - EOD 05-19-26",
          from: "hsalas@apexpress.com",
          body: "All orders are on track. Tracking numbers are in Excel.",
        },
      },
    );

    expect(result.analysis.workType).toBe("internal");
    expect(result.replyDraft).toBe("");
    expect(result.replyDraftSource).toBe("rules");
    expect(draftReplyWithAiMock).not.toHaveBeenCalled();
  });

  it("falls back to the rules-based template when Ollama is unavailable", async () => {
    draftReplyWithAiMock.mockRejectedValue(new Error("ollama offline"));

    const result = await runActionDesk(
      buildAnalysisInput({
        subject: "Where is my order?",
        body: "Hi, where is my order? Can you send an update?",
      }),
    );

    expect(result.replyDraftSource).toBe("rules");
    expect(result.replyDraft).toContain("I need the order number or tracking number");
  });

  it("rejects AI drafts that invent tracking or delivery facts and keeps the rules fallback", async () => {
    draftReplyWithAiMock.mockResolvedValue({
      replyDraft: [
        "Hi,",
        "",
        "Your order will arrive by Friday with tracking number 1Z9999999999999999.",
        "",
        "Best,",
        "Support Team",
      ].join("\n"),
      aiSource: "ollama",
    });

    const result = await runActionDesk(
      buildAnalysisInput({
        subject: "Where is my order?",
        body: "Hi, where is my order? Can you send an update?",
      }),
    );

    expect(result.replyDraftSource).toBe("rules");
    expect(result.replyDraft).not.toContain("1Z9999999999999999");
    expect(result.replyDraft).not.toContain("will arrive by Friday");
    expect(result.replyDraft).toContain("I need the order number or tracking number");
  });
});
