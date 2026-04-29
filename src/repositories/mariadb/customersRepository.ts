import { query, type DatabaseRow } from "../../persistence/mariadb/database";
import {
  readBoolean,
  readId,
  readNullableId,
  readNullableString,
  readString,
} from "./rowMappers";
import type { Customer, CustomerCsrAssignment, DatabaseId } from "./schemaTypes";

const CUSTOMER_SELECT = `
  SELECT
    id,
    name,
    email,
    company,
    domain,
    assigned_csr_id AS assignedCsrId,
    is_active AS isActive,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM customers
`;

function mapCustomer(row: DatabaseRow): Customer {
  return {
    id: readId(row, "id"),
    name: readString(row, "name"),
    email: readString(row, "email"),
    company: readNullableString(row, "company"),
    domain: readNullableString(row, "domain"),
    assignedCsrId: readNullableId(row, "assignedCsrId"),
    assignedCSRs: [],
    isActive: readBoolean(row, "isActive"),
    createdAt: readString(row, "createdAt"),
    updatedAt: readString(row, "updatedAt"),
  };
}

function mapCustomerCsrAssignment(row: DatabaseRow): CustomerCsrAssignment {
  return {
    id: readId(row, "id"),
    customerId: readId(row, "customerId"),
    employeeId: readId(row, "employeeId"),
    employeeDisplayName: readString(row, "employeeDisplayName"),
    employeeEmail: readString(row, "employeeEmail"),
    assignmentRole: readString(row, "assignmentRole") as CustomerCsrAssignment["assignmentRole"],
    locationName: readNullableString(row, "locationName"),
    isActive: readBoolean(row, "isActive"),
    createdAt: readString(row, "createdAt"),
    updatedAt: readString(row, "updatedAt"),
  };
}

async function getAssignmentsByCustomerId(
  customerId: string,
): Promise<CustomerCsrAssignment[]> {
  const rows = await query(
    `
      SELECT
        cca.id,
        cca.customer_id AS customerId,
        cca.employee_id AS employeeId,
        employees.display_name AS employeeDisplayName,
        employees.email AS employeeEmail,
        cca.assignment_role AS assignmentRole,
        cca.location_name AS locationName,
        cca.is_active AS isActive,
        cca.created_at AS createdAt,
        cca.updated_at AS updatedAt
      FROM customer_csr_assignments cca
      JOIN employees ON employees.id = cca.employee_id
      WHERE cca.customer_id = ? AND cca.is_active = TRUE AND employees.is_active = TRUE
      ORDER BY
        CASE cca.assignment_role
          WHEN 'primary' THEN 0
          WHEN 'secondary' THEN 1
          ELSE 2
        END,
        employees.display_name ASC,
        cca.id ASC
    `,
    [customerId],
  );

  return rows.map(mapCustomerCsrAssignment);
}

async function attachAssignments(customer: Customer | null): Promise<Customer | null> {
  if (!customer) {
    return null;
  }

  const assignedCSRs = await getAssignmentsByCustomerId(customer.id);

  if (assignedCSRs.length > 0) {
    return {
      ...customer,
      assignedCSRs,
    };
  }

  if (!customer.assignedCsrId) {
    return customer;
  }

  const rows = await query(
    `
      SELECT
        employees.id AS employeeId,
        employees.display_name AS employeeDisplayName,
        employees.email AS employeeEmail
      FROM employees
      WHERE employees.id = ? AND employees.is_active = TRUE
      LIMIT 1
    `,
    [customer.assignedCsrId],
  );
  const fallbackEmployee = rows[0];

  if (!fallbackEmployee) {
    return customer;
  }

  return {
    ...customer,
    assignedCSRs: [
      {
        id: `legacy-${customer.id}-${customer.assignedCsrId}`,
        customerId: customer.id,
        employeeId: readId(fallbackEmployee, "employeeId"),
        employeeDisplayName: readString(fallbackEmployee, "employeeDisplayName"),
        employeeEmail: readString(fallbackEmployee, "employeeEmail"),
        assignmentRole: "primary",
        locationName: null,
        isActive: true,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      },
    ],
  };
}

export async function getByEmail(email: string): Promise<Customer | null> {
  const normalizedEmail = email.trim();

  if (!normalizedEmail) {
    return null;
  }

  const rows = await query(`${CUSTOMER_SELECT} WHERE email = ? LIMIT 1`, [
    normalizedEmail,
  ]);
  return attachAssignments(rows[0] ? mapCustomer(rows[0]) : null);
}

export async function getById(id: DatabaseId): Promise<Customer | null> {
  const normalizedId = String(id).trim();

  if (!normalizedId) {
    return null;
  }

  const rows = await query(`${CUSTOMER_SELECT} WHERE id = ? LIMIT 1`, [
    normalizedId,
  ]);
  return attachAssignments(rows[0] ? mapCustomer(rows[0]) : null);
}

export const customersRepository = {
  getById,
  getByEmail,
  getAssignmentsByCustomerId,
};
