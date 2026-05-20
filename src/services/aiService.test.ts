import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeEmailWithSource } from "./aiService";
import { buildAnalysisInput } from "./analysisInput";
import { classifyEmailWithAi } from "./sharedWorkflowApi";

vi.mock("./sharedWorkflowApi", () => ({
  classifyEmailWithAi: vi.fn(),
}));

const classifyEmailWithAiMock = vi.mocked(classifyEmailWithAi);

describe("analyzeEmailWithSource", () => {
  beforeEach(() => {
    classifyEmailWithAiMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("adds assistive AI classification without replacing rules analysis", async () => {
    classifyEmailWithAiMock.mockResolvedValue({
      category: "order/shipment issue",
      actionable: true,
      urgency: "medium",
      summary: "Customer is asking for shipment status.",
      confidence: 0.86,
      aiSource: "ollama",
    });

    const result = await analyzeEmailWithSource(
      buildAnalysisInput({
        subject: "Shipment status for ORD-1002",
        body: "Can you send the current shipment status for order ORD-1002?",
      }),
      {
        aiInput: {
          subject: "Shipment status for ORD-1002",
          from: "customer@example.com",
          body: "Can you send the current shipment status for order ORD-1002?",
        },
      },
    );

    expect(result.analysis.intent).toBe("where_is_my_order");
    expect(result.analysisSource).toBe("hybrid");
    expect(result.aiClassification).toMatchObject({
      category: "order/shipment issue",
      aiSource: "ollama",
    });
  });

  it("falls back to rules analysis when AI is unavailable", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    classifyEmailWithAiMock.mockRejectedValue(new Error("offline"));

    const result = await analyzeEmailWithSource(
      buildAnalysisInput({
        subject: "FYI",
        body: "FYI only, no action needed.",
      }),
    );

    expect(result.analysisSource).toBe("fallback");
    expect(result.aiClassification).toBeUndefined();
    expect(result.analysis.actionability).toBe("no_action_needed");
    expect(warnSpy).toHaveBeenCalledWith(
      "[Action Desk AI diagnostics]",
      "aiUnavailableFallback",
      expect.objectContaining({
        reason: "ai_route_unavailable",
        message: "offline",
      }),
    );
  });

  it("skips the AI route when assistive classification is disabled", async () => {
    vi.stubEnv("VITE_AI_CLASSIFICATION_ENABLED", "false");

    const result = await analyzeEmailWithSource(
      buildAnalysisInput({
        subject: "Need help",
        body: "Where is my order ORD-1001?",
      }),
    );

    expect(result.analysisSource).toBe("fallback");
    expect(classifyEmailWithAiMock).not.toHaveBeenCalled();
  });
});
