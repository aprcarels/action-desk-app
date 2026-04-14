export type PriorityBand = "critical" | "high" | "normal" | "low";

export type QueuePriorityReason =
  | "new_unread"
  | "customer_follow_up"
  | "aging_unanswered"
  | "sla_risk"
  | "delivery_exception"
  | "missing_tracking"
  | "damaged_order"
  | "refund_request"
  | "angry_tone"
  | "manual_escalation"
  | "vip_customer";
