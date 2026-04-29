const path = require("node:path");

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatBackupTimestamp(date = new Date()) {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "-",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join("");
}

function buildBackupFilePath(databasePath, date = new Date()) {
  const parsedPath = path.parse(databasePath);
  const backupDirectory = path.join(parsedPath.dir, "backups");
  const filename = `${parsedPath.name}-${formatBackupTimestamp(date)}${parsedPath.ext || ".sqlite"}`;

  return path.join(backupDirectory, filename);
}

async function createDatabaseBackup(options) {
  const { database, databasePath, logger } = options;
  const backupPath = buildBackupFilePath(databasePath);

  await database.backup(backupPath);

  logger?.info("backup", "Created SQLite backup.", {
    source: databasePath,
    backupPath,
  });

  return backupPath;
}

module.exports = {
  buildBackupFilePath,
  createDatabaseBackup,
  formatBackupTimestamp,
};
