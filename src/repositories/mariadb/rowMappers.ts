import type { DatabaseRow, QueryParameter } from "../../persistence/mariadb/database";
import type { DatabaseId } from "./schemaTypes";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readString(row: DatabaseRow, key: string): string {
  const value = row[key];

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value === null || value === undefined ? "" : String(value);
}

export function readNullableString(row: DatabaseRow, key: string): string | null {
  const value = row[key];

  if (value === null || value === undefined) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : String(value);
}

export function readNumber(row: DatabaseRow, key: string): number {
  const value = row[key];

  if (typeof value === "number") {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function readBoolean(row: DatabaseRow, key: string): boolean {
  const value = row[key];

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return value === 1 || value === 1n;
  }

  if (typeof value === "string") {
    return value === "1" || value.toLowerCase() === "true";
  }

  return false;
}

export function readId(row: DatabaseRow, key: string): string {
  return readString(row, key);
}

export function readNullableId(row: DatabaseRow, key: string): string | null {
  return readNullableString(row, key);
}

export function readJsonObject(
  row: DatabaseRow,
  key: string,
): Record<string, unknown> | null {
  const value = row[key];

  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return isPlainObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return isPlainObject(value) ? value : null;
}

export function toNullableSqlValue(value: DatabaseId | null | undefined): QueryParameter {
  return value === undefined ? null : value;
}

export function toSqlJson(value: Record<string, unknown> | null | undefined): string | null {
  return value ? JSON.stringify(value) : null;
}
