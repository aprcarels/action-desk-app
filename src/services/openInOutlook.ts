import type { EmailItem, ProcessedEmail } from "../types/actionDesk";

const MISSING_EXACT_MESSAGE_LINK_MESSAGE =
  "We could not open this exact message in Outlook. Please search your Outlook inbox for this subject.";

export type OutlookOpenTarget =
  | {
      type: "exact";
      url: string;
    }
  | {
      type: "missing_exact_link";
      message: string;
    };

function getEmailSource(email: EmailItem | ProcessedEmail): EmailItem {
  return "email" in email ? email.email : email;
}

export function hasExactOutlookMessageLink(
  email: EmailItem | ProcessedEmail,
): boolean {
  return Boolean(getEmailSource(email).outlookWebLink?.trim());
}

export function getOpenInOutlookFallbackMessage(): string {
  return MISSING_EXACT_MESSAGE_LINK_MESSAGE;
}

export function getOutlookOpenTarget(
  email: EmailItem | ProcessedEmail,
): OutlookOpenTarget {
  const emailSource = getEmailSource(email);
  const exactLink = emailSource.outlookWebLink?.trim();

  if (exactLink) {
    return {
      type: "exact",
      url: exactLink,
    };
  }

  return {
    type: "missing_exact_link",
    message: MISSING_EXACT_MESSAGE_LINK_MESSAGE,
  };
}
