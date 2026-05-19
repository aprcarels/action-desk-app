import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  formatInstallerApiUrlDefine,
  normalizeInstallerApiUrl,
  writeInstallerApiUrlDefine,
} = require("./write-installer-api-url.cjs") as {
  formatInstallerApiUrlDefine: (config: {
    apiUrl: string;
    azureClientId: string;
    azureTenantId: string;
  }) => string;
  normalizeInstallerApiUrl: (value?: string) => string;
  writeInstallerApiUrlDefine: (options?: {
    apiUrl?: string;
    azureClientId?: string;
    azureTenantId?: string;
    outputPath?: string;
  }) => {
    apiUrl: string;
    azureClientId: string;
    azureTenantId: string;
    outputPath: string;
  };
};

describe("installer API URL define", () => {
  it("fails clearly when build-time installer values are missing", () => {
    const originalValue = process.env.ACTION_DESK_INSTALLER_API_URL;
    delete process.env.ACTION_DESK_INSTALLER_API_URL;

    try {
      expect(() => normalizeInstallerApiUrl())
        .toThrow(
          "ACTION_DESK_INSTALLER_API_URL is required to build the Windows installer.",
        );
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

  it("fails when Azure installer values are missing", () => {
    expect(() =>
      writeInstallerApiUrlDefine({
        apiUrl: "http://localhost:3960",
        azureClientId: "client-id",
        azureTenantId: "",
        outputPath: path.join(os.tmpdir(), "unused-installer-config.nsh"),
      }),
    ).toThrow(
      "ACTION_DESK_INSTALLER_AZURE_TENANT_ID is required to build the Windows installer.",
    );
  });

  it("writes an NSIS define consumed by build/installer.nsh", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "action-desk-installer-"));
    const outputPath = path.join(tempDir, "installer-api-url.generated.nsh");

    try {
      const result = writeInstallerApiUrlDefine({
        apiUrl: "http://localhost:3960",
        azureClientId: "client-id",
        azureTenantId: "tenant-id",
        outputPath,
      });

      expect(result).toEqual({
        apiUrl: "http://localhost:3960",
        azureClientId: "client-id",
        azureTenantId: "tenant-id",
        outputPath,
      });
      expect(fs.readFileSync(outputPath, "utf8"))
        .toBe(formatInstallerApiUrlDefine({
          apiUrl: "http://localhost:3960",
          azureClientId: "client-id",
          azureTenantId: "tenant-id",
        }));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
