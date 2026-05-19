import fs from "node:fs";
import { describe, expect, it } from "vitest";

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
    expect(installerScript).toContain("!macro customInstall");
    expect(installerScript).toContain(
      'IfFileExists "$APPDATA\\${PRODUCT_FILENAME}\\config.json" actionDeskRuntimeConfigExists 0',
    );
    expect(installerScript).toContain(
      'FileOpen $0 "$APPDATA\\${PRODUCT_FILENAME}\\config.json" w',
    );
    expect(installerScript).toContain("ACTION_DESK_DEFAULT_API_URL");
  });
});
