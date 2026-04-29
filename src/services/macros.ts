import { generateReply } from "./generateReply";
import type {
  EmailAnalysis,
  ProcessedEmail,
  WorkflowStatus,
} from "../types/actionDesk";

export type MacroId =
  | "request_order_number"
  | "mark_waiting_on_customer"
  | "delivered_not_received"
  | "send_pod_guidance"
  | "acknowledge_delay"
  | "cancellation_needs_review"
  | "address_change_review"
  | "billing_follow_up"
  | "close_as_resolved";

export type MacroDefinition = {
  id: MacroId;
  label: string;
  description: string;
  effects: {
    setReplyDraft: boolean;
    setStatus?: WorkflowStatus;
    logReply: boolean;
  };
};

export type AppliedMacroResult = {
  macro: MacroDefinition;
  replyDraft?: string;
  status?: WorkflowStatus;
  logReply: boolean;
};

const MACROS: MacroDefinition[] = [
  {
    id: "request_order_number",
    label: "Request Order Number",
    description: "Draft a missing-info reply and wait on the customer.",
    effects: {
      setReplyDraft: true,
      setStatus: "waiting_on_customer",
      logReply: false,
    },
  },
  {
    id: "mark_waiting_on_customer",
    label: "Mark Waiting on Customer",
    description: "Move the thread to Waiting on Customer.",
    effects: {
      setReplyDraft: false,
      setStatus: "waiting_on_customer",
      logReply: false,
    },
  },
  {
    id: "delivered_not_received",
    label: "Delivered Not Received",
    description: "Draft delivered-not-received guidance and wait on the customer.",
    effects: {
      setReplyDraft: true,
      setStatus: "waiting_on_customer",
      logReply: false,
    },
  },
  {
    id: "send_pod_guidance",
    label: "Send POD Guidance",
    description: "Draft proof-of-delivery guidance and wait on the customer.",
    effects: {
      setReplyDraft: true,
      setStatus: "waiting_on_customer",
      logReply: false,
    },
  },
  {
    id: "acknowledge_delay",
    label: "Acknowledge Delay",
    description: "Draft a delay update and keep the thread in progress.",
    effects: {
      setReplyDraft: true,
      setStatus: "in_progress",
      logReply: false,
    },
  },
  {
    id: "cancellation_needs_review",
    label: "Cancellation Needs Review",
    description: "Draft a cancellation review reply and keep the thread in progress.",
    effects: {
      setReplyDraft: true,
      setStatus: "in_progress",
      logReply: false,
    },
  },
  {
    id: "address_change_review",
    label: "Address Change Review",
    description: "Draft address-change review guidance and keep the thread in progress.",
    effects: {
      setReplyDraft: true,
      setStatus: "in_progress",
      logReply: false,
    },
  },
  {
    id: "billing_follow_up",
    label: "Billing Follow-Up",
    description: "Draft a billing follow-up and wait on the customer.",
    effects: {
      setReplyDraft: true,
      setStatus: "waiting_on_customer",
      logReply: false,
    },
  },
  {
    id: "close_as_resolved",
    label: "Close as Resolved",
    description: "Move the thread to Resolved.",
    effects: {
      setReplyDraft: false,
      setStatus: "resolved",
      logReply: false,
    },
  },
];

export function getBuiltInMacros(): MacroDefinition[] {
  return MACROS.map((macro) => ({
    ...macro,
    effects: { ...macro.effects },
  }));
}

export function getMacroById(macroId: string): MacroDefinition | undefined {
  return getBuiltInMacros().find((macro) => macro.id === macroId);
}

export function applyBuiltInMacro(
  item: ProcessedEmail,
  macroId: MacroId,
): AppliedMacroResult | undefined {
  const macro = getMacroById(macroId);

  if (!macro) {
    return undefined;
  }

  return {
    macro,
    replyDraft: macro.effects.setReplyDraft
      ? buildMacroReplyDraft(item, macro.id)
      : undefined,
    status: macro.effects.setStatus,
    logReply: macro.effects.logReply,
  };
}

function buildMacroReplyDraft(
  item: ProcessedEmail,
  macroId: MacroId,
): string {
  const baseAnalysis = item.result?.analysis;

  if (!baseAnalysis) {
    return "";
  }

  return generateReply(
    buildMacroAnalysis(baseAnalysis, macroId),
    item.result?.orderContext,
  );
}

function buildMacroAnalysis(
  analysis: EmailAnalysis,
  macroId: MacroId,
): EmailAnalysis {
  const actionableAnalysis: EmailAnalysis = {
    ...analysis,
    messageType: "customer_request",
    actionability: "action_required",
    replyNeeded: "yes",
    workType: "customer_support",
    hasClearRequest: true,
    isThreadContinuation: false,
  };

  switch (macroId) {
    case "request_order_number":
      return {
        ...actionableAnalysis,
        intent: "where_is_my_order",
        orderNumber: undefined,
        caseIdentifiers: [],
      };
    case "delivered_not_received":
      return {
        ...actionableAnalysis,
        intent: "where_is_my_order",
        risks: Array.from(
          new Set([...actionableAnalysis.risks, "delivered_not_received"]),
        ),
      };
    case "send_pod_guidance":
      return {
        ...actionableAnalysis,
        intent: "pod_request",
      };
    case "acknowledge_delay":
      return {
        ...actionableAnalysis,
        intent: "where_is_my_order",
        risks: Array.from(
          new Set([...actionableAnalysis.risks, "delay_or_no_tracking_update"]),
        ),
      };
    case "cancellation_needs_review":
      return {
        ...actionableAnalysis,
        intent: "cancellation_request",
      };
    case "address_change_review":
      return {
        ...actionableAnalysis,
        intent: "address_change",
      };
    case "billing_follow_up":
      return {
        ...actionableAnalysis,
        intent: "billing_question",
      };
    case "mark_waiting_on_customer":
    case "close_as_resolved":
      return actionableAnalysis;
  }
}
