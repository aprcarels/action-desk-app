import * as mariadb from "mariadb";
import { config as loadDotEnv } from "dotenv";
import type { Buffer } from "node:buffer";
import type { Pool, PoolConfig, PoolConnection, SqlError, UpsertResult } from "mariadb";

loadDotEnv();

const REQUIRED_DATABASE_ENV_KEYS = [
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
] as const;

const DEFAULT_CONNECTION_LIMIT = 10;
const CONNECTION_TIMEOUT_MS = 10_000;
const IDLE_TIMEOUT_SECONDS = 60;

export type RequiredDatabaseEnvKey = (typeof REQUIRED_DATABASE_ENV_KEYS)[number];

export type DatabaseConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
};

export type DatabaseLogMetadata = Record<string, boolean | number | string | undefined>;

export type DatabaseLogger = {
  info(scope: string, message: string, metadata?: DatabaseLogMetadata): void;
  warn(scope: string, message: string, metadata?: DatabaseLogMetadata): void;
  error(scope: string, message: string, metadata?: DatabaseLogMetadata): void;
};

export type QueryParameter = string | number | boolean | bigint | Date | Buffer | null;
export type DatabaseRow = Record<string, unknown>;

export type DatabaseCommandResult = {
  affectedRows: number;
  insertId: number | bigint | null;
  warningStatus: number;
};

export type DatabaseHealthResult = {
  ok: boolean;
  databaseReady: boolean;
  checkedAt: string;
  error?: string;
};

export type DatabaseTransaction = {
  query<T extends DatabaseRow = DatabaseRow>(
    sql: string,
    params?: readonly QueryParameter[],
  ): Promise<T[]>;
  execute(
    sql: string,
    params?: readonly QueryParameter[],
  ): Promise<DatabaseCommandResult>;
};

type ErrorDetails = {
  code?: string;
  errno?: number;
  fatal?: boolean;
  message: string;
  sqlState?: string;
};

class DatabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigurationError";
  }
}

export class DatabaseQueryError extends Error {
  readonly cause: unknown;
  readonly code?: string;
  readonly errno?: number;
  readonly fatal?: boolean;
  readonly sqlState?: string;

  constructor(details: ErrorDetails, cause: unknown) {
    super("Database query failed.");
    this.name = "DatabaseQueryError";
    this.code = details.code;
    this.errno = details.errno;
    this.fatal = details.fatal;
    this.sqlState = details.sqlState;
    this.cause = cause;
  }
}

const consoleDatabaseLogger: DatabaseLogger = {
  info(scope, message, metadata) {
    console.log(formatLogLine("INFO", scope, message, metadata));
  },
  warn(scope, message, metadata) {
    console.warn(formatLogLine("WARN", scope, message, metadata));
  },
  error(scope, message, metadata) {
    console.error(formatLogLine("ERROR", scope, message, metadata));
  },
};

let databaseLogger: DatabaseLogger = consoleDatabaseLogger;
let activePool: Pool | null = null;
let activePoolKey: string | null = null;

function formatLogLine(
  level: string,
  scope: string,
  message: string,
  metadata?: DatabaseLogMetadata,
): string {
  const metadataText = metadata ? ` ${JSON.stringify(metadata)}` : "";
  return `[${level}] [${scope}] ${message}${metadataText}`;
}

function normalizeEnvValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function getMissingEnvKeys(source: NodeJS.ProcessEnv): RequiredDatabaseEnvKey[] {
  return REQUIRED_DATABASE_ENV_KEYS.filter((key) => !normalizeEnvValue(source[key]));
}

function parseDatabasePort(value: string): number {
  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new DatabaseConfigurationError(
      "DB_PORT must be a valid TCP port between 1 and 65535.",
    );
  }

  return port;
}

function getPoolKey(config: DatabaseConfig): string {
  return `${config.user}@${config.host}:${config.port}/${config.database}`;
}

function buildPoolConfig(config: DatabaseConfig): PoolConfig {
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    connectionLimit: DEFAULT_CONNECTION_LIMIT,
    acquireTimeout: CONNECTION_TIMEOUT_MS,
    connectTimeout: CONNECTION_TIMEOUT_MS,
    idleTimeout: IDLE_TIMEOUT_SECONDS,
    initializationTimeout: CONNECTION_TIMEOUT_MS,
    timezone: "Z",
    dateStrings: true,
    insertIdAsNumber: true,
    logParam: false,
    multipleStatements: false,
    permitSetMultiParamEntries: false,
  };
}

function extractErrorDetails(error: unknown): ErrorDetails {
  if (error instanceof DatabaseConfigurationError) {
    return {
      message: error.message,
    };
  }

  if (error instanceof Error) {
    const sqlError = error as Partial<SqlError>;

    return {
      code: sqlError.code ?? undefined,
      errno: sqlError.errno,
      fatal: sqlError.fatal,
      message: sqlError.sqlMessage ?? error.message,
      sqlState: sqlError.sqlState ?? undefined,
    };
  }

  return {
    message: String(error),
  };
}

export function logDatabaseError(message: string, error: unknown) {
  databaseLogger.error("database", message, extractErrorDetails(error));
}

function assertSingleStatement(sql: string) {
  if (!sql.trim()) {
    throw new Error("Database query cannot be empty.");
  }

  if (sql.includes(";")) {
    throw new Error("Database query helper does not allow multiple statements.");
  }
}

function mapCommandResult(result: UpsertResult): DatabaseCommandResult {
  return {
    affectedRows: result.affectedRows,
    insertId: result.insertId ?? null,
    warningStatus: result.warningStatus,
  };
}

type DatabaseExecutor = Pick<Pool | PoolConnection, "execute">;

async function queryWithExecutor<T extends DatabaseRow = DatabaseRow>(
  executor: DatabaseExecutor,
  sql: string,
  params: readonly QueryParameter[] = [],
): Promise<T[]> {
  assertSingleStatement(sql);

  try {
    const rows = await executor.execute<T[], QueryParameter[]>(sql, [
      ...params,
    ]);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      databaseLogger.error("database", "Database configuration validation failed.", {
        message: error.message,
      });
      throw error;
    }

    const details = extractErrorDetails(error);
    databaseLogger.error("database", "Database query failed.", details);
    throw new DatabaseQueryError(details, error);
  }
}

async function executeWithExecutor(
  executor: DatabaseExecutor,
  sql: string,
  params: readonly QueryParameter[] = [],
): Promise<DatabaseCommandResult> {
  assertSingleStatement(sql);

  try {
    const result = await executor.execute<UpsertResult, QueryParameter[]>(
      sql,
      [...params],
    );
    return mapCommandResult(result);
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      databaseLogger.error("database", "Database configuration validation failed.", {
        message: error.message,
      });
      throw error;
    }

    const details = extractErrorDetails(error);
    databaseLogger.error("database", "Database query failed.", details);
    throw new DatabaseQueryError(details, error);
  }
}

export function setDatabaseLogger(logger: DatabaseLogger) {
  databaseLogger = logger;
}

export function validateDatabaseEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  const missingKeys = getMissingEnvKeys(source);

  if (missingKeys.length > 0) {
    throw new DatabaseConfigurationError(
      `Missing required database environment variables: ${missingKeys.join(", ")}.`,
    );
  }

  return {
    host: normalizeEnvValue(source.DB_HOST) ?? "",
    port: parseDatabasePort(normalizeEnvValue(source.DB_PORT) ?? ""),
    database: normalizeEnvValue(source.DB_NAME) ?? "",
    user: normalizeEnvValue(source.DB_USER) ?? "",
    password: normalizeEnvValue(source.DB_PASSWORD) ?? "",
  };
}

export function getDatabasePool(): Pool {
  const config = validateDatabaseEnvironment();
  const poolKey = getPoolKey(config);

  if (activePool && activePoolKey !== poolKey) {
    const stalePool = activePool;
    void stalePool.end().catch((error: unknown) => {
      logDatabaseError("Failed to close stale MariaDB connection pool.", error);
    });
    activePool = null;
    activePoolKey = null;
  }

  if (!activePool) {
    activePool = mariadb.createPool(buildPoolConfig(config));
    activePoolKey = poolKey;
    databaseLogger.info("database", "MariaDB connection pool created.", {
      database: config.database,
      host: config.host,
      port: config.port,
      user: config.user,
    });
  }

  return activePool;
}

export async function query<T extends DatabaseRow = DatabaseRow>(
  sql: string,
  params: readonly QueryParameter[] = [],
): Promise<T[]> {
  return queryWithExecutor(getDatabasePool(), sql, params);
}

export async function execute(
  sql: string,
  params: readonly QueryParameter[] = [],
): Promise<DatabaseCommandResult> {
  return executeWithExecutor(getDatabasePool(), sql, params);
}

export async function withTransaction<T>(
  callback: (transaction: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  let connection: PoolConnection | null = null;

  try {
    connection = await getDatabasePool().getConnection();
    await connection.beginTransaction();

    const transaction: DatabaseTransaction = {
      query: (sql, params = []) =>
        queryWithExecutor(connection as PoolConnection, sql, params),
      execute: (sql, params = []) =>
        executeWithExecutor(connection as PoolConnection, sql, params),
    };

    const result = await callback(transaction);
    await connection.commit();
    return result;
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        logDatabaseError("Database transaction rollback failed.", rollbackError);
      }
    }

    logDatabaseError("Database transaction failed.", error);
    throw error;
  } finally {
    if (connection) {
      try {
        await connection.release();
      } catch (releaseError) {
        logDatabaseError("Failed to release MariaDB connection.", releaseError);
      }
    }
  }
}

export async function checkDatabaseConnection(): Promise<DatabaseHealthResult> {
  try {
    const rows = await query<{ ok: number }>("SELECT 1 AS ok");
    const ok = rows[0]?.ok === 1;

    if (ok) {
      databaseLogger.info("database", "MariaDB connection check succeeded.");
    } else {
      databaseLogger.warn("database", "MariaDB connection check returned an unexpected result.");
    }

    return {
      ok,
      databaseReady: ok,
      checkedAt: new Date().toISOString(),
      error: ok ? undefined : "Database health check returned an unexpected result.",
    };
  } catch (error) {
    const details = extractErrorDetails(error);
    databaseLogger.error("database", "MariaDB connection check failed.", details);

    return {
      ok: false,
      databaseReady: false,
      checkedAt: new Date().toISOString(),
      error:
        error instanceof DatabaseConfigurationError
          ? error.message
          : "Database connection failed.",
    };
  }
}

export async function closeDatabasePool(): Promise<void> {
  if (!activePool) {
    return;
  }

  const pool = activePool;
  activePool = null;
  activePoolKey = null;
  await pool.end();
}

export function isDuplicateKeyError(error: unknown): boolean {
  return (
    error instanceof DatabaseQueryError &&
    (error.errno === 1062 || error.code === "ER_DUP_ENTRY")
  );
}
