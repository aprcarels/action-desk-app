import type {
  AssignmentResolution,
  AssignmentRecord,
  CustomerMatch,
  ProcessedEmail,
  RepProfile,
  SavedCustomer,
  ThreadWorkflowState,
} from "../types/actionDesk";
import {
  getCustomerOwnerRepIds,
  getCustomerPrimaryOwnerId,
  getSavedCustomerDisplayName,
} from "./customerSettings";
import { findCustomerMatch } from "./customerMatching";

export const ASSIGNED_REP_MISSING_LABEL = "Assigned Rep Missing";

type CustomerOwnershipMatch = {
  customer: SavedCustomer;
  matchType: Exclude<AssignmentResolution["matchType"], "none">;
  matchedOn: CustomerMatch["matchedOn"];
};

type ResolveCanonicalAssignmentOptions = {
  threadState?: ThreadWorkflowState;
  representativeItem: ProcessedEmail;
  customers: SavedCustomer[];
  reps: RepProfile[];
};

function emptyAssignmentResolution(
  overrides?: Partial<AssignmentResolution>,
): AssignmentResolution {
  return {
    assignmentStatus: "unassigned",
    assignmentSource: "none",
    assignedRepIds: [],
    assignedRepNames: [],
    matchType: "none",
    ...overrides,
  };
}

function getRepById(reps: RepProfile[], repId?: string): RepProfile | undefined {
  if (!repId) {
    return undefined;
  }

  return reps.find((rep) => rep.id === repId && rep.isActive !== false);
}

function uniqueIds(ids: Array<string | undefined>): string[] {
  return Array.from(
    new Set(ids.map((id) => id?.trim()).filter((id): id is string => Boolean(id))),
  );
}

function buildRepAssignmentResolution(options: {
  assignmentSource: AssignmentResolution["assignmentSource"];
  primaryRepId?: string;
  assignedRepIds: string[];
  reps: RepProfile[];
  customerId?: string;
  customerName?: string;
  matchType?: AssignmentResolution["matchType"];
}): AssignmentResolution {
  const assignedRepIds = uniqueIds([
    options.primaryRepId,
    ...options.assignedRepIds,
  ]);
  const primaryRepId = options.primaryRepId ?? assignedRepIds[0];

  if (!primaryRepId) {
    return emptyAssignmentResolution({
      customerId: options.customerId,
      customerName: options.customerName,
      matchType: options.matchType ?? "none",
    });
  }

  const primaryRep = getRepById(options.reps, primaryRepId);
  const assignedRepNames = assignedRepIds.map(
    (repId) => getRepById(options.reps, repId)?.name ?? ASSIGNED_REP_MISSING_LABEL,
  );

  return {
    assignmentStatus: primaryRep ? "assigned" : "missing_rep",
    assignmentSource: options.assignmentSource,
    primaryRepId,
    primaryRepName: primaryRep?.name ?? ASSIGNED_REP_MISSING_LABEL,
    assignedRepIds,
    assignedRepNames,
    customerId: options.customerId,
    customerName: options.customerName,
    matchType: options.matchType ?? "none",
  };
}

function buildRecordAssignmentResolution(options: {
  assignmentSource: "manual" | "persisted";
  assignment: AssignmentRecord;
  reps: RepProfile[];
  customerMatch?: CustomerMatch;
}): AssignmentResolution {
  const matchType = getAssignmentMatchType(options.customerMatch);

  return buildRepAssignmentResolution({
    assignmentSource: options.assignmentSource,
    primaryRepId: options.assignment.assignedRepId,
    assignedRepIds: [options.assignment.assignedRepId],
    reps: options.reps,
    customerId: options.customerMatch?.customerId,
    customerName: options.customerMatch?.customerName,
    matchType,
  });
}

function getAssignmentMatchType(
  customerMatch?: CustomerMatch,
): AssignmentResolution["matchType"] {
  if (customerMatch?.matchedOn === "email") {
    return "email";
  }

  if (customerMatch?.matchedOn === "domain") {
    return "domain";
  }

  return customerMatch?.matchedOn ?? "none";
}

function findCustomerOwnershipMatch(
  item: ProcessedEmail,
  customers: SavedCustomer[],
): CustomerOwnershipMatch | undefined {
  const customerMatch = item.customerMatch ?? findCustomerMatch(item.email, customers);

  if (!customerMatch?.customerId) {
    return undefined;
  }

  const customer = customers.find(
    (candidate) => candidate.id === customerMatch.customerId,
  );

  if (!customer) {
    return undefined;
  }

  return {
    customer,
    matchType: getAssignmentMatchType(customerMatch) as Exclude<
      AssignmentResolution["matchType"],
      "none"
    >,
    matchedOn: customerMatch.matchedOn,
  };
}

function getCustomerAssignmentSource(
  matchedOn: CustomerMatch["matchedOn"],
): AssignmentResolution["assignmentSource"] {
  switch (matchedOn) {
    case "email":
      return "customer_email";
    case "domain":
      return "customer_domain";
    case "subject":
      return "customer_subject";
    case "body":
      return "customer_body";
    case "thread":
      return "customer_thread";
  }
}

function buildCustomerAssignmentResolution(options: {
  ownershipMatch: CustomerOwnershipMatch;
  reps: RepProfile[];
}): AssignmentResolution {
  const { ownershipMatch, reps } = options;
  const primaryRepId = getCustomerPrimaryOwnerId(ownershipMatch.customer);
  const assignedRepIds = getCustomerOwnerRepIds(ownershipMatch.customer);

  return buildRepAssignmentResolution({
    assignmentSource: getCustomerAssignmentSource(ownershipMatch.matchedOn),
    primaryRepId,
    assignedRepIds,
    reps,
    customerId: ownershipMatch.customer.id,
    customerName: getSavedCustomerDisplayName(ownershipMatch.customer),
    matchType: ownershipMatch.matchType,
  });
}

export function resolveCustomerOwner(
  item: ProcessedEmail,
  customers: SavedCustomer[],
): SavedCustomer | undefined {
  const customerMatch = item.customerMatch ?? findCustomerMatch(item.email, customers);

  if (!customerMatch?.customerId) {
    return undefined;
  }

  return customers.find(
    (customer) => customer.id === customerMatch.customerId,
  );
}

export function resolveCanonicalAssignment({
  threadState,
  representativeItem,
  customers,
  reps,
}: ResolveCanonicalAssignmentOptions): AssignmentResolution {
  const customerMatch =
    representativeItem.customerMatch ??
    findCustomerMatch(representativeItem.email, customers);

  if (threadState?.manualAssignment) {
    return buildRecordAssignmentResolution({
      assignmentSource: "manual",
      assignment: threadState.manualAssignment,
      reps,
      customerMatch,
    });
  }

  if (threadState?.autoAssignment) {
    return buildRecordAssignmentResolution({
      assignmentSource: "persisted",
      assignment: threadState.autoAssignment,
      reps,
      customerMatch,
    });
  }

  const ownershipMatch = findCustomerOwnershipMatch(
    representativeItem,
    customers,
  );

  if (ownershipMatch) {
    return buildCustomerAssignmentResolution({
      ownershipMatch,
      reps,
    });
  }

  return emptyAssignmentResolution({
    customerId: customerMatch?.customerId,
    customerName: customerMatch?.customerName,
    matchType: getAssignmentMatchType(customerMatch),
  });
}

export function getAssignmentRecordFromResolution(
  resolution: AssignmentResolution,
  representativeItem: ProcessedEmail,
  threadState?: ThreadWorkflowState,
): AssignmentRecord | undefined {
  if (!resolution.primaryRepId || resolution.assignmentStatus === "unassigned") {
    return undefined;
  }

  if (resolution.assignmentSource === "manual") {
    return threadState?.manualAssignment;
  }

  if (resolution.assignmentSource === "persisted") {
    return threadState?.autoAssignment;
  }

  return {
    type: "auto",
    assignedRepId: resolution.primaryRepId,
    assignedRepName: resolution.primaryRepName ?? ASSIGNED_REP_MISSING_LABEL,
    assignedAt: representativeItem.email.receivedAt,
  };
}

export function resolveAutoAssignment(
  item: ProcessedEmail,
  customers: SavedCustomer[],
  reps: RepProfile[],
  _repLoadById: ReadonlyMap<string, number> = new Map(),
): AssignmentRecord | undefined {
  const resolution = resolveCanonicalAssignment({
    representativeItem: item,
    customers,
    reps,
  });

  return getAssignmentRecordFromResolution(resolution, item);
}

export function getEffectiveAssignment(
  threadState: ThreadWorkflowState | undefined,
  representativeItem: ProcessedEmail,
  customers: SavedCustomer[],
  reps: RepProfile[],
  _repLoadById?: ReadonlyMap<string, number>,
): AssignmentRecord | undefined {
  const resolution = resolveCanonicalAssignment({
    threadState,
    representativeItem,
    customers,
    reps,
  });

  return getAssignmentRecordFromResolution(
    resolution,
    representativeItem,
    threadState,
  );
}
