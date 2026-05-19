import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  applyRuntimeConfig,
  getRuntimeConfigPath,
  loadActionDeskRuntimeConfig,
} = require("./env.cjs") as {
  applyRuntimeConfig: (
    config: Record<string, unknown>,
    options?: { override?: boolean },
  ) => {
    appliedKeys: string[];
    sourceKey: string | null;
    sourceKeys: string[];
  };
  getRuntimeConfigPath: (input: string | {
    appDataPath?: string;
    userDataPath?: string;
  }) => string;
  loadActionDeskRuntimeConfig: (options: {
    appDataPath?: string;
    configPath?: string;
    userDataPath?: string;
  }) => {
    configPath: string;
    loaded: boolean;
    appliedKeys: string[];
    sourceKey: string | null;
    sourceKeys: string[];
  };
};

const originalActionDeskApiUrl = process.env.ACTION_DESK_API_URL;
const originalViteActionDeskApiUrl = process.env.VITE_ACTION_DESK_API_URL;
const originalAzureClientId = process.env.VITE_AZURE_CLIENT_ID;
const originalAzureTenantId = process.env.VITE_AZURE_TENANT_ID;
const originalAzureAuthority = process.env.VITE_AZURE_AUTHORITY;

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

  if (originalAzureClientId === undefined) {
    delete process.env.VITE_AZURE_CLIENT_ID;
  } else {
    process.env.VITE_AZURE_CLIENT_ID = originalAzureClientId;
  }

  if (originalAzureTenantId === undefined) {
    delete process.env.VITE_AZURE_TENANT_ID;
  } else {
    process.env.VITE_AZURE_TENANT_ID = originalAzureTenantId;
  }

  if (originalAzureAuthority === undefined) {
    delete process.env.VITE_AZURE_AUTHORITY;
  } else {
    process.env.VITE_AZURE_AUTHORITY = originalAzureAuthority;
  }
}

function createTempConfig(contents: string) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "action-desk-config-"));
  const configPath = path.join(tempDir, "config.json");
  fs.writeFileSync(configPath, contents, "utf8");

  return {
    configPath,
    tempDir,
  };
}

afterEach(() => {
  resetApiUrlEnv();
});

describe("Electron runtime config", () => {
  it("resolves config.json inside the appData action-desk-app folder", () => {
    expect(getRuntimeConfigPath({
      appDataPath: "C:\\Users\\pilot\\AppData\\Roaming",
      userDataPath: "C:\\Users\\pilot\\AppData\\Roaming\\Action Desk",
    })).toBe("C:\\Users\\pilot\\AppData\\Roaming\\action-desk-app\\config.json");

    expect(getRuntimeConfigPath("C:\\Users\\pilot\\AppData\\Roaming\\Action Desk"))
      .toBe("C:\\Users\\pilot\\AppData\\Roaming\\action-desk-app\\config.json");
  });

  it("applies ACTION_DESK_API_URL from runtime config when env is missing", () => {
    delete process.env.ACTION_DESK_API_URL;
    delete process.env.VITE_ACTION_DESK_API_URL;

    const result = applyRuntimeConfig({
      ACTION_DESK_API_URL: " http://localhost:3960/ ",
    });

    expect(result).toEqual({
      appliedKeys: ["ACTION_DESK_API_URL"],
      sourceKey: "ACTION_DESK_API_URL",
      sourceKeys: ["ACTION_DESK_API_URL"],
    });
    expect(process.env.ACTION_DESK_API_URL).toBe("http://localhost:3960/");
  });

  it("applies non-secret Azure runtime config values", () => {
    delete process.env.ACTION_DESK_API_URL;
    delete process.env.VITE_ACTION_DESK_API_URL;
    delete process.env.VITE_AZURE_CLIENT_ID;
    delete process.env.VITE_AZURE_TENANT_ID;

    const result = applyRuntimeConfig({
      ACTION_DESK_API_URL: "http://localhost:3960",
      VITE_AZURE_CLIENT_ID: "client-id",
      VITE_AZURE_TENANT_ID: "tenant-id",
    });

    expect(result.appliedKeys).toEqual([
      "ACTION_DESK_API_URL",
      "VITE_AZURE_CLIENT_ID",
      "VITE_AZURE_TENANT_ID",
    ]);
    expect(result.sourceKeys).toEqual([
      "ACTION_DESK_API_URL",
      "VITE_AZURE_CLIENT_ID",
      "VITE_AZURE_TENANT_ID",
    ]);
    expect(process.env.ACTION_DESK_API_URL).toBe("http://localhost:3960");
    expect(process.env.VITE_AZURE_CLIENT_ID).toBe("client-id");
    expect(process.env.VITE_AZURE_TENANT_ID).toBe("tenant-id");
  });

  it("accepts VITE_ACTION_DESK_API_URL from runtime config", () => {
    delete process.env.ACTION_DESK_API_URL;
    delete process.env.VITE_ACTION_DESK_API_URL;

    const result = applyRuntimeConfig({
      VITE_ACTION_DESK_API_URL: "http://localhost:3960",
    });

    expect(result.sourceKey).toBe("VITE_ACTION_DESK_API_URL");
    expect(process.env.ACTION_DESK_API_URL).toBe("http://localhost:3960");
  });

  it("preserves existing dev env values when loading runtime config", () => {
    process.env.ACTION_DESK_API_URL = "http://dev-backend.local:4000";
    delete process.env.VITE_ACTION_DESK_API_URL;

    const result = applyRuntimeConfig({
      ACTION_DESK_API_URL: "http://runtime-backend.local:4000",
    });

    expect(result.appliedKeys).toEqual([]);
    expect(process.env.ACTION_DESK_API_URL).toBe("http://dev-backend.local:4000");
  });

  it("loads API URL from a config file", () => {
    delete process.env.ACTION_DESK_API_URL;
    delete process.env.VITE_ACTION_DESK_API_URL;
    delete process.env.VITE_AZURE_CLIENT_ID;
    delete process.env.VITE_AZURE_TENANT_ID;
    const { configPath, tempDir } = createTempConfig(JSON.stringify({
      ACTION_DESK_API_URL: "http://localhost:3960",
      VITE_AZURE_CLIENT_ID: "client-id",
      VITE_AZURE_TENANT_ID: "tenant-id",
    }));

    try {
      const result = loadActionDeskRuntimeConfig({ configPath });

      expect(result.loaded).toBe(true);
      expect(result.configPath).toBe(configPath);
      expect(process.env.ACTION_DESK_API_URL).toBe("http://localhost:3960");
      expect(process.env.VITE_AZURE_CLIENT_ID).toBe("client-id");
      expect(process.env.VITE_AZURE_TENANT_ID).toBe("tenant-id");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
