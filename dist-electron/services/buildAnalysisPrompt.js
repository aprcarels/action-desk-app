"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAnalysisPrompt = buildAnalysisPrompt;
function buildAnalysisPrompt(email) {
    return `You are a customer service execution assistant.

Analyze the customer email below and return valid JSON only.
Do not return markdown.
Do not include explanations, labels, or extra commentary.

Your job is to identify:
- order status questions
- missing order numbers
- delivery issues
- delay concerns
- frustration signals

Return JSON with exactly these fields:
{
  "summary": string,
  "intent": "where_is_my_order" | "pod_request" | "cancellation_request" | "short_shipment" | "damaged_shipment" | "address_change" | "billing_question" | "operational_confirmation" | "operational_logistics_scheduling" | "routing_coordination" | "carrier_pickup_scheduling" | "general_support",
  "urgency": "low" | "medium" | "high",
  "confidence": "low" | "medium" | "high",
  "orderNumber": string | null,
  "risks": string[],
  "nextAction": string
}

Instructions:
- Keep summary concise and actionable.
- Make nextAction practical for a support representative.
- Use only the allowed intent values above.
- Use "general_support" instead of "where_is_my_order" for automated alerts, FYI messages, or informational notices unless the email clearly asks for shipment help.
- Use "general_support" for vendor sales outreach, cold outreach, demo requests, pricing/ROI pitches, or messages pitching a product/service. Do not infer "where_is_my_order" from sales language about numbers, recovery, logistics, tracking, devices, shipping, or cost unless the sender clearly asks for help with their own order or shipment.
- Use "general_support" for internal EOD/status reports, Excel tracking summaries, orders-on-track rollups, or rollover-to-tomorrow notes. These are internal operational updates, not customer order-status requests, unless the latest message clearly asks customer service to act.
- Use "operational_logistics_scheduling" for scheduled loads, MPU/Multi Pick Up notices, stop times, carrier pickup dates, pickup numbers, CDD, TONU/OTIF warnings, routing status, or loading/transit timing details.
- Use "routing_coordination" or "carrier_pickup_scheduling" only when those are the clearest specific fit.
- Do not use "billing_question" just because a scheduling/routing email says charges, fees, TONU, or OTIF may apply. Use billing only when the sender actually asks about billing, refund, payment, invoice, credit, or a charge discrepancy.
- For risks, prefer these normalized values when relevant: "delay_or_no_tracking_update", "customer_frustration", "delivered_not_received", "pod_needed", "cancellation_review_needed", "missing_items_reported", "damage_reported", "address_correction_needed", "duplicate_shipment_possible", "billing_discrepancy".
- Include risks only when they are supported by the email.
- If no order number is present, use null for orderNumber.
- Return valid JSON only.

Customer email:
"""
${email}
"""`;
}
