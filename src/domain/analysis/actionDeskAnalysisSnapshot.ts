import type { PriorityBand, QueuePriorityReason } from "../queue/queuePriority";

export type AnalysisSource = "heuristic" | "ai" | "hybrid";

export type ActionDeskAnalysisSnapshot = {
  id: string;
  queueItemId: string;
  mailboxMessageId: string;
  intent?: string | null;
  urgency?: string | null;
  sentiment?: string | null;
  issueType?: string | null;
  category?: string | null;
  detectedOrderNumber?: string | null;
  detectedCaseNumber?: string | null;
  detectedTrackingNumber?: string | null;
  actionable: boolean;
  customerFacing: boolean;
  riskFlags: string[];
  extractedSignals: string[];
  priorityScore: number;
  priorityBand: PriorityBand;
  priorityReasons: QueuePriorityReason[];
  summary?: string | null;
  recommendedAction?: string | null;
  replyDraft?: string | null;
  warnings: string[];
  analysisSource: AnalysisSource;
  createdAt: string;
};
