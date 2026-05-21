import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  buildQwenEmailClassificationPrompt,
  buildQwenEmailReplyDraftPrompt,
  classifyEmailWithOllama,
  draftReplyWithOllama,
} = require("./ollamaEmailClassifier.cjs") as {
  buildQwenEmailClassificationPrompt: (input: {
    subject: string;
    from: string;
    body: string;
  }) => string;
  buildQwenEmailReplyDraftPrompt: (input: Record<string, unknown>) => string;
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
  draftReplyWithOllama: (
    input: Record<string, unknown>,
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
    replyDraft: string;
    aiSource: "ollama";
  }>;
};

const originalFetch = globalThis.fetch;
const originalActionDeskAiEnabled = process.env.ACTION_DESK_AI_ENABLED;
const originalActionDeskAiReplyDraftsEnabled =
  process.env.ACTION_DESK_AI_REPLY_DRAFTS_ENABLED;

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

function mockOllamaReplyDraft(replyDraft: string) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      response: JSON.stringify({ replyDraft }),
    }),
  });

  vi.stubGlobal("fetch", fetchMock);
  process.env.ACTION_DESK_AI_ENABLED = "true";
  process.env.ACTION_DESK_AI_REPLY_DRAFTS_ENABLED = "true";

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

  if (originalActionDeskAiReplyDraftsEnabled === undefined) {
    delete process.env.ACTION_DESK_AI_REPLY_DRAFTS_ENABLED;
  } else {
    process.env.ACTION_DESK_AI_REPLY_DRAFTS_ENABLED =
      originalActionDeskAiReplyDraftsEnabled;
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

  it("builds an assistive-only reply drafting prompt with grounding guardrails", () => {
    const prompt = buildQwenEmailReplyDraftPrompt({
      subject: "Where is my order?",
      from: "customer@example.com",
      body: "Where is my order?",
      analysis: {
        intent: "where_is_my_order",
        summary: "Customer is asking for shipment status.",
        nextAction: "Request the order number.",
        actionability: "action_required",
        replyNeeded: "yes",
        workType: "customer_support",
        messageType: "customer_request",
        risks: [],
      },
      recommendedNextAction: "Request the order number.",
    });

    expect(prompt).toContain("must not send email");
    expect(prompt).toContain("create workflow state");
    expect(prompt).toContain("assign tickets");
    expect(prompt).toContain("Do not invent tracking numbers");
    expect(prompt).toContain("If key details are missing, ask for them");
    expect(prompt).toContain("Do not mention AI");
  });

  it("returns a grounded AI reply draft from Ollama output", async () => {
    mockOllamaReplyDraft([
      "Hi,",
      "",
      "I can help check the shipment status, but I need the order number or tracking number first.",
      "Please send that over and I will review the latest available details.",
      "",
      "Best,",
      "Support Team",
    ].join("\n"));

    const result = await draftReplyWithOllama({
      subject: "Where is my order?",
      from: "customer@example.com",
      body: "Where is my order?",
      analysis: {
        intent: "where_is_my_order",
        summary: "Customer is asking for shipment status.",
        nextAction: "Request the order number.",
        actionability: "action_required",
        replyNeeded: "yes",
        workType: "customer_support",
        messageType: "customer_request",
        risks: [],
      },
      recommendedNextAction: "Request the order number.",
    });

    expect(result).toMatchObject({
      aiSource: "ollama",
    });
    expect(result.replyDraft).toContain("need the order number or tracking number");
  });

  it("allows replyNeeded recommended for eligible reply drafting", async () => {
    mockOllamaReplyDraft([
      "Hi,",
      "",
      "I can help review the shipment request. Please send the order number or tracking number so I can confirm the next step.",
      "",
      "Best,",
      "Support Team",
    ].join("\n"));

    const result = await draftReplyWithOllama({
      subject: "Need help",
      from: "customer@example.com",
      body: "Can someone check this shipment?",
      analysis: {
        intent: "where_is_my_order",
        summary: "Customer needs shipment review.",
        nextAction: "Request the order number.",
        actionability: "review_needed",
        replyNeeded: "recommended",
        workType: "customer_support",
        messageType: "customer_request",
        risks: [],
      },
      recommendedNextAction: "Request the order number.",
    });

    expect(result.aiSource).toBe("ollama");
    expect(result.replyDraft).toContain("order number");
  });

  it("allows confirmed shipment status from order context", async () => {
    mockOllamaReplyDraft([
      "Hi,",
      "",
      "Order ORD-1002 is In Transit based on the confirmed order context.",
      "I will review the next update and follow up once confirmed.",
      "",
      "Best,",
      "Support Team",
    ].join("\n"));

    const result = await draftReplyWithOllama({
      subject: "Shipment status for ORD-1002",
      from: "customer@example.com",
      body: "Can you send the current shipment status for order ORD-1002?",
      analysis: {
        intent: "where_is_my_order",
        summary: "Customer is asking for shipment status.",
        nextAction: "Review the latest confirmed shipment context.",
        orderNumber: "ORD-1002",
        actionability: "action_required",
        replyNeeded: "yes",
        workType: "customer_support",
        messageType: "customer_request",
        risks: [],
      },
      orderContext: {
        orderNumber: "ORD-1002",
        status: "Processing",
        shipmentStatus: "In Transit",
        lastUpdated: "2026-04-01T08:00:00.000Z",
      },
      recommendedNextAction: "Review the latest confirmed shipment context.",
    });

    expect(result.replyDraft).toContain("In Transit");
  });

  it("rejects AI reply drafts for vendor or no-action work", async () => {
    mockOllamaReplyDraft("Hi,\n\nThanks.\n\nBest,\nSupport Team");

    await expect(draftReplyWithOllama({
      subject: "Quick chat?",
      from: "vendor@example.com",
      body: "Are you open to a quick chat?",
      analysis: {
        intent: "general_support",
        summary: "Vendor sales outreach.",
        nextAction: "Mark not relevant.",
        actionability: "no_action_needed",
        replyNeeded: "no",
        workType: "vendor",
        messageType: "awareness_only",
        risks: [],
      },
      recommendedNextAction: "Mark not relevant.",
    })).rejects.toMatchObject({
      code: "ai_reply_ineligible",
    });
  });

  it("rejects reply drafts with invented tracking or delivery facts", async () => {
    mockOllamaReplyDraft([
      "Hi,",
      "",
      "Your order will arrive by Friday with tracking number 1Z9999999999999999.",
      "",
      "Best,",
      "Support Team",
    ].join("\n"));

    await expect(draftReplyWithOllama({
      subject: "Where is my order?",
      from: "customer@example.com",
      body: "Where is my order?",
      analysis: {
        intent: "where_is_my_order",
        summary: "Customer is asking for shipment status.",
        nextAction: "Request the order number.",
        actionability: "action_required",
        replyNeeded: "yes",
        workType: "customer_support",
        messageType: "customer_request",
        risks: [],
      },
      recommendedNextAction: "Request the order number.",
    })).rejects.toMatchObject({
      code: "ungrounded_ai_reply",
    });
  });
});
