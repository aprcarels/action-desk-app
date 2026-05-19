import fs from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { getRuntimeConfigPath } = require("./utils/env.cjs") as {
  getRuntimeConfigPath: (input: { appDataPath: string }) => string;
};

type PackageJson = {
  scripts: Record<string, string>;
  build: {
    files: string[];
    nsis: {
      include?: string;
    };
  };
};

function readPackageJson() {
  return JSON.parse(fs.readFileSync("package.json", "utf8")) as PackageJson;
}

describe("Windows installer runtime config", () => {
  it("keeps env files excluded from packaged app contents", () => {
    const packageJson = readPackageJson();

    expect(packageJson.build.files).toContain("!**/.env");
    expect(packageJson.build.files).toContain("!**/.env.*");
  });

  it("uses the custom NSIS include that creates runtime config without overwriting it", () => {
    const packageJson = readPackageJson();
    const installerScript = fs.readFileSync("build/installer.nsh", "utf8");

    expect(packageJson.build.nsis.include).toBe("build/installer.nsh");
    expect(packageJson.scripts["package:win"])
      .toContain("node scripts/write-installer-api-url.cjs");
    expect(packageJson.scripts["package:win"])
      .toContain("npm run desktop:prep");
    expect(installerScript).toContain("!macro customInstall");
    expect(installerScript).toContain(
      'IfFileExists "$APPDATA\\action-desk-app\\config.json" actionDeskRuntimeConfigExists 0',
    );
    expect(installerScript).toContain(
      'FileOpen $0 "$APPDATA\\action-desk-app\\config.json" w',
    );
    expect(installerScript).toContain("ACTION_DESK_INSTALLER_API_URL");
    expect(installerScript).toContain("VITE_AZURE_CLIENT_ID");
    expect(installerScript).toContain("VITE_AZURE_TENANT_ID");
  });

  it("uses the same config path in the installer and runtime loader", () => {
    const installerScript = fs.readFileSync("build/installer.nsh", "utf8");
    const runtimePath = getRuntimeConfigPath({
      appDataPath: "C:\\Users\\pilot\\AppData\\Roaming",
    });

    expect(runtimePath).toBe("C:\\Users\\pilot\\AppData\\Roaming\\action-desk-app\\config.json");
    expect(installerScript).toContain("$APPDATA\\action-desk-app\\config.json");
  });
});
