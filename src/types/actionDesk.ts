export type IntentCode =
  | "where_is_my_order"
  | "pod_request"
  | "cancellation_request"
  | "short_shipment"
  | "damaged_shipment"
  | "address_change"
  | "billing_question"
  | "general_support";

export type RiskCode =
  | "delay_or_no_tracking_update"
  | "customer_frustration"
  | "delivered_not_received"
  | "pod_needed"
  | "cancellation_review_needed"
  | "missing_items_reported"
  | "damage_reported"
  | "address_correction_needed"
  | "duplicate_shipment_possible"
  | "billing_discrepancy";

export type PriorityBreakdownItem = {
  label: string;
  points: number;
};

export type EmailAnalysis = {
  summary: string;
  intent: IntentCode;
  urgency: "low" | "medium" | "high";
  confidence: "low" | "medium" | "high";
  orderNumber?: string;
  risks: RiskCode[];
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
  source?: "seeded" | "outlook_import";
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
  priorityScore: number;
  priorityBreakdown?: PriorityBreakdownItem[];
  warning?: string;
};

export type ProcessedEmail = {
  email: EmailItem;
  status: "pending" | "processed" | "failed";
  result?: ActionDeskResult;
  processingError?: string;
  issueCount: number;
  previewText: string;
};
