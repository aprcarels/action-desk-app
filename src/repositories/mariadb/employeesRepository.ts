import { query, type DatabaseRow } from "../../persistence/mariadb/database";
import {
  readBoolean,
  readId,
  readNullableString,
  readString,
} from "./rowMappers";
import type { Employee, EmployeeRole } from "./schemaTypes";

const EMPLOYEE_SELECT = `
  SELECT
    id,
    microsoft_user_id AS microsoftUserId,
    display_name AS displayName,
    email,
    role,
    department,
    is_active AS isActive,
    is_online AS isOnline,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM employees
`;

function mapEmployee(row: DatabaseRow): Employee {
  return {
    id: readId(row, "id"),
    microsoftUserId: readNullableString(row, "microsoftUserId"),
    displayName: readString(row, "displayName"),
    email: readString(row, "email"),
    role: readString(row, "role") as EmployeeRole,
    department: readNullableString(row, "department"),
    isActive: readBoolean(row, "isActive"),
    isOnline: readBoolean(row, "isOnline"),
    createdAt: readString(row, "createdAt"),
    updatedAt: readString(row, "updatedAt"),
  };
}

export async function getActiveCSRs(): Promise<Employee[]> {
  const rows = await query(
    `${EMPLOYEE_SELECT} WHERE role = ? AND is_active = TRUE ORDER BY display_name ASC`,
    ["csr"],
  );

  return rows.map(mapEmployee);
}

export const employeesRepository = {
  getActiveCSRs,
};
