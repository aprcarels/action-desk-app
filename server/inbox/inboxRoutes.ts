import type { InboxRepository } from "./inboxRepository";
import { OutlookGraphInboxRepository } from "./outlookGraphInboxRepository";

type MiddlewareRequest = {
  headers?: {
    authorization?: string;
  };
  method?: string;
  url?: string;
};

type MiddlewareResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(chunk?: string): void;
};

function getRequestQuery(urlValue: string) {
  return new URL(urlValue, "https://localhost");
}

function getListOptions(requestUrl: URL, authorization?: string) {
  const cursor = requestUrl.searchParams.get("cursor") ?? undefined;
  const rawLimit = requestUrl.searchParams.get("limit");
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;
  const limit = parsedLimit !== undefined && Number.isNaN(parsedLimit) ? undefined : parsedLimit;

  return {
    authorization,
    cursor,
    limit,
  };
}

export async function handleInboxMessagesRequest(
  req: MiddlewareRequest,
  res: MiddlewareResponse,
  repository: InboxRepository = new OutlookGraphInboxRepository(),
) {
  if (!req.url) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Invalid inbox request." }));
    return;
  }

  try {
    const requestUrl = getRequestQuery(req.url);
    const payload = await repository.listMessages(
      getListOptions(requestUrl, req.headers?.authorization),
    );

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(payload));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inbox messages request failed.";
    const statusCode = /missing outlook authorization token/i.test(message) ? 401 : 502;

    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: message }));
  }
}
