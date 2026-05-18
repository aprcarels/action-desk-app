const http = require("node:http");
const https = require("node:https");

const DEFAULT_BACKEND_TIMEOUT_MS = 15000;
const RETRY_DELAYS_MS = [250, 750];
const TRANSIENT_NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
]);
const TRANSIENT_NETWORK_ERROR_MESSAGES = [
  "fetch failed",
  "socket hang up",
];

const SECRET_QUERY_KEYS = new Set([
  "access_token",
  "authCode",
  "clientState",
  "code",
  "id_token",
  "refresh_token",
  "sessionId",
  "state",
  "token",
]);

function normalizeApiUrl(value) {
  const normalized = String(value || "").trim().replace(/\/+$/, "");

  if (!normalized) {
    throw new Error("ACTION_DESK_API_URL is not configured.");
  }

  try {
    return new URL(normalized).origin;
  } catch {
    throw new Error("ACTION_DESK_API_URL must be a valid absolute URL.");
  }
}

function getActionDeskApiUrl() {
  return normalizeApiUrl(process.env.ACTION_DESK_API_URL);
}

function getLogger(options = {}) {
  return options.logger ?? {
    info(scope, message, metadata) {
      console.log(`[Action Desk][${scope}] ${message}`, metadata ?? "");
    },
    warn(scope, message, metadata) {
      console.warn(`[Action Desk][${scope}] ${message}`, metadata ?? "");
    },
    error(scope, message, metadata) {
      console.error(`[Action Desk][${scope}] ${message}`, metadata ?? "");
    },
  };
}

function sanitizeUrlForLog(url) {
  const safeUrl = new URL(url.toString());

  for (const key of Array.from(safeUrl.searchParams.keys())) {
    if (SECRET_QUERY_KEYS.has(key) || /token|secret|code|state|session/i.test(key)) {
      safeUrl.searchParams.set(key, "[redacted]");
    }
  }

  return safeUrl.toString();
}

function createBackendApiError(input) {
  const error = new Error(input.message || "The Action Desk backend request failed.");
  error.code = input.code || "backend_api_error";
  error.statusCode = input.statusCode;
  error.retryable = input.retryable ?? false;
  error.context = input.context;
  error.details = input.details;
  return error;
}

function getNetworkErrorDetails(error) {
  const cause = error?.cause;

  return {
    errorName: error instanceof Error ? error.name : undefined,
    errorCode: error?.code,
    errorMessage: error instanceof Error ? error.message : String(error),
    causeCode: cause?.code ?? error?.code,
    causeMessage:
      cause instanceof Error
        ? cause.message
        : error instanceof Error
          ? error.message
          : String(error),
    causeErrno: cause?.errno ?? error?.errno,
    causeSyscall: cause?.syscall ?? error?.syscall,
    causeAddress: cause?.address ?? error?.address,
    causePort: cause?.port ?? error?.port,
  };
}

function getRetryLimitForMethod(method) {
  const normalizedMethod = String(method || "GET").toUpperCase();

  if (normalizedMethod === "GET") {
    return 2;
  }

  if (normalizedMethod === "POST") {
    return 1;
  }

  return 0;
}

function getRetryDelayMs(retryAttempt) {
  return RETRY_DELAYS_MS[retryAttempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
}

function getErrorCodeCandidates(error) {
  return [
    error?.code,
    error?.errno,
    error?.cause?.code,
    error?.cause?.errno,
  ]
    .filter(Boolean)
    .map((value) => String(value));
}

function getErrorMessageCandidates(error) {
  return [
    error instanceof Error ? error.message : String(error),
    error?.cause instanceof Error ? error.cause.message : error?.cause?.message,
  ]
    .filter(Boolean)
    .map((value) => String(value));
}

function getTransientNetworkRetryReason(error) {
  const retryableCode = getErrorCodeCandidates(error).find((code) =>
    TRANSIENT_NETWORK_ERROR_CODES.has(code),
  );

  if (retryableCode) {
    return retryableCode;
  }

  const retryableMessage = getErrorMessageCandidates(error).find((message) =>
    TRANSIENT_NETWORK_ERROR_MESSAGES.some((transientMessage) =>
      message.toLowerCase().includes(transientMessage),
    ),
  );

  return retryableMessage || null;
}

function waitForRetryDelay(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function parseBackendErrorText(text, statusCode, statusMessage, context) {
  let payload = null;

  if (String(text || "").trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: String(text).trim() };
    }
  }

  const errorPayload = payload?.error ?? payload ?? {};

  return createBackendApiError({
    code: errorPayload.code || `http_${statusCode}`,
    message:
      errorPayload.message ||
      statusMessage ||
      "The Action Desk backend request failed.",
    statusCode,
    retryable:
      typeof errorPayload.retryable === "boolean"
        ? errorPayload.retryable
        : statusCode >= 500,
    context,
    details: errorPayload.details,
  });
}

function requestWithNodeHttp(url, options) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;

    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: options.method,
        headers: options.headers,
        agent: false,
        timeout: options.timeoutMs,
      },
      (res) => {
        let text = "";

        res.setEncoding("utf8");

        res.on("data", (chunk) => {
          text += chunk;
        });

        res.on("error", reject);

        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            statusText: res.statusMessage || "",
            ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
            text,
          });
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(
        Object.assign(new Error("Backend request timed out."), {
          code: "ETIMEDOUT",
        }),
      );
    });

    req.on("error", reject);

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

async function requestWithRetry(url, options) {
  const maxRetries = getRetryLimitForMethod(options.method);
  let retriesAttempted = 0;

  while (true) {
    try {
      return await requestWithNodeHttp(url, options);
    } catch (error) {
      const retryReason = getTransientNetworkRetryReason(error);
      const retryAttempt = retriesAttempted + 1;

      if (!retryReason || retryAttempt > maxRetries) {
        throw error;
      }

      const retryDelayMs = getRetryDelayMs(retryAttempt);

      options.logger?.warn?.("backend-api", "Backend API transient network failure; retrying.", {
        ...options.logMetadata,
        statusCode: null,
        ...getNetworkErrorDetails(error),
        retryAttempt,
        retryDelayMs,
        retryReason,
      });

      await waitForRetryDelay(retryDelayMs);
      retriesAttempted = retryAttempt;
    }
  }
}

function createBackendApiClient(options = {}) {
  const baseUrl = normalizeApiUrl(options.baseUrl ?? process.env.ACTION_DESK_API_URL);
  const timeoutMs = options.timeoutMs ?? DEFAULT_BACKEND_TIMEOUT_MS;
  let logger = getLogger(options);

  logger.info?.("backend-api", "Backend API client initialized.", {
    baseUrl,
    timeoutMs,
  });

  async function requestJson(pathname, requestOptions = {}) {
    const url = new URL(pathname, baseUrl);
    const sessionId = String(requestOptions.sessionId || "").trim();
    const method = String(requestOptions.method || "GET").toUpperCase();

    const headers = {
      ...(requestOptions.headers || {}),
      Accept: "*/*",
      Connection: "close",
    };

    let body;

    if (requestOptions.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(requestOptions.body);
      headers["Content-Length"] = Buffer.byteLength(body);
    }

    if (sessionId) {
      headers["x-action-desk-session-id"] = sessionId;
    }

    const logMetadata = {
      method,
      path: pathname,
      url: sanitizeUrlForLog(url),
    };

    logger.info?.("backend-api", "Backend API request started.", logMetadata);

    let response;

    try {
      response = await requestWithRetry(url, {
        method,
        headers,
        body,
        timeoutMs,
        logger,
        logMetadata,
      });
    } catch (error) {
      const networkDetails = getNetworkErrorDetails(error);

      logger.error?.("backend-api", "Backend API network request failed.", {
        ...logMetadata,
        statusCode: null,
        ...networkDetails,
      });

      throw createBackendApiError({
        code: "backend_network_error",
        message: "The Action Desk backend API could not be reached.",
        retryable: true,
        context: pathname,
        details: networkDetails,
      });
    }

    logger.info?.("backend-api", "Backend API response received.", {
      ...logMetadata,
      statusCode: response.status,
    });

    if (!response.ok) {
      const backendError = parseBackendErrorText(
        response.text,
        response.status,
        response.statusText,
        pathname,
      );

      logger.warn?.("backend-api", "Backend API error response.", {
        ...logMetadata,
        statusCode: response.status,
        code: backendError.code,
        message: backendError.message,
      });

      throw backendError;
    }

    if (response.status === 204 || !response.text.trim()) {
      return null;
    }

    return JSON.parse(response.text);
  }

  return {
    baseUrl,
    requestJson,
    setLogger(nextLogger) {
      logger = getLogger({ logger: nextLogger });
      logger.info?.("backend-api", "Backend API logger attached.", {
        baseUrl,
      });
    },
  };
}

module.exports = {
  createBackendApiClient,
  createBackendApiError,
  getActionDeskApiUrl,
  normalizeApiUrl,
};
