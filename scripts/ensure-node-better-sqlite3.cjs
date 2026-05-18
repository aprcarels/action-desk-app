#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

function tryLoadBetterSqlite3() {
  try {
    const Database = require("better-sqlite3");
    const database = new Database(":memory:");
    database.close();
    return null;
  } catch (error) {
    return error;
  }
}

function formatError(error) {
  if (error && typeof error.message === "string") {
    return error.message;
  }

  return String(error);
}

function rebuildForNode() {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath
    ? process.execPath
    : process.platform === "win32"
      ? "npm.cmd"
      : "npm";
  const args = npmExecPath
    ? [npmExecPath, "rebuild", "better-sqlite3"]
    : ["rebuild", "better-sqlite3"];

  return spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });
}

const initialError = tryLoadBetterSqlite3();

if (!initialError) {
  process.exit(0);
}

console.warn("better-sqlite3 could not load in the Node test runtime.");
console.warn(formatError(initialError));
console.warn(
  `Rebuilding better-sqlite3 for Node ABI ${process.versions.modules} before running tests.`,
);

const rebuildResult = rebuildForNode();

if (rebuildResult.error) {
  console.error(formatError(rebuildResult.error));
  process.exit(1);
}

if (rebuildResult.status !== 0) {
  process.exit(rebuildResult.status || 1);
}

const rebuiltError = tryLoadBetterSqlite3();

if (rebuiltError) {
  console.error("better-sqlite3 still could not load after rebuilding for Node.");
  console.error(formatError(rebuiltError));
  process.exit(1);
}

console.log("better-sqlite3 is ready for the Node test runtime.");
