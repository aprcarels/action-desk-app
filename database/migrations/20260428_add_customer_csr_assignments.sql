-- Adds multi-CSR ownership while preserving customers.assigned_csr_id.

CREATE TABLE IF NOT EXISTS customer_csr_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  assignment_role ENUM('primary','secondary','backup') NOT NULL DEFAULT 'primary',
  location_name VARCHAR(255) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_customer_employee_location (customer_id, employee_id, location_name),
  INDEX idx_customer_csr_assignments_customer (customer_id, is_active, assignment_role),
  INDEX idx_customer_csr_assignments_employee (employee_id, is_active),
  CONSTRAINT fk_customer_csr_assignments_customer
    FOREIGN KEY (customer_id) REFERENCES customers(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_customer_csr_assignments_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO customer_csr_assignments (
  customer_id,
  employee_id,
  assignment_role,
  location_name,
  is_active
)
SELECT
  customers.id,
  customers.assigned_csr_id,
  'primary',
  NULL,
  TRUE
FROM customers
LEFT JOIN customer_csr_assignments existing_assignment
  ON existing_assignment.customer_id = customers.id
  AND existing_assignment.employee_id = customers.assigned_csr_id
  AND existing_assignment.location_name IS NULL
WHERE assigned_csr_id IS NOT NULL
  AND existing_assignment.id IS NULL;
