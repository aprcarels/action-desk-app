const fs = require("node:fs");
const path = require("node:path");

function ensureDirectory(filePath) {
  const directory = path.dirname(filePath);

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function formatMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return "";
  }

  try {
    const entries = Object.entries(metadata);

    if (entries.length === 0) {
      return "";
    }

    return ` ${JSON.stringify(metadata)}`;
  } catch {
    return "";
  }
}

function createLogger(logFilePath) {
  ensureDirectory(logFilePath);

  function write(level, scope, message, metadata) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level}] [${scope}] ${message}${formatMetadata(metadata)}\n`;

    if (level === "ERROR") {
      console.error(line.trimEnd());
    } else if (level === "WARN") {
      console.warn(line.trimEnd());
    } else {
      console.log(line.trimEnd());
    }

    try {
      fs.appendFileSync(logFilePath, line, "utf8");
    } catch (error) {
      console.error("[logger] failed to write log file", error);
    }
  }

  return {
    info(scope, message, metadata) {
      write("INFO", scope, message, metadata);
    },
    warn(scope, message, metadata) {
      write("WARN", scope, message, metadata);
    },
    error(scope, message, metadata) {
      write("ERROR", scope, message, metadata);
    },
    getLogFilePath() {
      return logFilePath;
    },
  };
}

module.exports = {
  createLogger,
};
