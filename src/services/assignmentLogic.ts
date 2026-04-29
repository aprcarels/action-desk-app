import type {
  AssignmentRecord,
  ProcessedEmail,
  RepProfile,
  SavedCustomer,
  ThreadWorkflowState,
} from "../types/actionDesk";
import {
  getCustomerOwnerRepIds,
  getCustomerPrimaryOwnerId,
} from "./customerSettings";
import { findCustomerMatch } from "./customerMatching";

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

export function resolveAutoAssignment(
  item: ProcessedEmail,
  customers: SavedCustomer[],
  reps: RepProfile[],
  repLoadById: ReadonlyMap<string, number> = new Map(),
): AssignmentRecord | undefined {
  const customerMatch = item.customerMatch ?? findCustomerMatch(item.email, customers);
  const customerOwner =
    resolveCustomerOwner(item, customers) ??
    (customerMatch?.ownerRepId
      ? customers.find(
          (customer) => customer.ownerRepId === customerMatch.ownerRepId,
        )
      : undefined);
  const primaryOwnerRepId = customerOwner
    ? getCustomerPrimaryOwnerId(customerOwner)
    : customerMatch?.ownerRepId;
  const activeOwnerRepIds = customerOwner
    ? getCustomerOwnerRepIds(customerOwner)
    : customerMatch?.ownerRepIds ?? (primaryOwnerRepId ? [primaryOwnerRepId] : []);
  const activeReps = activeOwnerRepIds
    .map((repId) => reps.find((candidate) => candidate.id === repId))
    .filter(
      (candidate): candidate is RepProfile =>
        candidate !== undefined && candidate.isActive !== false,
    );
  const primaryRep = primaryOwnerRepId
    ? activeReps.find((candidate) => candidate.id === primaryOwnerRepId)
    : undefined;
  const rep =
    primaryRep ??
    activeReps.sort((left, right) => {
      const loadDifference =
        (repLoadById.get(left.id) ?? 0) - (repLoadById.get(right.id) ?? 0);

      if (loadDifference !== 0) {
        return loadDifference;
      }

      return left.name.localeCompare(right.name);
    })[0];

  if (!rep) {
    return undefined;
  }

  return {
    type: "auto",
    assignedRepId: rep.id,
    assignedRepName: rep.name,
    assignedAt: item.email.receivedAt,
  };
}

export function getEffectiveAssignment(
  threadState: ThreadWorkflowState | undefined,
  representativeItem: ProcessedEmail,
  customers: SavedCustomer[],
  reps: RepProfile[],
  repLoadById?: ReadonlyMap<string, number>,
): AssignmentRecord | undefined {
  if (threadState?.manualAssignment) {
    return threadState.manualAssignment;
  }

  return resolveAutoAssignment(representativeItem, customers, reps, repLoadById);
}
