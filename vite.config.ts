import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ServerOptions } from "node:https";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { handleInboxMessagesRequest } from "./server/inbox/inboxRoutes";
import { getInboxPage, importInboxEmail } from "./server/inboxImportStore";
import { checkDatabaseConnection } from "./src/persistence/mariadb/database";

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
  return new Promise<string>((resolvePromise, reject) => {
    const chunks: Array<Buffer | string> = [];

    req.on("data", (chunk) => {
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolvePromise(chunks.map((chunk) => chunk.toString()).join(""));
    });

    req.on("error", () => {
      reject(new Error("Request body could not be read."));
    });
  });
}

async function handleDatabaseHealthRequest(res: {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(chunk?: string): void;
}) {
  const health = await checkDatabaseConnection();

  res.statusCode = health.ok ? 200 : 503;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ database: health }));
}

function inboxApiPlugin() {
  const routeHandler = async (req: {
    headers?: {
      authorization?: string;
    };
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

    if (req.method === "GET" && url.pathname === "/api/database/health") {
      await handleDatabaseHealthRequest(res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/inbox/messages") {
      await handleInboxMessagesRequest(req, res);
      return;
    }

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

    if (
      url.pathname !== "/api/inbox" &&
      url.pathname !== "/api/inbox/import" &&
      url.pathname !== "/api/inbox/messages" &&
      url.pathname !== "/api/database/health"
    ) {
      next();
      return;
    }
  };

  return {
    name: "inbox-api",
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
  plugins: [react(), inboxApiPlugin()],
  envPrefix: ["VITE_", "ACTION_DESK_"],
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
        redirect: resolve(__dirname, "redirect.html"),
        authPopupCallback: resolve(__dirname, "auth/popup-callback.html"),
      },
    },
  },
});
