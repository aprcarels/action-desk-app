import type { EmailItem } from "../types/actionDesk";

const SUBJECT_MARKER = "Action Desk Subject:";
const BODY_MARKER = "Action Desk Body:";

export function buildAnalysisInput(email: Pick<EmailItem, "subject" | "body">): string {
  const subject = email.subject.trim();
  const body = email.body.trim();

  if (!subject) {
    return body;
  }

  return `${SUBJECT_MARKER} ${subject}\n${BODY_MARKER}\n${body}`;
}

export function parseAnalysisInput(email: string): {
  subject: string;
  body: string;
  fullText: string;
} {
  const normalizedEmail = email.replace(/\r/g, "");

  if (!normalizedEmail.startsWith(SUBJECT_MARKER)) {
    return {
      subject: "",
      body: normalizedEmail,
      fullText: normalizedEmail,
    };
  }

  const bodyMarkerIndex = normalizedEmail.indexOf(`\n${BODY_MARKER}\n`);

  if (bodyMarkerIndex === -1) {
    return {
      subject: normalizedEmail.slice(SUBJECT_MARKER.length).trim(),
      body: "",
      fullText: normalizedEmail,
    };
  }

  const subject = normalizedEmail
    .slice(SUBJECT_MARKER.length, bodyMarkerIndex)
    .trim();
  const body = normalizedEmail
    .slice(bodyMarkerIndex + `\n${BODY_MARKER}\n`.length)
    .trim();

  return {
    subject,
    body,
    fullText: [subject, body].filter(Boolean).join("\n"),
  };
}
