export type DatabaseId = string | number | bigint;

export type TicketSource =
  | "shared_mailbox"
  | "direct_mailbox"
  | "app"
  | "email_sync"
  | "delta_sync"
  | "webhook";

export type TicketStatus = "open" | "pending" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "critical";

export type TicketSenderType =
  | "known_customer"
  | "internal_employee"
  | "management"
  | "unknown"
  | "domain_match";

export type TicketSlaState = "OK" | "WARNING" | "CRITICAL" | "BREACHED";

export type TicketFlags = Record<string, unknown>;

export type TicketMessageDirection = "inbound" | "outbound";
export type TicketMessageSource = "app" | "webhook" | "email_sync" | "delta_sync";

export type ClassificationCategory =
  | "billing"
  | "technical"
  | "complaint"
  | "internal_request"
  | "management_task"
  | "inquiry"
  | "escalation"
  | "other";

export type ClassificationSeverity = "low" | "medium" | "high" | "critical";

export type ClassificationSuggestedAction =
  | "assign_csr"
  | "escalate"
  | "create_task"
  | "route_to_department"
  | "hold_for_review";

export type ClassificationValidationStatus =
  | "valid"
  | "fallback"
  | "invalid_json"
  | "invalid_schema"
  | "llm_unavailable";

export type AiClassification = {
  category: ClassificationCategory;
  urgency: ClassificationSeverity;
  importance: ClassificationSeverity;
  suggestedAction: ClassificationSuggestedAction;
  requiresResponse: boolean;
  estimatedDueDate: string | null;
  summary: string;
  confidence: number;
};

export type Ticket = {
  id: string;
  conversationId: string;
  source: TicketSource;
  mailboxId: string;
  receivedAt: string;
  createdAt: string;
  updatedAt: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  senderEmail: string;
  senderType: TicketSenderType;
  customerId: string | null;
  matchConfidence: number;
  queueId: string | null;
  assignedCsrId: string | null;
  slaProfileId: string;
  slaState: TicketSlaState;
  slaElapsedMinutes: number;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  flags: TicketFlags | null;
};

export type CreateTicketInput = {
  conversationId: string;
  mailboxId: string;
  receivedAt: string | Date;
  subject: string;
  senderEmail: string;
  slaProfileId: DatabaseId;
  source?: TicketSource;
  status?: TicketStatus;
  priority?: TicketPriority;
  senderType?: TicketSenderType;
  customerId?: DatabaseId | null;
  matchConfidence?: number;
  queueId?: DatabaseId | null;
  assignedCsrId?: DatabaseId | null;
  slaState?: TicketSlaState;
  slaElapsedMinutes?: number;
  firstResponseAt?: string | Date | null;
  resolvedAt?: string | Date | null;
  closedAt?: string | Date | null;
  flags?: TicketFlags | null;
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  domain: string | null;
  assignedCsrId: string | null;
  assignedCSRs: CustomerCsrAssignment[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomerCsrAssignmentRole = "primary" | "secondary" | "backup";

export type CustomerCsrAssignment = {
  id: string;
  customerId: string;
  employeeId: string;
  employeeDisplayName: string;
  employeeEmail: string;
  assignmentRole: CustomerCsrAssignmentRole;
  locationName: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeRole =
  | "csr"
  | "team_lead"
  | "supervisor"
  | "admin"
  | "manager"
  | "employee";

export type Employee = {
  id: string;
  microsoftUserId: string | null;
  displayName: string;
  email: string;
  role: EmployeeRole;
  department: string | null;
  isActive: boolean;
  isOnline: boolean;
  createdAt: string;
  updatedAt: string;
};
