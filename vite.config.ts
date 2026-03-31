import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ServerOptions } from "node:https";
import { getMockInboxPage } from "./src/mocks/mockInboxApi";
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

  return getMockInboxPage({ cursor, limit });
}

function mockInboxApiPlugin() {
  const routeHandler = (req: { method?: string; url?: string }, res: {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(chunk?: string): void;
  }, next: () => void) => {
    if (req.method !== "GET" || !req.url) {
      next();
      return;
    }

    const url = new URL(req.url, "https://localhost");

    if (url.pathname !== "/api/inbox") {
      next();
      return;
    }

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
