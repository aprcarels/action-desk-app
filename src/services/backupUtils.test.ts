import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { buildBackupFilePath, formatBackupTimestamp } = require("../../electron/backupUtils.cjs") as {
  buildBackupFilePath: (databasePath: string, date?: Date) => string;
  formatBackupTimestamp: (date?: Date) => string;
};

describe("backupUtils", () => {
  it("formats backup timestamps with a sortable filename-safe pattern", () => {
    expect(formatBackupTimestamp(new Date("2026-04-22T09:15:30.000Z"))).toBe(
      "20260422-091530",
    );
  });

  it("builds timestamped backup paths in a sibling backups directory", () => {
    const backupPath = buildBackupFilePath(
      "C:\\Users\\pilot\\action-desk-shared.sqlite",
      new Date("2026-04-22T09:15:30.000Z"),
    );

    expect(backupPath).toContain("backups");
    expect(backupPath).toContain("action-desk-shared-20260422-091530.sqlite");
  });
});
