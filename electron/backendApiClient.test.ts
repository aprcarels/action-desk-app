import http from "node:http";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createBackendApiClient } = require("./backendApiClient.cjs") as {
  createBackendApiClient: (options: {
    baseUrl: string;
    logger: Record<string, (...args: unknown[]) => void>;
  }) => {
    requestJson: (
      pathname: string,
      options?: {
        method?: string;
        sessionId?: string;
        body?: Record<string, unknown>;
      },
    ) => Promise<unknown>;
  };
};

type CapturedRequest = {
  body: string;
  headers: http.IncomingHttpHeaders;
  method?: string;
  url?: string;
};

async function startCaptureServer() {
  let resolveCapturedRequest: (request: CapturedRequest) => void = () => {};
  const capturedRequest = new Promise<CapturedRequest>((resolve) => {
    resolveCapturedRequest = resolve;
  });
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];

    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolveCapturedRequest({
        body: Buffer.concat(chunks).toString("utf8"),
        headers: req.headers,
        method: req.method,
        url: req.url,
      });
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Could not determine backend test server address.");
  }

  return {
    capturedRequest,
    origin: `http://127.0.0.1:${address.port}`,
    server,
  };
}

async function closeServer(server: http.Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

describe("backendApiClient", () => {
  it("sends session ids only in the session header", async () => {
    const { capturedRequest, origin, server } = await startCaptureServer();
    const client = createBackendApiClient({
      baseUrl: origin,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    });

    try {
      await client.requestJson("/api/workflow/preferences", {
        method: "POST",
        sessionId: "session-secure",
        body: {
          preferences: {
            showSnoozed: false,
          },
        },
      });

      const request = await capturedRequest;

      expect(request.method).toBe("POST");
      expect(request.url).toBe("/api/workflow/preferences");
      expect(request.headers["x-action-desk-session-id"]).toBe("session-secure");
      expect(JSON.parse(request.body)).toEqual({
        preferences: {
          showSnoozed: false,
        },
      });
    } finally {
      await closeServer(server);
    }
  });
});
