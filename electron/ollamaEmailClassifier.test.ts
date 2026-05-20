import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  buildQwenEmailClassificationPrompt,
  classifyEmailWithOllama,
} = require("./ollamaEmailClassifier.cjs") as {
  buildQwenEmailClassificationPrompt: (input: {
    subject: string;
    from: string;
    body: string;
  }) => string;
  classifyEmailWithOllama: (
    input: { subject: string; from: string; body: string },
    options?: {
      model?: string;
      timeoutMs?: number;
      onDiagnostic?: (diagnostic: {
        level: string;
        event: string;
        metadata: Record<string, unknown>;
      }) => void;
    },
  ) => Promise<{
    category: string;
    actionable: boolean;
    urgency: "low" | "medium" | "high";
    summary: string;
    confidence: number;
    aiSource: "ollama";
  }>;
};

const originalFetch = globalThis.fetch;
const originalActionDeskAiEnabled = process.env.ACTION_DESK_AI_ENABLED;

function mockOllamaClassification(response: {
  category: string;
  actionable: boolean;
  urgency: "low" | "medium" | "high";
  summary: string;
  confidence: number;
}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      response: JSON.stringify(response),
    }),
  });

  vi.stubGlobal("fetch", fetchMock);
  process.env.ACTION_DESK_AI_ENABLED = "true";

  return fetchMock;
}

afterEach(() => {
  vi.restoreAllMocks();

  if (originalFetch === undefined) {
    Reflect.deleteProperty(globalThis, "fetch");
  } else {
    vi.stubGlobal("fetch", originalFetch);
  }

  if (originalActionDeskAiEnabled === undefined) {
    delete process.env.ACTION_DESK_AI_ENABLED;
  } else {
    process.env.ACTION_DESK_AI_ENABLED = originalActionDeskAiEnabled;
  }
});

describe("Ollama email classifier", () => {
  it("uses a dedicated Qwen prompt with assistive-only guardrails", () => {
    const prompt = buildQwenEmailClassificationPrompt({
      subject: "Need shipment update",
      from: "orders@example.com",
      body: "Where is my order ORD-1001?",
    });

    expect(prompt).toContain("Action Desk rules engine remains authoritative");
    expect(prompt).toContain("must not send email");
    expect(prompt).toContain("order/shipment issue");
    expect(prompt).toContain("operational logistics scheduling");
    expect(prompt).toContain("routing coordination");
    expect(prompt).toContain("carrier pickup scheduling");
    expect(prompt).toContain("vendor sales outreach");
    expect(prompt).toContain("internal operational update");
    expect(prompt).toContain("operational report");
    expect(prompt).toContain("spam/phishing");
  });

  it("returns vendor outreach classification from Ollama output", async () => {
    mockOllamaClassification({
      category: "vendor sales outreach",
      actionable: false,
      urgency: "low",
      summary: "Vendor is pitching a device recovery service.",
      confidence: 0.91,
    });

    const result = await classifyEmailWithOllama({
      subject: "are you into numbers?",
      from: "grace@vendor.example",
      body: "Can I show you how we recover devices after offboarding?",
    });

    expect(result).toMatchObject({
      category: "vendor sales outreach",
      actionable: false,
      urgency: "low",
      confidence: 0.91,
      aiSource: "ollama",
    });
  });

  it("returns shipment and order status classification from Ollama output", async () => {
    const fetchMock = mockOllamaClassification({
      category: "order/shipment issue",
      actionable: true,
      urgency: "medium",
      summary: "Customer is asking for current shipment status.",
      confidence: 0.88,
    });

    const result = await classifyEmailWithOllama({
      subject: "Shipment status for ORD-1002",
      from: "customer@example.com",
      body: "Can you send the current shipment status for ORD-1002?",
    });
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as {
      model: string;
      prompt: string;
      stream: boolean;
    };

    expect(result.category).toBe("order/shipment issue");
    expect(result.actionable).toBe(true);
    expect(requestBody.model).toBe("qwen2.5:3b");
    expect(requestBody.prompt).toContain("Shipment status for ORD-1002");
    expect(requestBody.stream).toBe(false);
  });

  it("returns internal email classification from Ollama output", async () => {
    mockOllamaClassification({
      category: "internal operational update",
      actionable: false,
      urgency: "low",
      summary: "Internal team shared an EOD status report.",
      confidence: 0.83,
    });

    const result = await classifyEmailWithOllama({
      subject: "EQISMART - EOD 05-19-26",
      from: "ops@apexpress.com",
      body: "All orders are on track. Tracking numbers are in Excel.",
    });

    expect(result.category).toBe("internal operational update");
    expect(result.actionable).toBe(false);
  });

  it("returns operational logistics scheduling classification from Ollama output", async () => {
    mockOllamaClassification({
      category: "operational_logistics_scheduling",
      actionable: false,
      urgency: "medium",
      summary: "Scheduled MPU load includes pickup timing and routing details.",
      confidence: 0.89,
    });

    const result = await classifyEmailWithOllama({
      subject: "MPU LOAD 93215119 - SCHEDULING",
      from: "WROCREG1CS@walmart.com",
      body: "Scheduled load for Multi Pick Up with carrier pickup date, pickup number, routing status, and TONU / OTIF charges may apply.",
    });

    expect(result).toMatchObject({
      category: "operational logistics scheduling",
      actionable: false,
      urgency: "medium",
      confidence: 0.89,
      aiSource: "ollama",
    });
  });

  it("emits Ollama diagnostics for calls, status, and parsed output", async () => {
    mockOllamaClassification({
      category: "vendor sales outreach",
      actionable: false,
      urgency: "low",
      summary: "Vendor is asking for a quick sales call.",
      confidence: 0.9,
    });
    const diagnostics: Array<{
      level: string;
      event: string;
      metadata: Record<string, unknown>;
    }> = [];

    await classifyEmailWithOllama(
      {
        subject: "RE: AP Express Logistics priorities",
        from: "casey@duagon.example",
        body: "Technical Sales Manager asking if AP Express is open to a quick chat.",
      },
      {
        onDiagnostic: (diagnostic: {
          level: string;
          event: string;
          metadata: Record<string, unknown>;
        }) => diagnostics.push(diagnostic),
      },
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "ollamaClassificationRequestStarted",
          metadata: expect.objectContaining({
            model: "qwen2.5:3b",
          }),
        }),
        expect.objectContaining({
          event: "ollamaClassificationResponseStatus",
          metadata: expect.objectContaining({
            status: 200,
            ok: true,
          }),
        }),
        expect.objectContaining({
          event: "ollamaClassificationParsed",
          metadata: expect.objectContaining({
            category: "vendor sales outreach",
            actionable: false,
            confidence: 0.9,
          }),
        }),
      ]),
    );
  });

  it("returns spam and phishing classification from Ollama output", async () => {
    mockOllamaClassification({
      category: "spam/phishing",
      actionable: true,
      urgency: "high",
      summary: "Message includes credential phishing language.",
      confidence: 0.94,
    });

    const result = await classifyEmailWithOllama({
      subject: "Verify password now",
      from: "security-alert@example.net",
      body: "Click this link to verify your mailbox credentials immediately.",
    });

    expect(result.category).toBe("spam/phishing");
    expect(result.urgency).toBe("high");
  });
});
