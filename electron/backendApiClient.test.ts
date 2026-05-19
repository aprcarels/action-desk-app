import http from "node:http";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  buildMissingApiUrlMessage,
  createBackendApiClient,
  getActionDeskApiUrl,
} = require("./backendApiClient.cjs") as {
  buildMissingApiUrlMessage: (runtimeConfigPath?: string) => string;
  createBackendApiClient: (options: {
    baseUrl?: string;
    logger?: Record<string, (...args: unknown[]) => void>;
    runtimeConfigPath?: string;
  }) => {
    baseUrl: string;
    requestJson: (
      pathname: string,
      options?: {
        method?: string;
        sessionId?: string;
        body?: Record<string, unknown>;
      },
    ) => Promise<unknown>;
  };
  getActionDeskApiUrl: (options?: { runtimeConfigPath?: string }) => string;
};

const originalActionDeskApiUrl = process.env.ACTION_DESK_API_URL;
const originalViteActionDeskApiUrl = process.env.VITE_ACTION_DESK_API_URL;

function resetApiUrlEnv() {
  if (originalActionDeskApiUrl === undefined) {
    delete process.env.ACTION_DESK_API_URL;
  } else {
    process.env.ACTION_DESK_API_URL = originalActionDeskApiUrl;
  }

  if (originalViteActionDeskApiUrl === undefined) {
    delete process.env.VITE_ACTION_DESK_API_URL;
  } else {
    process.env.VITE_ACTION_DESK_API_URL = originalViteActionDeskApiUrl;
  }
}

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
  afterEach(() => {
    resetApiUrlEnv();
  });

  it("uses VITE_ACTION_DESK_API_URL when ACTION_DESK_API_URL is not set", () => {
    delete process.env.ACTION_DESK_API_URL;
    process.env.VITE_ACTION_DESK_API_URL = "http://localhost:3960/";

    expect(getActionDeskApiUrl()).toBe("http://localhost:3960");
  });

  it("explains where admins should create runtime config when API URL is missing", () => {
    delete process.env.ACTION_DESK_API_URL;
    delete process.env.VITE_ACTION_DESK_API_URL;

    expect(() =>
      getActionDeskApiUrl({
        runtimeConfigPath: "C:\\Users\\pilot\\AppData\\Roaming\\Action Desk\\config.json",
      }),
    ).toThrow(
      buildMissingApiUrlMessage(
        "C:\\Users\\pilot\\AppData\\Roaming\\Action Desk\\config.json",
      ),
    );
  });

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
