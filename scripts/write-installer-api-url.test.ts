import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  DEFAULT_INSTALLER_API_URL,
  formatInstallerApiUrlDefine,
  normalizeInstallerApiUrl,
  writeInstallerApiUrlDefine,
} = require("./write-installer-api-url.cjs") as {
  DEFAULT_INSTALLER_API_URL: string;
  formatInstallerApiUrlDefine: (apiUrl: string) => string;
  normalizeInstallerApiUrl: (value?: string) => string;
  writeInstallerApiUrlDefine: (options?: {
    apiUrl?: string;
    outputPath?: string;
  }) => {
    apiUrl: string;
    outputPath: string;
  };
};

describe("installer API URL define", () => {
  it("defaults to the packaged desktop local server", () => {
    const originalValue = process.env.ACTION_DESK_INSTALLER_API_URL;
    delete process.env.ACTION_DESK_INSTALLER_API_URL;

    try {
      expect(normalizeInstallerApiUrl()).toBe(DEFAULT_INSTALLER_API_URL);
    } finally {
      if (originalValue === undefined) {
        delete process.env.ACTION_DESK_INSTALLER_API_URL;
      } else {
        process.env.ACTION_DESK_INSTALLER_API_URL = originalValue;
      }
    }
  });

  it("normalizes build-time hosted backend overrides to an origin", () => {
    expect(normalizeInstallerApiUrl("https://api.actiondesk.example.com/v1/"))
      .toBe("https://api.actiondesk.example.com");
  });

  it("rejects non-HTTP API URL overrides", () => {
    expect(() => normalizeInstallerApiUrl("file:///tmp/action-desk"))
      .toThrow("ACTION_DESK_INSTALLER_API_URL must use http or https.");
  });

  it("writes an NSIS define consumed by build/installer.nsh", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "action-desk-installer-"));
    const outputPath = path.join(tempDir, "installer-api-url.generated.nsh");

    try {
      const result = writeInstallerApiUrlDefine({
        apiUrl: "http://localhost:3960",
        outputPath,
      });

      expect(result).toEqual({
        apiUrl: "http://localhost:3960",
        outputPath,
      });
      expect(fs.readFileSync(outputPath, "utf8"))
        .toBe(formatInstallerApiUrlDefine("http://localhost:3960"));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
