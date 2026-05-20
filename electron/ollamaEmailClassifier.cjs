const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL = "qwen2.5:3b";
const DEFAULT_OLLAMA_TIMEOUT_MS = 4000;
const CLASSIFICATION_CATEGORIES = [
  "customer support request",
  "order/shipment issue",
  "billing/refund",
  "operational logistics scheduling",
  "routing coordination",
  "carrier pickup scheduling",
  "vendor sales outreach",
  "internal operational update",
  "operational report",
  "internal communication",
  "spam/phishing",
  "no action needed",
];
const URGENCY_VALUES = ["low", "medium", "high"];

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBooleanEnv(value) {
  return String(value || "").trim().toLowerCase();
}

function isAiClassificationEnabled() {
  const value = normalizeBooleanEnv(process.env.ACTION_DESK_AI_ENABLED);
  return value !== "false" && value !== "0" && value !== "off" && value !== "disabled";
}

function getOllamaBaseUrl() {
  return normalizeText(process.env.OLLAMA_BASE_URL) || DEFAULT_OLLAMA_BASE_URL;
}

function getOllamaModel() {
  return normalizeText(process.env.OLLAMA_MODEL) || DEFAULT_OLLAMA_MODEL;
}

function getOllamaTimeoutMs() {
  const parsed = Number.parseInt(String(process.env.OLLAMA_TIMEOUT_MS || ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_OLLAMA_TIMEOUT_MS;
  }

  return parsed;
}

function getOllamaGenerateUrl(baseUrl = getOllamaBaseUrl()) {
  const url = new URL(baseUrl);

  if (url.pathname.endsWith("/api/generate")) {
    return url.toString();
  }

  url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/generate`;
  return url.toString();
}

function getDiagnosticEndpoint(generateUrl) {
  try {
    const url = new URL(generateUrl);

    return `${url.origin}${url.pathname}`;
  } catch {
    return "(invalid Ollama URL)";
  }
}

function emitDiagnostic(options, level, event, metadata = {}) {
  if (typeof options?.onDiagnostic !== "function") {
    return;
  }

  try {
    options.onDiagnostic({
      level,
      event,
      metadata,
    });
  } catch {
    // Diagnostics must never affect classification behavior.
  }
}

function buildQwenEmailClassificationPrompt(input) {
  const subject = normalizeText(input.subject) || "(no subject)";
  const from = normalizeText(input.from) || "(unknown sender)";
  const body = normalizeText(input.body) || "(empty body)";

  return [
    "You are Action Desk's assistive email classification layer for a support queue.",
    "The existing Action Desk rules engine remains authoritative. You only provide additional understanding for a human support rep.",
    "You must not send email, change workflow state, assign tickets, override permissions, or modify database records.",
    "Classify the email into exactly one category from this list:",
    CLASSIFICATION_CATEGORIES.map((category) => `- ${category}`).join("\n"),
    "Return compact JSON only. Do not include markdown, prose, comments, or extra keys.",
    "Required JSON shape:",
    '{"category": string, "actionable": boolean, "urgency": "low" | "medium" | "high", "summary": string, "confidence": number}',
    "Category guidance:",
    '- Use "order/shipment issue" for order status, shipment timing, tracking, POD, delivery, damage, cancellation, address-change, missing-item, duplicate-shipment, or logistics confirmation requests.',
    '- Only use "order/shipment issue" when the sender is asking AP Express support to help with their own customer order, shipment, delivery, tracking, POD, or logistics issue.',
    '- Use "billing/refund" for invoices, charges, credits, refunds, payment, or billing discrepancies. Do not use it just because a logistics notice says TONU/OTIF charges may apply.',
    '- Use "operational logistics scheduling" for scheduled loads, MPU/Multi Pick Up notices, stop times, loading/transit times, CDD, pickup appointments, and emails that say to reply only if the pickup date/time does not work.',
    '- Use "routing coordination" for routing status, routing instructions, pickup routing, or carrier coordination that is operational rather than a customer status request.',
    '- Use "carrier pickup scheduling" for carrier pickup dates, pickup numbers, pickup appointment details, or requests to coordinate alternate pickup timing.',
    '- Use "vendor sales outreach" for cold sales, demos, vendor pitches, account-marketing, subscriptions, vendor portal/account-maintenance messages, hardware pitches, technical sales introductions, or requests for a quick chat/call.',
    '- Use "vendor sales outreach" for pitches about hardware durability, railroad or industrial environments, made-in-America hardware, device recovery, ROI, services, platforms, or solutions.',
    '- Use "internal operational update" for AP Express employee updates, EOD notes, status rollups, orders-on-track updates, Excel tracking reports, rollover-to-tomorrow notes, or internal operations coordination with no customer ask.',
    '- Use "operational report" for daily, EOD, scheduled, automated, Excel, or tracking-number reports that summarize operational status rather than asking for customer-service help.',
    '- Use "internal communication" for internal FYI, operations updates, awareness-only notes, or colleague coordination.',
    '- Use "spam/phishing" for credential requests, suspicious links, scams, malware, impersonation, or security warnings.',
    '- Use "no action needed" for automated notices, out-of-office replies, pure FYI, or explicit no-action messages.',
    '- Use "customer support request" for legitimate customer-support requests that do not fit the more specific order/shipment or billing/refund categories.',
    "Actionable means a support rep likely needs to review or respond. Spam/phishing may be actionable only for internal security review, not customer reply.",
    "Confidence must be a number between 0 and 1.",
    "Keep summary to one short sentence.",
    "",
    "Email:",
    `Subject: ${subject}`,
    `From: ${from}`,
    "Body:",
    body,
  ].join("\n");
}

function createAiError(code, message, statusCode = 503, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.retryable = statusCode >= 500 || code === "ai_timeout";
  error.details = details;
  return error;
}

function validateClassificationRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw createAiError(
      "invalid_ai_request",
      "AI classification request body must be a JSON object.",
      400,
    );
  }

  for (const field of ["subject", "from", "body"]) {
    if (typeof input[field] !== "string") {
      throw createAiError(
        "invalid_ai_request",
        `AI classification field '${field}' must be a string.`,
        400,
      );
    }
  }

  return {
    subject: normalizeText(input.subject),
    from: normalizeText(input.from),
    body: normalizeText(input.body),
  };
}

function extractJsonObject(text) {
  const raw = normalizeText(text);

  if (!raw) {
    return "";
  }

  if (raw.startsWith("{") && raw.endsWith("}")) {
    return raw;
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return raw;
  }

  return raw.slice(start, end + 1);
}

function normalizeCategory(value) {
  const normalized = normalizeText(value).toLowerCase().replace(/[_-]+/g, " ");
  return CLASSIFICATION_CATEGORIES.includes(normalized) ? normalized : "";
}

function normalizeUrgency(value) {
  const normalized = normalizeText(value).toLowerCase();
  return URGENCY_VALUES.includes(normalized) ? normalized : "";
}

function normalizeConfidence(value) {
  const confidence = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(confidence)) {
    return Number.NaN;
  }

  return confidence > 1 && confidence <= 100 ? confidence / 100 : confidence;
}

function normalizeOllamaClassification(rawResponse) {
  let parsed;

  try {
    parsed = JSON.parse(extractJsonObject(rawResponse));
  } catch {
    throw createAiError(
      "invalid_ai_response",
      "Ollama returned non-JSON classification output.",
      502,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw createAiError(
      "invalid_ai_response",
      "Ollama classification output must be a JSON object.",
      502,
    );
  }

  const category = normalizeCategory(parsed.category);
  const urgency = normalizeUrgency(parsed.urgency);
  const confidence = normalizeConfidence(parsed.confidence);
  const summary = normalizeText(parsed.summary);

  if (
    !category ||
    typeof parsed.actionable !== "boolean" ||
    !urgency ||
    !summary ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throw createAiError(
      "invalid_ai_response",
      "Ollama classification output did not match the expected schema.",
      502,
      {
        hasCategory: Boolean(category),
        hasActionable: typeof parsed.actionable === "boolean",
        hasUrgency: Boolean(urgency),
        hasSummary: Boolean(summary),
        confidence,
      },
    );
  }

  return {
    category,
    actionable: parsed.actionable,
    urgency,
    summary,
    confidence,
    aiSource: "ollama",
  };
}

async function callOllamaGenerate(input, options = {}) {
  if (!isAiClassificationEnabled()) {
    emitDiagnostic(options, "warn", "ollamaClassificationSkipped", {
      reason: "ai_disabled",
      model: getOllamaModel(),
    });
    throw createAiError(
      "ai_disabled",
      "AI classification is disabled.",
      503,
    );
  }

  if (typeof fetch !== "function") {
    emitDiagnostic(options, "warn", "ollamaClassificationSkipped", {
      reason: "ai_fetch_unavailable",
      model: getOllamaModel(),
    });
    throw createAiError(
      "ai_fetch_unavailable",
      "The server runtime does not support fetch for Ollama requests.",
      503,
    );
  }

  const timeoutMs = options.timeoutMs ?? getOllamaTimeoutMs();
  const model = options.model ?? getOllamaModel();
  const generateUrl = options.generateUrl ?? getOllamaGenerateUrl(options.baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    emitDiagnostic(options, "info", "ollamaClassificationRequestStarted", {
      model,
      endpoint: getDiagnosticEndpoint(generateUrl),
      timeoutMs,
    });

    const response = await fetch(
      generateUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model,
          prompt: buildQwenEmailClassificationPrompt(input),
          stream: false,
          format: "json",
          options: {
            temperature: 0,
            num_predict: 220,
          },
        }),
        signal: controller.signal,
      },
    );

    emitDiagnostic(options, "info", "ollamaClassificationResponseStatus", {
      model,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });

    if (!response.ok) {
      throw createAiError(
        "ai_unavailable",
        "Ollama classification request failed.",
        503,
        {
          status: response.status,
          statusText: response.statusText,
        },
      );
    }

    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      emitDiagnostic(options, "warn", "ollamaClassificationFailed", {
        code: "ai_timeout",
        model,
        timeoutMs,
      });
      throw createAiError(
        "ai_timeout",
        "Ollama classification timed out.",
        503,
        { timeoutMs },
      );
    }

    if (error?.code && error?.statusCode) {
      emitDiagnostic(options, "warn", "ollamaClassificationFailed", {
        code: error.code,
        model,
        statusCode: error.statusCode,
        details: error.details,
      });
      throw error;
    }

    emitDiagnostic(options, "warn", "ollamaClassificationFailed", {
      code: "ai_unavailable",
      model,
      details: error instanceof Error ? error.message : String(error),
    });
    throw createAiError(
      "ai_unavailable",
      "Ollama classification is unavailable.",
      503,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function classifyEmailWithOllama(input, options = {}) {
  const request = validateClassificationRequest(input);
  const payload = await callOllamaGenerate(request, options);
  const responseText =
    typeof payload?.response === "string"
      ? payload.response
      : typeof payload?.message?.content === "string"
        ? payload.message.content
        : "";

  try {
    const classification = normalizeOllamaClassification(responseText);

    emitDiagnostic(options, "info", "ollamaClassificationParsed", {
      category: classification.category,
      actionable: classification.actionable,
      urgency: classification.urgency,
      confidence: classification.confidence,
      aiSource: classification.aiSource,
    });

    return classification;
  } catch (error) {
    emitDiagnostic(options, "warn", "ollamaClassificationParseFailed", {
      code: error?.code ?? "invalid_ai_response",
      statusCode: error?.statusCode,
      details: error?.details,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

module.exports = {
  CLASSIFICATION_CATEGORIES,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OLLAMA_TIMEOUT_MS,
  buildQwenEmailClassificationPrompt,
  classifyEmailWithOllama,
  getOllamaGenerateUrl,
  normalizeOllamaClassification,
  validateClassificationRequest,
};
