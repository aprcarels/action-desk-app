import type { ProcessedEmail } from "../types/actionDesk";

export function getOutlookReplyDraftText(item?: ProcessedEmail): string {
  if (!item || item.status !== "processed") {
    return "";
  }

  return item.result?.replyDraft ?? "";
}

export function hasOutlookReplyDraftText(replyText: string): boolean {
  return replyText.trim().length > 0;
}
