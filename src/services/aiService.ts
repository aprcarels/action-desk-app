import { OLLAMA_MODEL, OLLAMA_TIMEOUT_MS, OLLAMA_URL } from "../config/aiConfig";
import type { EmailAnalysis } from "../types/actionDesk";
import { analyzeEmail } from "./analyzeEmail";
import { buildAnalysisPrompt } from "./buildAnalysisPrompt";
import { parseAnalysisResponse } from "./parseAnalysisResponse";

type OllamaGenerateResponse = {
  response?: string;
};

async function requestOllamaAnalysis(prompt: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, OLLAMA_TIMEOUT_MS);

  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with status ${response.status}`);
    }

    const data = (await response.json()) as OllamaGenerateResponse;

    if (typeof data.response !== "string") {
      return null;
    }

  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }

  return null;
}

export async function analyzeEmailWithAI(email: string): Promise<EmailAnalysis> {
  const prompt = buildAnalysisPrompt(email);
  const rawResponse = await requestOllamaAnalysis(prompt);

  if (!rawResponse) {
    return analyzeEmail(email);
  }

  const parsedAnalysis = parseAnalysisResponse(rawResponse);

  if (parsedAnalysis) {
    return parsedAnalysis;
  }

  return analyzeEmail(email);
}

export async function analyzeEmailWithSource(email: string): Promise<{
  analysis: EmailAnalysis;
  analysisSource: "ai" | "fallback";
}> {
  const prompt = buildAnalysisPrompt(email);
  const rawResponse = await requestOllamaAnalysis(prompt);

  if (!rawResponse) {
    return {
      analysis: analyzeEmail(email),
      analysisSource: "fallback",
    };
  }

  const parsedAnalysis = parseAnalysisResponse(rawResponse);

  if (parsedAnalysis) {
    return {
      analysis: parsedAnalysis,
      analysisSource: "ai",
    };
  }

  return {
    analysis: analyzeEmail(email),
    analysisSource: "fallback",
  };
}
