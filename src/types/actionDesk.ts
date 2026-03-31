export type EmailAnalysis = {
  summary: string;
  intent: string;
  urgency: "low" | "medium" | "high";
  confidence: "low" | "medium" | "high";
  orderNumber?: string;
  risks: string[];
  nextAction: string;
};

export type AnalysisSource = "ai" | "fallback";

export type EmailItem = {
  id: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  receivedAt: string;
  body: string;
};

export type OrderContext = {
  orderNumber: string;
  status: string;
  shipmentStatus: string;
  lastUpdated: string;
};

export type ActionDeskResult = {
  analysis: EmailAnalysis;
  analysisSource: AnalysisSource;
  orderContext?: OrderContext;
  replyDraft: string;
  warning?: string;
};

export type ProcessedEmail = {
  email: EmailItem;
  result: ActionDeskResult;
  issueCount: number;
  previewText: string;
};
