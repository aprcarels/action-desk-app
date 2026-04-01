const REPLY_HEADER_PATTERN = /^(from|sent|to|cc|subject):\s/i;
const ORIGINAL_MESSAGE_PATTERN = /^-+\s*original message\s*-+$/i;
const ON_WROTE_PATTERN = /^on .+wrote:$/i;
const SIGNATURE_MARKER_PATTERN =
  /^(thanks[,]?|thank you[,]?|best[,]?|best regards[,]?|regards[,]?|sincerely[,]?|cheers[,]?|--|sent from my (iphone|ipad|android))/i;
const DISCLAIMER_PATTERN =
  /(confidential|intended only for|privileged|unauthorized|do not distribute|virus|opinions expressed)/i;

function findReplyChainStart(lines: string[]) {
  for (let index = 1; index < lines.length; index += 1) {
    const trimmedLine = lines[index].trim();

    if (!trimmedLine) {
      continue;
    }

    if (ORIGINAL_MESSAGE_PATTERN.test(trimmedLine) || ON_WROTE_PATTERN.test(trimmedLine)) {
      return index;
    }

    if (REPLY_HEADER_PATTERN.test(trimmedLine)) {
      const lookaheadLines = lines
        .slice(index, Math.min(index + 6, lines.length))
        .map((line) => line.trim())
        .filter(Boolean);
      const headerCount = lookaheadLines.filter((line) => REPLY_HEADER_PATTERN.test(line)).length;

      if (headerCount >= 2) {
        return index;
      }
    }
  }

  return -1;
}

function removeTrailingDisclaimer(lines: string[]) {
  const startIndex = Math.max(Math.floor(lines.length * 0.5), 0);

  for (let index = startIndex; index < lines.length; index += 1) {
    if (DISCLAIMER_PATTERN.test(lines[index])) {
      return lines.slice(0, index);
    }
  }

  return lines;
}

function removeTrailingSignature(lines: string[]) {
  const startIndex = Math.max(Math.floor(lines.length * 0.5), 0);

  for (let index = startIndex; index < lines.length; index += 1) {
    const trimmedLine = lines[index].trim();

    if (!trimmedLine) {
      continue;
    }

    if (SIGNATURE_MARKER_PATTERN.test(trimmedLine) && lines.length - index <= 6) {
      return lines.slice(0, index);
    }
  }

  return lines;
}

export function cleanEmailText(raw: string): string {
  const normalizedRaw = raw.replace(/\r\n?/g, "\n").trim();

  if (!normalizedRaw) {
    return raw;
  }

  let lines = normalizedRaw.split("\n");
  const replyChainStart = findReplyChainStart(lines);

  if (replyChainStart > 0) {
    lines = lines.slice(0, replyChainStart);
  }

  lines = removeTrailingDisclaimer(lines);
  lines = removeTrailingSignature(lines);

  const cleaned = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned.length > 0 ? cleaned : raw.trim();
}
