import type { EmailAnalysis, AnalysisSource } from "../types/actionDesk";
import { analyzeEmail } from "./analyzeEmail";

type AnalyzeEmailWithSourceResult = {
  analysis: EmailAnalysis;
  analysisSource: AnalysisSource;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function analyzeEmailWithSource(
  email: string,
): Promise<AnalyzeEmailWithSourceResult> {
  await delay(50);

  const analysis = analyzeEmail(email);

  return {
    analysis,
    analysisSource: "fallback",
  };
}