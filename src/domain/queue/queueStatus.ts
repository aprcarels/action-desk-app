export type QueueWorkStatus =
  | "active"
  | "in_progress"
  | "waiting_on_customer"
  | "waiting_on_internal"
  | "snoozed"
  | "done"
  | "not_relevant"
  | "escalated";
