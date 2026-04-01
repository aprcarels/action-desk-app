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

    if (url.pathname !== "/api/inbox" && url.pathname !== "/api/inbox/import") {
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
