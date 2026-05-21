import type { IntentCode, RiskCode } from "../types/actionDesk";

export const INTENT_LABELS: Record<IntentCode, string> = {
  where_is_my_order: "Where Is My Order",
  pod_request: "POD Request",
  cancellation_request: "Cancellation Request",
  short_shipment: "Short Shipment",
  damaged_shipment: "Damaged Shipment",
  address_change: "Address Change",
  billing_question: "Billing Question",
  missed_pickups_report: "Missed Pickups Report",
  operational_exception: "Operational Exception",
  operational_confirmation: "Operational Confirmation",
  operational_logistics_scheduling: "Operational Logistics Scheduling",
  routing_coordination: "Routing Coordination",
  carrier_pickup_scheduling: "Carrier Pickup Scheduling",
  general_support: "General Support",
};

export const RISK_LABELS: Record<RiskCode, string> = {
  delay_or_no_tracking_update: "Delay or no recent tracking update.",
  customer_frustration: "Customer sounds frustrated and may need a prompt, clear response.",
  delivered_not_received: "Tracking may show delivered but the customer reports it was not received.",
  pod_needed: "Customer needs proof of delivery or delivery confirmation.",
  cancellation_review_needed: "Order may need cancellation review before it ships.",
  missing_items_reported: "Customer reports missing items or a short shipment.",
  damage_reported: "Shipment damage may require replacement or claim review.",
  address_correction_needed: "Shipping address may need correction before delivery progresses.",
  duplicate_shipment_possible: "A duplicate shipment may have been released.",
  billing_discrepancy: "Billing or invoice details may need review.",
};

const INTENT_ALIASES: Record<string, IntentCode> = {
  where_is_my_order: "where_is_my_order",
  order_status_request: "where_is_my_order",
  missing_order_number: "where_is_my_order",
  proof_of_delivery_request: "pod_request",
  pod_request: "pod_request",
  cancellation_request: "cancellation_request",
  short_shipment: "short_shipment",
  damaged_shipment: "damaged_shipment",
  address_change: "address_change",
  address_change_request: "address_change",
  billing_question: "billing_question",
  missed_pickups_report: "missed_pickups_report",
  missed_pickup_report: "missed_pickups_report",
  missed_pickups: "missed_pickups_report",
  pickup_exception: "operational_exception",
  pickup_exceptions: "operational_exception",
  operational_exception: "operational_exception",
  operational_exceptions: "operational_exception",
  shipment_exception: "operational_exception",
  shipment_exceptions: "operational_exception",
  operational_confirmation: "operational_confirmation",
  logistics_confirmation: "operational_confirmation",
  operational_logistics_scheduling: "operational_logistics_scheduling",
  logistics_scheduling: "operational_logistics_scheduling",
  operational_scheduling: "operational_logistics_scheduling",
  routing_coordination: "routing_coordination",
  carrier_pickup_scheduling: "carrier_pickup_scheduling",
  carrier_pickup: "carrier_pickup_scheduling",
  pickup_scheduling: "carrier_pickup_scheduling",
  general_support: "general_support",
  general_support_request: "general_support",
  duplicate_shipment_concern: "general_support",
  internal_operational_update: "general_support",
  operational_report: "general_support",
  no_action_needed: "general_support",
  not_relevant: "general_support",
  sales_outreach: "general_support",
  vendor_solicitation: "general_support",
  vendor_sales_outreach: "general_support",
};

const RISK_ALIASES: Record<string, RiskCode | null> = {
  delay_or_no_tracking_update: "delay_or_no_tracking_update",
  customer_frustration: "customer_frustration",
  delivered_not_received: "delivered_not_received",
  pod_needed: "pod_needed",
  cancellation_review_needed: "cancellation_review_needed",
  missing_items_reported: "missing_items_reported",
  damage_reported: "damage_reported",
  address_correction_needed: "address_correction_needed",
  duplicate_shipment_possible: "duplicate_shipment_possible",
  billing_discrepancy: "billing_discrepancy",
  customer_reports_a_delay_or_no_recent_shipment_updates: "delay_or_no_tracking_update",
  customer_is_frustrated_and_may_need_a_fast_clear_response: "customer_frustration",
  shipment_may_be_missing_after_marked_delivery: "delivered_not_received",
  customer_needs_delivery_documentation_for_confirmation_or_claim_handling: "pod_needed",
  order_may_need_cancellation_review_before_additional_processing_or_shipment:
    "cancellation_review_needed",
  customer_reports_a_short_shipment_or_missing_items: "missing_items_reported",
  shipment_may_require_damage_review_replacement_or_claim_handling: "damage_reported",
  shipping_address_may_need_to_be_corrected_before_delivery_progresses:
    "address_correction_needed",
  customer_may_have_received_or_expects_a_duplicate_shipment: "duplicate_shipment_possible",
  customer_has_a_billing_or_invoice_discrepancy_that_needs_review: "billing_discrepancy",
};

function toTaxonomyKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function normalizeIntent(value: string): IntentCode {
  return INTENT_ALIASES[toTaxonomyKey(value)] ?? "general_support";
}

export function normalizeRisks(values: string[]): RiskCode[] {
  const normalized = values.flatMap((value) => {
    const match = RISK_ALIASES[toTaxonomyKey(value)];
    return match ? [match] : [];
  });

  return Array.from(new Set(normalized));
}

export function getIntentLabel(intent: IntentCode): string {
  return INTENT_LABELS[intent];
}

export function getRiskLabel(risk: RiskCode): string {
  return RISK_LABELS[risk];
}
