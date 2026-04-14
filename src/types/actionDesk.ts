import type { InboxProvider } from "./inboxSource";

export type IntentCode =
  | "where_is_my_order"
  | "pod_request"
  | "cancellation_request"
  | "short_shipment"
  | "damaged_shipment"
  | "address_change"
  | "billing_question"
  | "operational_confirmation"
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

export type MessageType =
  | "customer_request"
  | "internal_alert"
  | "informational"
  | "awareness_only"
  | "general_support";

export type WorkType =
  | "customer_support"
  | "internal"
  | "vendor"
  | "system"
  | "suspicious"
  | "unknown";

export type Actionability =
  | "action_required"
  | "awareness_only"
  | "no_action_needed"
  | "review_needed";

export type ReplyNeeded = "yes" | "no" | "maybe";

export type CaseIdentifierKind =
  | "order"
  | "transfer"
  | "rework"
  | "po"
  | "reference"
  | "ticket";

export type CaseIdentifierSource = "subject" | "latest_message" | "body";

export type CaseIdentifier = {
  value: string;
  kind: CaseIdentifierKind;
  source: CaseIdentifierSource;
};

export type DeadlineState = "none" | "current" | "past_due";
export type QueueAgeBucket = "new" | "aging" | "stale" | "overdue";
export type QueueAgeStatus =
  | "active"
  | "waiting_on_customer"
  | "snoozed"
  | "done"
  | "not_relevant";

export type EmailAnalysis = {
  summary: string;
  intent: IntentCode;
  urgency: "low" | "medium" | "high";
  confidence: "low" | "medium" | "high";
  orderNumber?: string;
  caseIdentifiers?: CaseIdentifier[];
  hasDeadlineRequest?: boolean;
  deadlineState?: DeadlineState;
  risks: RiskCode[];
  nextAction: string;
  messageType?: MessageType;
  actionability?: Actionability;
  replyNeeded?: ReplyNeeded;
  workType?: WorkType;
  hasClearRequest?: boolean;
  isThreadContinuation?: boolean;
  hasConfirmationRequest?: boolean;
  hasLogisticsContext?: boolean;
  hasOperationalTimingSignal?: boolean;
};

export type AnalysisSource = "ai" | "fallback";

export type PilotQueueView =
  | "active"
  | "waiting_on_customer"
  | "snoozed"
  | "done"
  | "not_relevant"
  | "all";

export type PilotWorkflowStatus =
  | "active"
  | "done"
  | "not_relevant"
  | "waiting_on_customer";

export type PilotUsefulnessFeedback = "helpful" | "not_helpful";

export type PilotQueueItemState = {
  workflowStatus: PilotWorkflowStatus;
  snoozedUntil?: string;
  usefulness?: PilotUsefulnessFeedback;
  updatedAt: string;
};

export type EmailItem = {
  id: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  receivedAt: string;
  body: string;
  previewText?: string;
  provider?: InboxProvider;
  source?: "seeded" | "outlook_import" | "outlook_graph";
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
  queueItemId?: string;
};