import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ServerOptions } from "node:https";
import { getInboxPage, importInboxEmail } from "./server/inboxImportStore";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const certKeyPath = resolve(__dirname, "certs", "localhost-key.pem");
const certPath = resolve(__dirname, "certs", "localhost.pem");

if (!existsSync(certKeyPath) || !existsSync(certPath)) {
  throw new Error(
    `Outlook add-in local HTTPS certificates are required. Create these files: ${certKeyPath} and ${certPath}`,
  );
}

const httpsConfig: ServerOptions = {
  key: readFileSync(certKeyPath),
  cert: readFileSync(certPath),
};

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

function handleMockInboxRequest(requestUrl: string) {
  const url = new URL(requestUrl, "https://localhost");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const rawLimit = url.searchParams.get("limit");
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;
  const limit = parsedLimit !== undefined && Number.isNaN(parsedLimit) ? undefined : parsedLimit;

  return getInboxPage({ cursor, limit });
}

async function readRequestBody(req: {
  on(event: "data", listener: (chunk: Buffer | string) => void): void;
  on(event: "end", listener: () => void): void;
  on(event: "error", listener: () => void): void;
}) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Array<Buffer | string> = [];

    req.on("data", (chunk) => {
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolve(chunks.map((chunk) => chunk.toString()).join(""));
    });

    req.on("error", () => {
      reject(new Error("Request body could not be read."));
    });
  });
}

function isAllowedGraphRequest(method: string, pathWithQuery: string) {
  if (method !== "GET") {
    return false;
  }

  return /^\/me\/messages(?:\?.*)?$/i.test(pathWithQuery);
}

async function handleGraphProxyRequest(req: {
  method?: string;
  url?: string;
  headers?: {
    authorization?: string;
    accept?: string;
  };
}, res: {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(chunk?: string): void;
}) {
  if (!req.method || !req.url) {
    res.statusCode = 400;
    res.end("Invalid graph request.");
    return;
  }

  const authorization = req.headers?.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    res.statusCode = 401;
    res.end("Missing bearer token.");
    return;
  }

  const requestUrl = new URL(req.url, "https://localhost");
  const graphPath = requestUrl.pathname.replace(/^\/api\/graph/i, "") || "/";
  const pathWithQuery = `${graphPath}${requestUrl.search}`;

  if (!isAllowedGraphRequest(req.method.toUpperCase(), pathWithQuery)) {
    res.statusCode = 404;
    res.end("Graph path is not enabled by this proxy.");
    return;
  }

  const upstreamResponse = await fetch(`${GRAPH_BASE_URL}${pathWithQuery}`, {
    method: req.method.toUpperCase(),
    headers: {
      Authorization: authorization,
      Accept: req.headers?.accept ?? "application/json",
    },
  });

  res.statusCode = upstreamResponse.status;
  const contentType = upstreamResponse.headers.get("Content-Type");

  if (contentType) {
    res.setHeader("Content-Type", contentType);
  }

  res.end(await upstreamResponse.text());
}

function mockInboxApiPlugin() {
  const routeHandler = async (req: {
    method?: string;
    url?: string;
    on(event: "data", listener: (chunk: Buffer | string) => void): void;
    on(event: "end", listener: () => void): void;
    on(event: "error", listener: () => void): void;
  }, res: {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(chunk?: string): void;
  }, next: () => void) => {
    if (!req.method || !req.url) {
      next();
      return;
    }

    const url = new URL(req.url, "https://localhost");

    if (req.method === "GET" && url.pathname === "/api/inbox") {
      try {
        const payload = handleMockInboxRequest(req.url);
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(payload));
      } catch {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Mock inbox route failed." }));
      }
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/graph")) {
      try {
        await handleGraphProxyRequest(req, res);
      } catch {
        res.statusCode = 502;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Graph proxy request failed." }));
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/inbox/import") {
      try {
        const rawBody = await readRequestBody(req);
        const payload = rawBody ? (JSON.parse(rawBody) as unknown) : null;
        const result = importInboxEmail(payload);

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(result));
      } catch {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Inbox import failed." }));
      }
      return;
    }

    if (
      url.pathname !== "/api/inbox" &&
      url.pathname !== "/api/inbox/import" &&
      !url.pathname.startsWith("/api/graph")
    ) {
      next();
      return;
    }
  };

  return {
    name: "mock-inbox-api",
    configureServer(server: {
      middlewares: { use(handler: typeof routeHandler): void };
    }) {
      server.middlewares.use(routeHandler);
    },
    configurePreviewServer(server: {
      middlewares: { use(handler: typeof routeHandler): void };
    }) {
      server.middlewares.use(routeHandler);
    },
  };
}

export default defineConfig({
  plugins: [react(), mockInboxApiPlugin()],
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    // Outlook add-ins require HTTPS during local development, so Vite must use
    // an explicit localhost certificate and key that Outlook can trust.
    https: httpsConfig,
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        taskpane: resolve(__dirname, "taskpane.html"),
      },
    },
  },
});
