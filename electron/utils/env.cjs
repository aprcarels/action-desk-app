const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const RUNTIME_CONFIG_FILE_NAME = "config.json";
const RUNTIME_CONFIG_DIRECTORY_NAME = "action-desk-app";
const API_URL_CONFIG_KEYS = [
  "ACTION_DESK_API_URL",
  "VITE_ACTION_DESK_API_URL",
];
const RUNTIME_ENV_CONFIG_KEYS = [
  "VITE_AZURE_CLIENT_ID",
  "VITE_AZURE_TENANT_ID",
  "VITE_AZURE_AUTHORITY",
];

function addEnvCandidate(candidatePaths, envPath) {
  if (!envPath) {
    return;
  }

  const resolvedPath = path.resolve(envPath);

  if (!candidatePaths.includes(resolvedPath)) {
    candidatePaths.push(resolvedPath);
  }
}

function loadActionDeskEnv(options = {}) {
  const candidatePaths = [];
  const electronDir = options.electronDir ?? path.resolve(__dirname, "..");

  addEnvCandidate(candidatePaths, process.env.ACTION_DESK_ENV_PATH);
  addEnvCandidate(candidatePaths, path.resolve(electronDir, "..", ".env"));
  addEnvCandidate(candidatePaths, path.resolve(process.cwd(), ".env"));
  addEnvCandidate(candidatePaths, path.resolve(process.cwd(), "..", ".env"));
  addEnvCandidate(candidatePaths, path.resolve(process.cwd(), "..", "..", ".env"));

  if (process.resourcesPath) {
    addEnvCandidate(candidatePaths, path.join(process.resourcesPath, ".env"));
    addEnvCandidate(candidatePaths, path.join(process.resourcesPath, "app.asar", ".env"));
  }

  addEnvCandidate(candidatePaths, path.join(path.dirname(process.execPath), ".env"));
  addEnvCandidate(candidatePaths, path.resolve(electronDir, "..", "..", "..", "..", "..", ".env"));

  for (const envPath of candidatePaths) {
    if (fs.existsSync(envPath)) {
      const result = dotenv.config({ path: envPath, override: true });
      const loaded = !result.error;

      console.log("[Action Desk] Loaded .env from:", envPath);
      return {
        envPath,
        loaded,
      };
    }
  }

  console.warn("[Action Desk] No .env file found; using process environment only.");
  return {
    envPath: null,
    loaded: false,
  };
}

function getRuntimeConfigPath(input) {
  if (typeof input === "string") {
    return path.join(path.dirname(input), RUNTIME_CONFIG_DIRECTORY_NAME, RUNTIME_CONFIG_FILE_NAME);
  }

  if (input?.appDataPath) {
    return path.join(input.appDataPath, RUNTIME_CONFIG_DIRECTORY_NAME, RUNTIME_CONFIG_FILE_NAME);
  }

  if (input?.userDataPath) {
    return path.join(
      path.dirname(input.userDataPath),
      RUNTIME_CONFIG_DIRECTORY_NAME,
      RUNTIME_CONFIG_FILE_NAME,
    );
  }

  throw new Error("Action Desk app data path is required to resolve runtime config.");
}

function normalizeConfigString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getConfiguredApiUrl(config) {
  for (const key of API_URL_CONFIG_KEYS) {
    const value = normalizeConfigString(config?.[key]);

    if (value) {
      return {
        key,
        value,
      };
    }
  }

  return null;
}

function readRuntimeConfigFile(configPath) {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Action Desk runtime config could not be read from ${configPath}. ${message}`,
    );
  }
}

function applyRuntimeConfig(config, options = {}) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Action Desk runtime config must be a JSON object.");
  }

  const configuredApiUrl = getConfiguredApiUrl(config);
  const appliedKeys = [];
  const sourceKeys = [];
  const hasApiUrlEnv =
    Boolean(normalizeConfigString(process.env.ACTION_DESK_API_URL)) ||
    Boolean(normalizeConfigString(process.env.VITE_ACTION_DESK_API_URL));

  if (configuredApiUrl) {
    sourceKeys.push(configuredApiUrl.key);
  }

  if (
    configuredApiUrl &&
    (options.override === true || !hasApiUrlEnv)
  ) {
    process.env.ACTION_DESK_API_URL = configuredApiUrl.value;
    appliedKeys.push("ACTION_DESK_API_URL");
  }

  for (const key of RUNTIME_ENV_CONFIG_KEYS) {
    const value = normalizeConfigString(config[key]);

    if (!value) {
      continue;
    }

    sourceKeys.push(key);

    if (options.override === true || !normalizeConfigString(process.env[key])) {
      process.env[key] = value;
      appliedKeys.push(key);
    }
  }

  return {
    appliedKeys,
    sourceKey: configuredApiUrl?.key ?? null,
    sourceKeys,
  };
}

function loadActionDeskRuntimeConfig(options = {}) {
  const configPath =
    options.configPath ??
    process.env.ACTION_DESK_CONFIG_PATH ??
    getRuntimeConfigPath(options);

  if (!fs.existsSync(configPath)) {
    return {
      configPath,
      loaded: false,
      appliedKeys: [],
      sourceKey: null,
      sourceKeys: [],
    };
  }

  const config = readRuntimeConfigFile(configPath);
  const result = applyRuntimeConfig(config, {
    override: options.override,
  });

  console.log("[Action Desk] Loaded runtime config from:", configPath);
  return {
    configPath,
    loaded: true,
    ...result,
  };
}

module.exports = {
  API_URL_CONFIG_KEYS,
  RUNTIME_CONFIG_FILE_NAME,
  RUNTIME_CONFIG_DIRECTORY_NAME,
  RUNTIME_ENV_CONFIG_KEYS,
  applyRuntimeConfig,
  getConfiguredApiUrl,
  getRuntimeConfigPath,
  loadActionDeskEnv,
  loadActionDeskRuntimeConfig,
};
