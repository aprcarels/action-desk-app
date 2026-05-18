import type {
  CustomerMatch,
  EmailItem,
  ProcessedEmail,
  SavedCustomer,
} from "../types/actionDesk";
import {
  getEmailDomain,
  getCustomerOwnerRepIds,
  getCustomerPrimaryOwnerId,
  getSavedCustomerDisplayName,
  isBlockedCustomerDomain,
  normalizeCustomerDomains,
  normalizeCustomerEmail,
  normalizeCustomerEmails,
  normalizeCustomerName,
} from "./customerSettings";

type CustomerMatchOptions = {
  threadText?: string;
};

type CustomerMatchLogEvent =
  | "customerMatchByDomain"
  | "customerMatchByEmail"
  | "noCustomerMatch";

const GENERIC_CUSTOMER_NAME_WORDS = new Set([
  "a",
  "an",
  "and",
  "ap",
  "billing",
  "client",
  "company",
  "corp",
  "corporation",
  "customer",
  "customers",
  "email",
  "freight",
  "group",
  "inc",
  "invoice",
  "llc",
  "logistics",
  "order",
  "orders",
  "shipping",
  "shop",
  "store",
  "support",
  "team",
  "the",
  "usa",
  "warehouse",
]);

function normalizeText(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/\s+/g, " ")
    : "";
}

function buildThreadText(items: ProcessedEmail[]): string {
  return items
    .flatMap((item) => [
      item.email.senderName,
      item.email.senderEmail,
      item.email.subject,
      item.email.previewText,
      item.email.body,
    ])
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n");
}

function getThreadMatchGroupKey(item: ProcessedEmail): string {
  const senderEmail = normalizeCustomerEmail(item.email.senderEmail);

  return (
    item.email.workflowThreadId ??
    item.email.conversationId ??
    `sender:${senderEmail || item.email.id}`
  );
}

function buildThreadTextByGroup(items: ProcessedEmail[]): Map<string, string> {
  const groupedItems = new Map<string, ProcessedEmail[]>();

  for (const item of items) {
    const groupKey = getThreadMatchGroupKey(item);
    groupedItems.set(groupKey, [...(groupedItems.get(groupKey) ?? []), item]);
  }

  return new Map(
    Array.from(groupedItems.entries()).map(([groupKey, groupItems]) => [
      groupKey,
      buildThreadText(groupItems),
    ]),
  );
}

function isNameMatchCandidate(customerName: string): boolean {
  const normalizedName = normalizeText(customerName);

  if (normalizedName.length < 3) {
    return false;
  }

  const words = normalizedName
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);

  if (words.length === 0) {
    return false;
  }

  if (
    words.length === 1 &&
    (words[0].length < 3 || GENERIC_CUSTOMER_NAME_WORDS.has(words[0]))
  ) {
    return false;
  }

  return words.some((word) => !GENERIC_CUSTOMER_NAME_WORDS.has(word));
}

function isAlphaNumeric(value: string): boolean {
  return /^[a-z0-9]$/.test(value);
}

function includesExactPhrase(haystack: string, phrase: string): boolean {
  if (!haystack || !phrase) {
    return false;
  }

  let index = haystack.indexOf(phrase);

  while (index >= 0) {
    const before = index > 0 ? haystack[index - 1] : "";
    const afterIndex = index + phrase.length;
    const after = afterIndex < haystack.length ? haystack[afterIndex] : "";
    const startsAtBoundary = !before || !isAlphaNumeric(before);
    const endsAtBoundary = !after || !isAlphaNumeric(after);

    if (startsAtBoundary && endsAtBoundary) {
      return true;
    }

    index = haystack.indexOf(phrase, index + phrase.length);
  }

  return false;
}

function findNameMatchInText(
  text: string,
  customers: SavedCustomer[],
  matchedOn: CustomerMatch["matchedOn"],
  matchedValue: string,
): CustomerMatch | undefined {
  const normalizedText = normalizeText(text);

  if (!normalizedText) {
    return undefined;
  }

  for (const customer of customers) {
    const customerName = normalizeCustomerName(customer.name);
    const normalizedCustomerName = normalizeText(customerName);

    if (
      isNameMatchCandidate(customerName) &&
      includesExactPhrase(normalizedText, normalizedCustomerName)
    ) {
      return buildMatch(customer, matchedOn, matchedValue);
    }
  }

  return undefined;
}

function buildMatch(
  customer: SavedCustomer,
  matchedOn: CustomerMatch["matchedOn"],
  matchedValue: string,
): CustomerMatch {
  const ownerRepId = getCustomerPrimaryOwnerId(customer);
  const ownerRepIds = getCustomerOwnerRepIds(customer);
  const match: CustomerMatch = {
    customerId: customer.id,
    customerName: getSavedCustomerDisplayName(customer),
    matchedOn,
    matchedValue,
  };

  if (ownerRepId) {
    match.ownerRepId = ownerRepId;
  }

  if (ownerRepIds.length > 0) {
    match.ownerRepIds = ownerRepIds;
  }

  if (customer.assignedCSRs && customer.assignedCSRs.length > 0) {
    match.assignedCSRs = customer.assignedCSRs;
  }

  return match;
}

function getCustomerMatchEmails(customer: SavedCustomer): string[] {
  return normalizeCustomerEmails([
    customer.email,
    ...normalizeCustomerEmails(customer.emails ?? []),
  ]);
}

function getCustomerMatchDomains(customer: SavedCustomer): string[] {
  return normalizeCustomerDomains([
    customer.domain,
    ...normalizeCustomerDomains(customer.domains ?? []),
  ]);
}

function logCustomerMatch(event: CustomerMatchLogEvent, input: {
  email: EmailItem;
  customer?: SavedCustomer;
  matchedValue?: string;
  senderDomain?: string;
}) {
  console.info(`[Action Desk diagnostics] ${event}`, {
    emailId: input.email.id,
    senderEmail: normalizeCustomerEmail(input.email.senderEmail) || undefined,
    senderDomain: input.senderDomain || getEmailDomain(input.email.senderEmail) || undefined,
    customerId: input.customer?.id,
    customerName: input.customer
      ? getSavedCustomerDisplayName(input.customer)
      : undefined,
    matchedValue: input.matchedValue,
  });
}

export function getCustomerMatchSourceLabel(
  matchedOn: CustomerMatch["matchedOn"],
): string {
  switch (matchedOn) {
    case "email":
      return "Email";
    case "domain":
      return "Domain";
    case "subject":
      return "Subject";
    case "body":
      return "Body";
    case "thread":
      return "Thread";
  }
}

export function findCustomerMatch(
  email: EmailItem,
  customers: SavedCustomer[],
  options?: CustomerMatchOptions,
): CustomerMatch | undefined {
  const safeCustomers = Array.isArray(customers) ? customers : [];

  if (safeCustomers.length === 0) {
    logCustomerMatch("noCustomerMatch", {
      email,
      senderDomain: getEmailDomain(email.senderEmail),
    });
    return undefined;
  }

  const senderEmail = normalizeCustomerEmail(email.senderEmail);
  const senderDomain = getEmailDomain(email.senderEmail);
  const bodyText = [email.body, email.previewText].filter(Boolean).join("\n");

  if (senderDomain && !isBlockedCustomerDomain(senderDomain)) {
    for (const customer of safeCustomers) {
      const matchingDomain = getCustomerMatchDomains(customer).find(
        (customerDomain) =>
          !isBlockedCustomerDomain(customerDomain) && customerDomain === senderDomain,
      );

      if (matchingDomain) {
        logCustomerMatch("customerMatchByDomain", {
          email,
          customer,
          matchedValue: matchingDomain,
          senderDomain,
        });
        return buildMatch(customer, "domain", matchingDomain);
      }
    }
  }

  if (senderEmail) {
    for (const customer of safeCustomers) {
      const exactEmailMatch = getCustomerMatchEmails(customer).find(
        (customerEmail) => customerEmail === senderEmail,
      );

      if (exactEmailMatch) {
        logCustomerMatch("customerMatchByEmail", {
          email,
          customer,
          matchedValue: exactEmailMatch,
          senderDomain,
        });
        return buildMatch(customer, "email", exactEmailMatch);
      }
    }
  }

  const subjectMatch = findNameMatchInText(
    email.subject,
    safeCustomers,
    "subject",
    email.subject,
  );

  if (subjectMatch) {
    return subjectMatch;
  }

  const bodyMatch = findNameMatchInText(
    bodyText,
    safeCustomers,
    "body",
    bodyText,
  );

  if (bodyMatch) {
    return bodyMatch;
  }

  const threadMatch = findNameMatchInText(
    options?.threadText ?? "",
    safeCustomers,
    "thread",
    options?.threadText ?? "",
  );

  if (threadMatch) {
    return threadMatch;
  }

  logCustomerMatch("noCustomerMatch", {
    email,
    senderDomain,
  });
  return undefined;
}

export function applyCustomerPriorityToEmail(
  item: ProcessedEmail,
  customers: SavedCustomer[],
  options?: CustomerMatchOptions,
): ProcessedEmail {
  const customerMatch = findCustomerMatch(item.email, customers, options);

  if (!customerMatch) {
    if (!item.isCustomerPriority && !item.customerMatch) {
      return item;
    }

    return {
      ...item,
      isCustomerPriority: undefined,
      customerMatch: undefined,
    };
  }

  return {
    ...item,
    isCustomerPriority: true,
    customerMatch,
  };
}

export function applyCustomerPriorityToEmails(
  items: ProcessedEmail[],
  customers: SavedCustomer[],
): ProcessedEmail[] {
  const threadTextByGroup = buildThreadTextByGroup(items);

  return items.map((item) =>
    applyCustomerPriorityToEmail(item, customers, {
      threadText: threadTextByGroup.get(getThreadMatchGroupKey(item)),
    }),
  );
}
