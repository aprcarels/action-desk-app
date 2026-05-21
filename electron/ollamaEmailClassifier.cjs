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
const TRACKING_NUMBER_PATTERN =
  /\b(?:1Z[A-Z0-9]{10,}|[A-Z]{2}\d{9}[A-Z]{2}|\d{12,22})\b/gi;
const DELIVERY_DATE_REPLY_FACT_PATTERNS = [
  /\b(?:will|should|is expected to|expected to|scheduled to)\s+(?:arrive|deliver|be delivered)\s+(?:on|by|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b[^.!\n]*/gi,
  /\b(?:eta|estimated delivery|delivery date|delivery window)\s+(?:is|will be|:)\s+[^.!\n]+/gi,
];
const SHIPMENT_STATUS_REPLY_FACT_PATTERNS = [
  /\b(?:has|have)\s+(?:shipped|been shipped|been delivered|delivered)\b/gi,
  /\b(?:is|are)\s+(?:in transit|out for delivery|delivered|delayed|shipped|processing|completed|cancelled|canceled|label created|marked exception|on hold)\b/gi,
];
const REFUND_APPROVAL_REPLY_FACT_PATTERNS = [
  /\b(?:refund|credit)\s+(?:has been|was|is)\s+(?:approved|issued|processed)\b/gi,
  /\b(?:we|i)\s+(?:approved|issued|processed)\s+(?:the\s+)?(?:refund|credit)\b/gi,
];
const COMPLETED_ACTION_REPLY_FACT_PATTERNS = [
  /\b(?:we|i)\s+(?:have\s+)?(?:processed|completed|canceled|cancelled|shipped|issued|approved|refunded|updated|changed|scheduled|created)\b/gi,
];
const POLICY_PROMISE_REPLY_FACT_PATTERNS = [
  /\b(?:we|i)\s+(?:will|can)\s+(?:guarantee|approve|issue|process|refund|replace|cover|waive)\b/gi,
  /\b(?:free replacement|policy\s+(?:allows|guarantees|requires)|guaranteed delivery)\b/gi,
];

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeFactText(value) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().toLowerCase()
    : "";
}

function normalizeBooleanEnv(value) {
  return String(value || "").trim().toLowerCase();
}

function isAiClassificationEnabled() {
  const value = normalizeBooleanEnv(process.env.ACTION_DESK_AI_ENABLED);
  return value !== "false" && value !== "0" && value !== "off" && value !== "disabled";
}

function isAiReplyDraftingEnabled() {
  const globalValue = normalizeBooleanEnv(process.env.ACTION_DESK_AI_ENABLED);
  const replyValue = normalizeBooleanEnv(process.env.ACTION_DESK_AI_REPLY_DRAFTS_ENABLED);

  return (
    globalValue !== "false" &&
    globalValue !== "0" &&
    globalValue !== "off" &&
    globalValue !== "disabled" &&
    replyValue !== "false" &&
    replyValue !== "0" &&
    replyValue !== "off" &&
    replyValue !== "disabled"
  );
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

function summarizeAnalysisForPrompt(analysis) {
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) {
    return {};
  }

  return {
    summary: normalizeText(analysis.summary),
    intent: normalizeText(analysis.intent),
    urgency: normalizeText(analysis.urgency),
    risks: Array.isArray(analysis.risks) ? analysis.risks.map(normalizeText).filter(Boolean) : [],
    nextAction: normalizeText(analysis.nextAction),
    orderNumber: normalizeText(analysis.orderNumber),
    actionability: normalizeText(analysis.actionability),
    replyNeeded: normalizeText(analysis.replyNeeded),
    workType: normalizeText(analysis.workType),
    messageType: normalizeText(analysis.messageType),
  };
}

function buildQwenEmailReplyDraftPrompt(input) {
  const subject = normalizeText(input.subject) || "(no subject)";
  const from = normalizeText(input.from) || "(unknown sender)";
  const body = normalizeText(input.body) || "(empty body)";
  const analysis = summarizeAnalysisForPrompt(input.analysis);
  const orderContext = input.orderContext && typeof input.orderContext === "object"
    ? {
        orderNumber: normalizeText(input.orderContext.orderNumber),
        status: normalizeText(input.orderContext.status),
        shipmentStatus: normalizeText(input.orderContext.shipmentStatus),
        lastUpdated: normalizeText(input.orderContext.lastUpdated),
      }
    : null;

  return [
    "You are Action Desk's assistive reply drafting layer for a customer support queue.",
    "Action Desk rules already decided whether a reply is allowed. You must not send email, create workflow state, assign tickets, update records, or override rules.",
    "Write only a draft reply for a human rep to review.",
    "Return compact JSON only. Do not include markdown, prose, comments, or extra keys.",
    "Required JSON shape:",
    '{"replyDraft": string}',
    "Grounding and safety rules:",
    "- Use only the provided email, analysis, order/shipment context, and recommended next action.",
    "- Do not invent tracking numbers, delivery dates, refund approvals, shipment status, policy promises, or completed actions.",
    "- Do not say an action was completed unless the provided context proves it.",
    "- If key details are missing, ask for them clearly.",
    "- Keep tone professional, concise, and helpful.",
    "- Do not mention AI, automation, prompts, internal analysis, or system rules.",
    "- Use a simple greeting and close. Do not include a subject line.",
    "",
    "Email:",
    `Subject: ${subject}`,
    `From: ${from}`,
    "Body/thread:",
    body,
    "",
    "Current Action Desk analysis:",
    JSON.stringify(analysis),
    "",
    "Recommended next action:",
    normalizeText(input.recommendedNextAction) || analysis.nextAction || "(none)",
    "",
    "Order/shipment context:",
    orderContext ? JSON.stringify(orderContext) : "No confirmed order/shipment context is available.",
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

function isReplyDraftEligible(analysis) {
  const replyRecommended =
    analysis?.replyNeeded === "yes" || analysis?.replyNeeded === "recommended";

  return (
    analysis &&
    typeof analysis === "object" &&
    !Array.isArray(analysis) &&
    analysis.workType === "customer_support" &&
    replyRecommended &&
    (analysis.actionability === "action_required" ||
      analysis.actionability === "review_needed") &&
    analysis.actionability !== "no_action_needed" &&
    analysis.messageType !== "internal_alert" &&
    analysis.messageType !== "awareness_only"
  );
}

function validateReplyDraftRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw createAiError(
      "invalid_ai_reply_request",
      "AI reply draft request body must be a JSON object.",
      400,
    );
  }

  for (const field of ["subject", "from", "body", "recommendedNextAction"]) {
    if (typeof input[field] !== "string") {
      throw createAiError(
        "invalid_ai_reply_request",
        `AI reply draft field '${field}' must be a string.`,
        400,
      );
    }
  }

  if (!input.analysis || typeof input.analysis !== "object" || Array.isArray(input.analysis)) {
    throw createAiError(
      "invalid_ai_reply_request",
      "AI reply draft field 'analysis' must be an object.",
      400,
    );
  }

  if (!isReplyDraftEligible(input.analysis)) {
    throw createAiError(
      "ai_reply_ineligible",
      "AI reply drafting is not allowed for this email.",
      400,
      {
        workType: input.analysis.workType,
        replyNeeded: input.analysis.replyNeeded,
        actionability: input.analysis.actionability,
        messageType: input.analysis.messageType,
      },
    );
  }

  return {
    subject: normalizeText(input.subject),
    from: normalizeText(input.from),
    body: normalizeText(input.body),
    analysis: input.analysis,
    orderContext:
      input.orderContext && typeof input.orderContext === "object" && !Array.isArray(input.orderContext)
        ? input.orderContext
        : undefined,
    recommendedNextAction: normalizeText(input.recommendedNextAction),
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

function buildReplyGroundingText(request) {
  const analysis = request.analysis || {};
  const identifiers = Array.isArray(analysis.caseIdentifiers)
    ? analysis.caseIdentifiers.map((identifier) => normalizeText(identifier?.value))
    : [];

  return [
    request.subject,
    request.from,
    request.body,
    analysis.summary,
    analysis.nextAction,
    request.recommendedNextAction,
    analysis.orderNumber,
    ...identifiers,
    request.orderContext?.orderNumber,
    request.orderContext?.status,
    request.orderContext?.shipmentStatus,
    request.orderContext?.lastUpdated,
  ]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .toLowerCase();
}

function extractTrackingTokens(text) {
  return Array.from(String(text || "").matchAll(TRACKING_NUMBER_PATTERN), (match) =>
    match[0].toUpperCase(),
  );
}

function hasInventedTrackingNumber(replyDraft, groundingText) {
  const groundedTracking = new Set(extractTrackingTokens(groundingText));

  return extractTrackingTokens(replyDraft).some((token) => !groundedTracking.has(token));
}

function hasNegationNear(replyDraft, startIndex) {
  const prefix = String(replyDraft || "")
    .slice(Math.max(0, startIndex - 40), startIndex)
    .toLowerCase();

  return /\b(?:cannot|can't|can not|do not|don't|not|unable|not able|no confirmed|without confirmed)\b/.test(
    prefix,
  );
}

function isNegatedFactText(value) {
  return /\b(?:cannot|can't|can not|do not|don't|not|unable|unknown|unavailable|not confirmed|no confirmed)\b/i.test(
    String(value || ""),
  );
}

function findUnsupportedReplyFacts(replyDraft, patterns) {
  return patterns.flatMap((pattern) =>
    Array.from(String(replyDraft || "").matchAll(pattern)).filter((match) => {
      const index = match.index ?? 0;

      return !hasNegationNear(replyDraft, index) && !isNegatedFactText(match[0]);
    }),
  );
}

function isGroundedShipmentStatusFact(fact, request, groundingText) {
  const normalizedFact = normalizeFactText(fact);
  const normalizedGrounding = normalizeFactText(groundingText);
  const groundedStatuses = [
    request.orderContext?.status,
    request.orderContext?.shipmentStatus,
  ]
    .map(normalizeFactText)
    .filter(Boolean);

  return (
    normalizedGrounding.includes(normalizedFact) ||
    groundedStatuses.some((status) => normalizedFact.includes(status))
  );
}

function hasUnsupportedReplyFact(replyDraft, request, groundingText) {
  const unsupportedFacts = findUnsupportedReplyFacts(replyDraft, [
    ...DELIVERY_DATE_REPLY_FACT_PATTERNS,
    ...REFUND_APPROVAL_REPLY_FACT_PATTERNS,
    ...COMPLETED_ACTION_REPLY_FACT_PATTERNS,
    ...POLICY_PROMISE_REPLY_FACT_PATTERNS,
  ]);

  if (unsupportedFacts.length > 0) {
    return true;
  }

  return findUnsupportedReplyFacts(replyDraft, SHIPMENT_STATUS_REPLY_FACT_PATTERNS)
    .some((match) => !isGroundedShipmentStatusFact(match[0], request, groundingText));
}

function normalizeOllamaReplyDraft(rawResponse, request) {
  let parsed;

  try {
    parsed = JSON.parse(extractJsonObject(rawResponse));
  } catch {
    throw createAiError(
      "invalid_ai_response",
      "Ollama returned non-JSON reply draft output.",
      502,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw createAiError(
      "invalid_ai_response",
      "Ollama reply draft output must be a JSON object.",
      502,
    );
  }

  const replyDraft = typeof parsed.replyDraft === "string"
    ? parsed.replyDraft.replace(/\\n/g, "\n").trim()
    : "";

  if (!replyDraft) {
    throw createAiError(
      "invalid_ai_response",
      "Ollama reply draft output did not include a replyDraft string.",
      502,
    );
  }

  const groundingText = buildReplyGroundingText(request);

  if (
    hasInventedTrackingNumber(replyDraft, groundingText) ||
    hasUnsupportedReplyFact(replyDraft, request, groundingText) ||
    /\b(as an ai|ai assistant|language model)\b/i.test(replyDraft)
  ) {
    throw createAiError(
      "ungrounded_ai_reply",
      "Ollama reply draft included unsupported or ungrounded facts.",
      502,
    );
  }

  return {
    replyDraft,
    aiSource: "ollama",
  };
}

async function callOllamaGenerateForPrompt(input, options = {}, promptOptions) {
  const eventPrefix = promptOptions.eventPrefix;
  const aiEnabled = promptOptions.isEnabled();

  if (!aiEnabled) {
    emitDiagnostic(options, "warn", `${eventPrefix}Skipped`, {
      reason: "ai_disabled",
      model: getOllamaModel(),
    });
    throw createAiError(
      "ai_disabled",
      `${promptOptions.label} is disabled.`,
      503,
    );
  }

  if (typeof fetch !== "function") {
    emitDiagnostic(options, "warn", `${eventPrefix}Skipped`, {
      reason: "ai_fetch_unavailable",
      model: getOllamaModel(),
    });
    throw createAiError(
      "ai_fetch_unavailable",
      `The server runtime does not support fetch for ${promptOptions.label} requests.`,
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
    emitDiagnostic(options, "info", `${eventPrefix}RequestStarted`, {
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
          prompt: promptOptions.buildPrompt(input),
          stream: false,
          format: "json",
          options: {
            temperature: 0,
            num_predict: promptOptions.numPredict,
          },
        }),
        signal: controller.signal,
      },
    );

    emitDiagnostic(options, "info", `${eventPrefix}ResponseStatus`, {
      model,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });

    if (!response.ok) {
      throw createAiError(
        "ai_unavailable",
        `${promptOptions.label} request failed.`,
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
      emitDiagnostic(options, "warn", `${eventPrefix}Failed`, {
        code: "ai_timeout",
        model,
        timeoutMs,
      });
      throw createAiError(
        "ai_timeout",
        `${promptOptions.label} timed out.`,
        503,
        { timeoutMs },
      );
    }

    if (error?.code && error?.statusCode) {
      emitDiagnostic(options, "warn", `${eventPrefix}Failed`, {
        code: error.code,
        model,
        statusCode: error.statusCode,
        details: error.details,
      });
      throw error;
    }

    emitDiagnostic(options, "warn", `${eventPrefix}Failed`, {
      code: "ai_unavailable",
      model,
      details: error instanceof Error ? error.message : String(error),
    });
    throw createAiError(
      "ai_unavailable",
      `${promptOptions.label} is unavailable.`,
      503,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function callOllamaGenerate(input, options = {}) {
  return callOllamaGenerateForPrompt(input, options, {
    eventPrefix: "ollamaClassification",
    label: "Ollama classification",
    isEnabled: isAiClassificationEnabled,
    buildPrompt: buildQwenEmailClassificationPrompt,
    numPredict: 220,
  });
}

async function callOllamaGenerateForReplyDraft(input, options = {}) {
  return callOllamaGenerateForPrompt(input, options, {
    eventPrefix: "ollamaReplyDraft",
    label: "Ollama reply drafting",
    isEnabled: isAiReplyDraftingEnabled,
    buildPrompt: buildQwenEmailReplyDraftPrompt,
    numPredict: 520,
  });
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

async function draftReplyWithOllama(input, options = {}) {
  const request = validateReplyDraftRequest(input);
  const payload = await callOllamaGenerateForReplyDraft(request, options);
  const responseText =
    typeof payload?.response === "string"
      ? payload.response
      : typeof payload?.message?.content === "string"
        ? payload.message.content
        : "";

  try {
    const draft = normalizeOllamaReplyDraft(responseText, request);

    emitDiagnostic(options, "info", "ollamaReplyDraftParsed", {
      replyDraftLength: draft.replyDraft.length,
      aiSource: draft.aiSource,
    });

    return draft;
  } catch (error) {
    emitDiagnostic(options, "warn", "ollamaReplyDraftParseFailed", {
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
  buildQwenEmailReplyDraftPrompt,
  classifyEmailWithOllama,
  draftReplyWithOllama,
  getOllamaGenerateUrl,
  normalizeOllamaClassification,
  normalizeOllamaReplyDraft,
  validateClassificationRequest,
  validateReplyDraftRequest,
};
