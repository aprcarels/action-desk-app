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
  normalizeCustomerName,
} from "./customerSettings";

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
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

export function getCustomerMatchSourceLabel(
  matchedOn: CustomerMatch["matchedOn"],
): string {
  switch (matchedOn) {
    case "sender_email":
      return "Sender Email";
    case "sender_domain":
      return "Sender Domain";
    case "sender_name":
      return "Sender Name";
    case "subject":
      return "Subject";
    case "body":
      return "Body";
  }
}

export function findCustomerMatch(
  email: EmailItem,
  customers: SavedCustomer[],
): CustomerMatch | undefined {
  if (customers.length === 0) {
    return undefined;
  }

  const senderEmail = normalizeCustomerEmail(email.senderEmail);
  const senderDomain = getEmailDomain(email.senderEmail);
  const senderName = normalizeText(email.senderName);
  const subject = normalizeText(email.subject);
  const body = normalizeText(email.body);

  for (const customer of customers) {
    const exactEmailMatch = customer.emails.find(
      (customerEmail) => normalizeCustomerEmail(customerEmail) === senderEmail,
    );

    if (exactEmailMatch) {
      return buildMatch(customer, "sender_email", exactEmailMatch);
    }
  }

  if (senderDomain && !isBlockedCustomerDomain(senderDomain)) {
    for (const customer of customers) {
      const matchingDomain = normalizeCustomerDomains(customer.domains).find(
        (customerDomain) =>
          !isBlockedCustomerDomain(customerDomain) && customerDomain === senderDomain,
      );

      if (matchingDomain) {
        return buildMatch(customer, "sender_domain", matchingDomain);
      }
    }
  }

  for (const customer of customers) {
    const customerName = normalizeCustomerName(customer.name).toLowerCase();

    if (customerName.length > 0 && senderName.includes(customerName)) {
      return buildMatch(customer, "sender_name", email.senderName);
    }
  }

  for (const customer of customers) {
    const customerName = normalizeCustomerName(customer.name).toLowerCase();

    if (customerName.length > 0 && subject.includes(customerName)) {
      return buildMatch(customer, "subject", email.subject);
    }
  }

  for (const customer of customers) {
    const customerName = normalizeCustomerName(customer.name).toLowerCase();

    if (customerName.length > 0 && body.includes(customerName)) {
      return buildMatch(customer, "body", email.body);
    }
  }

  return undefined;
}

export function applyCustomerPriorityToEmail(
  item: ProcessedEmail,
  customers: SavedCustomer[],
): ProcessedEmail {
  const customerMatch = findCustomerMatch(item.email, customers);

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
  return items.map((item) => applyCustomerPriorityToEmail(item, customers));
}
