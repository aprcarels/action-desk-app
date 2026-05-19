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
  };
  getRuntimeConfigPath: (userDataPath: string) => string;
  loadActionDeskRuntimeConfig: (options: {
    configPath?: string;
    userDataPath?: string;
  }) => {
    configPath: string;
    loaded: boolean;
    appliedKeys: string[];
    sourceKey: string | null;
  };
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
  it("resolves config.json inside the user data folder", () => {
    expect(getRuntimeConfigPath("C:\\Users\\pilot\\AppData\\Roaming\\Action Desk"))
      .toBe("C:\\Users\\pilot\\AppData\\Roaming\\Action Desk\\config.json");
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
    });
    expect(process.env.ACTION_DESK_API_URL).toBe("http://localhost:3960/");
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
    const { configPath, tempDir } = createTempConfig(JSON.stringify({
      ACTION_DESK_API_URL: "http://localhost:3960",
    }));

    try {
      const result = loadActionDeskRuntimeConfig({ configPath });

      expect(result.loaded).toBe(true);
      expect(result.configPath).toBe(configPath);
      expect(process.env.ACTION_DESK_API_URL).toBe("http://localhost:3960");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
