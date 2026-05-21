import type {
  AiReplyDraft,
  AiEmailClassification,
  EmailAnalysis,
  AnalysisSource,
  OrderContext,
} from "../types/actionDesk";
import { getEnv } from "../utils/env";
import { analyzeEmail } from "./analyzeEmail";
import { parseAnalysisInput } from "./analysisInput";
import {
  normalizeAiEmailClassification,
  type AiClassifyEmailRequest,
} from "./aiEmailClassification";
import {
  canRequestAiReplyDraft,
  normalizeAiReplyDraft,
  type AiDraftReplyRequest,
} from "./aiReplyDraft";
import { classifyEmailWithAi, draftReplyWithAi } from "./sharedWorkflowApi";

type AnalyzeEmailWithSourceResult = {
  analysis: EmailAnalysis;
  analysisSource: AnalysisSource;
  aiClassification?: AiEmailClassification;
};

type AnalyzeEmailWithSourceOptions = {
  aiInput?: Partial<AiClassifyEmailRequest>;
};

type DraftReplyWithSourceOptions = AnalyzeEmailWithSourceOptions & {
  analysis: EmailAnalysis;
  orderContext?: OrderContext;
  rulesReplyDraft: string;
};

const DEFAULT_CLIENT_AI_TIMEOUT_MS = 5500;

function getErrorDiagnostic(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") {
    return {
      message: String(error),
    };
  }

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    retryable?: unknown;
    context?: unknown;
    details?: unknown;
  };

  return {
    code: typeof candidate.code === "string" ? candidate.code : undefined,
    message:
      typeof candidate.message === "string" ? candidate.message : String(error),
    retryable:
      typeof candidate.retryable === "boolean" ? candidate.retryable : undefined,
    context:
      typeof candidate.context === "string" ? candidate.context : undefined,
    details: candidate.details,
  };
}

function logAiDiagnostic(
  level: "info" | "warn",
  event: string,
  metadata: Record<string, unknown>,
) {
  const logger = level === "warn" ? console.warn : console.info;

  logger("[Action Desk AI diagnostics]", event, metadata);
}

function isDisabledValue(value: string | undefined): boolean {
  return ["false", "0", "off", "disabled"].includes(
    String(value ?? "").trim().toLowerCase(),
  );
}

function isAiClassificationEnabled(): boolean {
  return !(
    isDisabledValue(getEnv("VITE_AI_CLASSIFICATION_ENABLED")) ||
    isDisabledValue(getEnv("ACTION_DESK_AI_ENABLED"))
  );
}

function isAiReplyDraftingEnabled(): boolean {
  return !(
    isDisabledValue(getEnv("VITE_AI_REPLY_DRAFTS_ENABLED")) ||
    isDisabledValue(getEnv("ACTION_DESK_AI_REPLY_DRAFTS_ENABLED")) ||
    isDisabledValue(getEnv("ACTION_DESK_AI_ENABLED"))
  );
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("AI classification timed out."));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function buildAiRequest(
  email: string,
  options?: AnalyzeEmailWithSourceOptions,
): AiClassifyEmailRequest {
  const parsedInput = parseAnalysisInput(email);

  return {
    subject: (options?.aiInput?.subject ?? parsedInput.subject).trim(),
    from: (options?.aiInput?.from ?? "").trim(),
    body: ((options?.aiInput?.body ?? parsedInput.body) || email).trim(),
  };
}

function buildAiReplyDraftRequest(
  email: string,
  options: DraftReplyWithSourceOptions,
): AiDraftReplyRequest {
  const parsedInput = parseAnalysisInput(email);

  return {
    subject: (options.aiInput?.subject ?? parsedInput.subject).trim(),
    from: (options.aiInput?.from ?? "").trim(),
    body: ((options.aiInput?.body ?? parsedInput.body) || email).trim(),
    analysis: options.analysis,
    orderContext: options.orderContext,
    recommendedNextAction: options.analysis.nextAction,
  };
}

async function getAssistiveAiClassification(
  email: string,
  options?: AnalyzeEmailWithSourceOptions,
): Promise<AiEmailClassification | undefined> {
  if (!isAiClassificationEnabled()) {
    logAiDiagnostic("info", "aiClassificationSkipped", {
      reason: "disabled",
      source: "client",
    });
    return undefined;
  }

  try {
    const response = await withTimeout(
      classifyEmailWithAi(buildAiRequest(email, options)),
      DEFAULT_CLIENT_AI_TIMEOUT_MS,
    );
    const classification = normalizeAiEmailClassification(response);

    if (!classification) {
      logAiDiagnostic("warn", "aiUnavailableFallback", {
        reason: "invalid_ai_classification_response",
        source: "client",
      });
      return undefined;
    }

    logAiDiagnostic("info", "aiClassificationReceived", {
      source: "client",
      provider: classification.aiSource,
      category: classification.category,
      actionable: classification.actionable,
      urgency: classification.urgency,
      confidence: classification.confidence,
    });

    return classification;
  } catch (error) {
    logAiDiagnostic("warn", "aiUnavailableFallback", {
      reason: "ai_route_unavailable",
      source: "client",
      ...getErrorDiagnostic(error),
    });
    return undefined;
  }
}

export async function analyzeEmailWithSource(
  email: string,
  options?: AnalyzeEmailWithSourceOptions,
): Promise<AnalyzeEmailWithSourceResult> {
  const analysis = analyzeEmail(email);
  const aiClassification = await getAssistiveAiClassification(email, options);

  return {
    analysis,
    analysisSource: aiClassification ? "hybrid" : "fallback",
    aiClassification,
  };
}

export async function draftReplyWithSource(
  email: string,
  options: DraftReplyWithSourceOptions,
): Promise<AiReplyDraft | undefined> {
  if (!canRequestAiReplyDraft(options.analysis, options.rulesReplyDraft)) {
    logAiDiagnostic("info", "aiReplyDraftSkipped", {
      reason: "not_eligible",
      source: "client",
      workType: options.analysis.workType,
      actionability: options.analysis.actionability,
      replyNeeded: options.analysis.replyNeeded,
    });
    return undefined;
  }

  if (!isAiReplyDraftingEnabled()) {
    logAiDiagnostic("info", "aiReplyDraftSkipped", {
      reason: "disabled",
      source: "client",
    });
    return undefined;
  }

  const request = buildAiReplyDraftRequest(email, options);

  try {
    const response = await withTimeout(
      draftReplyWithAi(request),
      DEFAULT_CLIENT_AI_TIMEOUT_MS,
    );
    const draft = normalizeAiReplyDraft(response, request);

    if (!draft) {
      logAiDiagnostic("warn", "aiReplyDraftFallback", {
        reason: "invalid_or_ungrounded_ai_reply_draft",
        source: "client",
      });
      return undefined;
    }

    logAiDiagnostic("info", "aiReplyDraftReceived", {
      source: "client",
      provider: draft.aiSource,
      replyDraftLength: draft.replyDraft.length,
    });

    return draft;
  } catch (error) {
    logAiDiagnostic("warn", "aiReplyDraftFallback", {
      reason: "ai_reply_route_unavailable",
      source: "client",
      ...getErrorDiagnostic(error),
    });
    return undefined;
  }
}
