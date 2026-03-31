import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ServerOptions } from "node:https";
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

export default defineConfig({
  plugins: [react()],
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
