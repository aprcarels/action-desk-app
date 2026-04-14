import type { EmailItem, ProcessedEmail } from "../types/actionDesk";

function getEmailSource(email: EmailItem | ProcessedEmail): EmailItem {
  return "email" in email ? email.email : email;
}

function getSearchParts(email: EmailItem): string[] {
  const subject = email.subject.trim();
  const sender = email.senderEmail.trim() || email.senderName.trim();
  const parts: string[] = [];

  if (subject) {
    parts.push(`subject:"${subject}"`);
  }

  if (sender) {
    parts.push(`from:"${sender}"`);
  }

  return parts;
}

export function canOpenInOutlook(email: EmailItem | ProcessedEmail): boolean {
  return getSearchParts(getEmailSource(email)).length > 0;
}

export function buildOutlookSearchUrl(email: EmailItem | ProcessedEmail): string {
  const parts = getSearchParts(getEmailSource(email));

  return `https://outlook.office.com/mail/?search=${encodeURIComponent(parts.join(" "))}`;
}
