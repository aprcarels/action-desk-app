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
  | "operational_logistics_scheduling"
  | "routing_coordination"
  | "carrier_pickup_scheduling"
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

export type ReplyNeeded = "yes" | "recommended" | "no" | "maybe";

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

export type CustomerAssignmentRole = "primary" | "secondary" | "backup";

export type CustomerCsrAssignment = {
  repId: string;
  repName?: string;
  repEmail?: string;
  assignmentRole: CustomerAssignmentRole;
  locationName?: string;
  isActive: boolean;
};

export type SavedCustomer = {
  id: string;
  name: string;
  email?: string;
  emails: string[];
  domain?: string;
  domains: string[];
  ownerRepId?: string;
  ownerRepIds?: string[];
  assignedCSRs?: CustomerCsrAssignment[];
  assignedCsrId?: string;
  locationId?: string;
  locationName?: string;
  locations?: string[];
  isActive?: boolean;
};

export type SavedCustomerDraft = {
  id?: string;
  name: string;
  emails: string[];
  domains: string[];
  ownerRepId?: string;
  ownerRepIds?: string[];
  assignedCSRs?: CustomerCsrAssignment[];
  locationId?: string;
};

export type CustomerMatch = {
  customerId: string;
  customerName: string;
  matchedOn: "email" | "domain" | "subject" | "body" | "thread";
  matchedValue: string;
  ownerRepId?: string;
  ownerRepIds?: string[];
  assignedCSRs?: CustomerCsrAssignment[];
};

export type RepRole = "rep" | "supervisor" | "admin";

export type AppCapability =
  | "view_my_queue"
  | "view_unassigned"
  | "view_all_emails"
  | "view_supervisor_queue"
  | "view_all_work"
  | "manage_customer_ownership"
  | "manage_sla_settings"
  | "review_override_history"
  | "view_diagnostics"
  | "create_backup"
  | "manage_test_queue_data"
  | "manage_users";

export type RepProfile = {
  id: string;
  name: string;
  displayName?: string;
  initials: string;
  email: string;
  role: RepRole;
  locationId?: string;
  locationName?: string;
  allowedLocations?: string[];
  isActive?: boolean;
};

export type ManagedUserMappingStatus = "mapped" | "pending_first_sign_in";

export type ManagedUser = {
  id: string;
  entraObjectId?: string;
  name?: string;
  displayName: string;
  initials: string;
  email: string;
  role: RepRole;
  locationId?: string;
  locationName?: string;
  allowedLocations?: string[];
  isActive: boolean;
  hasSignedIn: boolean;
  mappingStatus: ManagedUserMappingStatus;
  createdAt: string;
  updatedAt: string;
};

export type ManagedUserDraft = {
  displayName: string;
  initials: string;
  email: string;
  role: RepRole;
  locationId?: string;
  isActive: boolean;
};

export type AssignmentReason =
  | "Covering for colleague"
  | "Unassigned"
  | "Overflow";

export type AssignmentRecord = {
  type: "auto" | "manual";
  assignedRepId: string;
  assignedRepName: string;
  assignedAt: string;
  reason?: AssignmentReason;
  assignedByRepId?: string;
};

export type AssignmentResolution = {
  assignmentStatus: "assigned" | "unassigned" | "missing_rep";
  assignmentSource:
    | "manual"
    | "persisted"
    | "customer_email"
    | "customer_domain"
    | "customer_subject"
    | "customer_body"
    | "customer_thread"
    | "none";
  primaryRepId?: string;
  primaryRepName?: string;
  assignedRepIds: string[];
  assignedRepNames: string[];
  customerId?: string;
  customerName?: string;
  matchType: "email" | "domain" | "subject" | "body" | "thread" | "none";
};

export type WorkflowStatus =
  | "new"
  | "in_progress"
  | "waiting_on_customer"
  | "resolved";

export type ThreadPresenceType = "viewing" | "working";

export type ThreadPresenceRecord = {
  threadId: string;
  activeUserId: string;
  activeUserName: string;
  activeUserRole: RepRole;
  presenceType: ThreadPresenceType;
  updatedAt: string;
};

export type WorkflowStatusFilter =
  | "open"
  | "all"
  | WorkflowStatus;

export type QueueScopeView = "my_queue" | "all_emails" | "unassigned";
export type QueueDisplayMode = "list" | "grouped_by_rep";

export type SupervisorQuickFilter =
  | "all"
  | "unassigned"
  | "over_sla"
  | "waiting_on_customer"
  | "resolved_today";

export type EmailInternalNote = {
  id: string;
  authorRepId: string;
  authorName: string;
  createdAt: string;
  body: string;
};

export type ReplyLogEntry = {
  id: string;
  repId: string;
  repName: string;
  createdAt: string;
};

export type SnoozeState = {
  until: string;
  snoozedByRepId: string;
  snoozedByRepName: string;
  createdAt: string;
};

export type ThreadWorkflowState = {
  locationId?: string;
  status?: WorkflowStatus;
  resolvedAt?: string;
  manualAssignment?: AssignmentRecord;
  autoAssignment?: AssignmentRecord;
  assignmentHistory: AssignmentRecord[];
  notes: EmailInternalNote[];
  replyLog: ReplyLogEntry[];
  snooze?: SnoozeState;
  updatedAt?: string;
  updatedByRepId?: string;
  updatedByRepName?: string;
};

export type WorkflowPreferences = {
  queueScopeView: QueueScopeView;
  queueDisplayMode: QueueDisplayMode;
  statusFilter: WorkflowStatusFilter;
  showSnoozed: boolean;
};

export type WorkflowState = {
  reps: RepProfile[];
  currentRepId: string;
  threadStates: Record<string, ThreadWorkflowState>;
  threadPresence: Record<string, ThreadPresenceRecord[]>;
  preferences: WorkflowPreferences;
};

export type SlaState = "on_track" | "at_risk" | "breached" | "met";
export type SlaTarget = "first_response" | "resolution";

export type SlaSettings = {
  firstResponseSlaMinutes: number;
  resolutionSlaMinutes: number;
  warningThresholdPercent: number;
  warningMinutesBeforeBreach: number;
  locationId?: string;
  updatedAt?: string;
  updatedByRepId?: string;
  updatedByRepName?: string;
};

export type WorkflowThreadSlaStatus = {
  target: SlaTarget;
  state: SlaState;
  elapsedMinutes: number;
  targetMinutes: number;
  warningStartsAtMinutes: number;
  dueAt: string;
  completedAt?: string;
};

export type AuthSession = {
  sessionId: string;
  currentUser: RepProfile | null;
  capabilities: AppCapability[];
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

export type AnalysisSource = "ai" | "fallback" | "heuristic" | "hybrid";
export type ReplyDraftSource = "ai" | "rules";

export type AiEmailClassificationCategory =
  | "customer support request"
  | "order/shipment issue"
  | "billing/refund"
  | "operational logistics scheduling"
  | "routing coordination"
  | "carrier pickup scheduling"
  | "vendor sales outreach"
  | "internal operational update"
  | "operational report"
  | "internal communication"
  | "spam/phishing"
  | "no action needed";

export type AiEmailClassification = {
  category: AiEmailClassificationCategory;
  actionable: boolean;
  urgency: "low" | "medium" | "high";
  summary: string;
  confidence: number;
  aiSource: "ollama";
};

export type AiReplyDraft = {
  replyDraft: string;
  aiSource: "ollama";
};

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
  providerMessageId?: string;
  conversationId?: string;
  workflowThreadId?: string;
  locationId?: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  receivedAt: string;
  sentAt?: string;
  body: string;
  previewText?: string;
  hasAttachments?: boolean;
  toRecipients?: string[];
  ccRecipients?: string[];
  provider?: InboxProvider;
  source?: "seeded" | "outlook_import" | "outlook_graph" | "test_data";
  outlookWebLink?: string;
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
  aiClassification?: AiEmailClassification;
  orderContext?: OrderContext;
  replyDraft: string;
  replyDraftSource?: ReplyDraftSource;
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
  isCustomerPriority?: boolean;
  customerMatch?: CustomerMatch;
};

export type WorkflowThread = {
  id: string;
  groupKey: string;
  title: string;
  subtitle: string;
  items: ProcessedEmail[];
  representativeItem: ProcessedEmail;
  latestReceivedAt: string;
  oldestReceivedAt: string;
  latestActivityAt: string;
  itemCount: number;
  customerName?: string;
  locationId?: string;
  assignedRepId?: string;
  assignedRepName?: string;
  assignedRepInitials?: string;
  customerAssignedRepIds?: string[];
  customerAssignedRepNames?: string[];
  customerAssignedRepInitials?: string[];
  assignmentType?: "auto" | "manual";
  assignmentResolution: AssignmentResolution;
  currentAssignment?: AssignmentRecord;
  assignmentHistory: AssignmentRecord[];
  status: WorkflowStatus;
  resolvedAt?: string;
  notes: EmailInternalNote[];
  replyLog: ReplyLogEntry[];
  snooze?: SnoozeState;
  isSnoozed: boolean;
  noteCount: number;
  replyCount: number;
  activePresence?: ThreadPresenceRecord;
  activePresenceRecords: ThreadPresenceRecord[];
  slaMinutes: number;
  firstReplyAt?: string;
  firstReplySource?: "logged" | "thread";
  sla: {
    firstResponse: WorkflowThreadSlaStatus;
    resolution: WorkflowThreadSlaStatus;
    current: WorkflowThreadSlaStatus;
  };
  updatedAt?: string;
  updatedByRepId?: string;
  updatedByRepName?: string;
};
