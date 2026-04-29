-- Action Desk - MariaDB Schema + Seed Data
-- Target: MariaDB
-- Drop-in replacement for schema.sql
-- Compatibility fixes:
--   1) Creates/selects the action_desk database
--   2) Uses UTC session time with CURRENT_TIMESTAMP defaults
--   3) Removes CHECK constraints for MariaDB server compatibility
--
-- IMPORTANT: This script drops existing Action Desk tables listed below before recreating them.

CREATE DATABASE IF NOT EXISTS action_desk
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE action_desk;

SET time_zone = '+00:00';

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS subscription_audit_log;
DROP TABLE IF EXISTS mailbox_subscriptions;
DROP TABLE IF EXISTS classification_results;
DROP TABLE IF EXISTS routing_rules;
DROP TABLE IF EXISTS ticket_assignments;
DROP TABLE IF EXISTS ticket_messages;
DROP TABLE IF EXISTS sla_events;
DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS holiday_calendar;
DROP TABLE IF EXISTS business_hours;
DROP TABLE IF EXISTS sla_profiles;
DROP TABLE IF EXISTS customer_csr_assignments;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS queues;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS app_settings;

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- Core lookup / admin tables
-- =========================================================

CREATE TABLE app_settings (
  setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
  setting_value TEXT NOT NULL,
  description VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE employees (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  microsoft_user_id VARCHAR(255) NULL,
  display_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role ENUM('csr','team_lead','supervisor','admin','manager','employee') NOT NULL DEFAULT 'employee',
  department VARCHAR(100) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_online BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_employees_email (email),
  UNIQUE KEY uq_employees_microsoft_user_id (microsoft_user_id),
  INDEX idx_employees_role (role),
  INDEX idx_employees_active_online (is_active, is_online)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE queues (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  queue_type ENUM('customer','internal','management','supervisor','verification','general') NOT NULL DEFAULT 'general',
  default_sla_profile_id BIGINT UNSIGNED NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_queues_name (name),
  INDEX idx_queues_type (queue_type),
  INDEX idx_queues_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  company VARCHAR(255) NULL,
  domain VARCHAR(255) NULL,
  assigned_csr_id BIGINT UNSIGNED NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_customers_email (email),
  INDEX idx_customers_domain (domain),
  INDEX idx_customers_company (company),
  INDEX idx_customers_assigned_csr_id (assigned_csr_id),
  CONSTRAINT fk_customers_assigned_csr FOREIGN KEY (assigned_csr_id) REFERENCES employees(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customer_csr_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  assignment_role ENUM('primary','secondary','backup') NOT NULL DEFAULT 'primary',
  location_name VARCHAR(255) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
  updated_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP() ON UPDATE UTC_TIMESTAMP(),
  UNIQUE KEY uq_customer_employee_location (customer_id, employee_id, location_name),
  INDEX idx_customer_csr_assignments_customer (customer_id, is_active, assignment_role),
  INDEX idx_customer_csr_assignments_employee (employee_id, is_active),
  CONSTRAINT fk_customer_csr_assignments_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_customer_csr_assignments_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- SLA configuration tables
-- =========================================================

CREATE TABLE sla_profiles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(500) NULL,
  target_minutes INT UNSIGNED NOT NULL,
  warning_threshold_pct TINYINT UNSIGNED NOT NULL,
  critical_threshold_pct TINYINT UNSIGNED NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sla_profiles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE business_hours (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  queue_id BIGINT UNSIGNED NULL,
  day_of_week TINYINT UNSIGNED NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_business_hours_queue_day (queue_id, day_of_week, is_active),
  CONSTRAINT fk_business_hours_queue FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE holiday_calendar (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  holiday_date DATE NOT NULL,
  name VARCHAR(100) NOT NULL,
  queue_id BIGINT UNSIGNED NULL,
  is_working_day BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_holiday_queue_date (queue_id, holiday_date),
  INDEX idx_holiday_date (holiday_date),
  CONSTRAINT fk_holiday_queue FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add queue FK to SLA after sla_profiles exists.
ALTER TABLE queues
  ADD CONSTRAINT fk_queues_default_sla_profile
  FOREIGN KEY (default_sla_profile_id) REFERENCES sla_profiles(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- =========================================================
-- Ticket tables
-- =========================================================

CREATE TABLE tickets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  conversation_id VARCHAR(255) NOT NULL,
  source ENUM('shared_mailbox','direct_mailbox','app','email_sync','delta_sync','webhook') NOT NULL DEFAULT 'webhook',
  mailbox_id VARCHAR(255) NOT NULL,
  received_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  subject VARCHAR(500) NOT NULL,
  status ENUM('open','pending','resolved','closed') NOT NULL DEFAULT 'open',
  priority ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',

  sender_email VARCHAR(255) NOT NULL,
  sender_type ENUM('known_customer','internal_employee','management','unknown','domain_match') NOT NULL DEFAULT 'unknown',
  customer_id BIGINT UNSIGNED NULL,
  match_confidence FLOAT NOT NULL DEFAULT 0,

  queue_id BIGINT UNSIGNED NULL,
  assigned_csr_id BIGINT UNSIGNED NULL,
  sla_profile_id BIGINT UNSIGNED NOT NULL,

  sla_state ENUM('OK','WARNING','CRITICAL','BREACHED') NOT NULL DEFAULT 'OK',
  sla_elapsed_minutes INT UNSIGNED NOT NULL DEFAULT 0,

  first_response_at DATETIME NULL,
  resolved_at DATETIME NULL,
  closed_at DATETIME NULL,

  flags JSON NULL,

  UNIQUE KEY uq_tickets_conversation_id (conversation_id),
  INDEX idx_tickets_conversation_id (conversation_id),
  INDEX idx_tickets_sla_state (sla_state),
  INDEX idx_tickets_assigned_csr_id (assigned_csr_id),
  INDEX idx_tickets_received_at (received_at),
  INDEX idx_tickets_status (status),
  INDEX idx_tickets_queue_status (queue_id, status),
  INDEX idx_tickets_unassigned_received (assigned_csr_id, status, received_at),
  INDEX idx_tickets_customer_id (customer_id),
  CONSTRAINT fk_tickets_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_tickets_queue FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_tickets_assigned_csr FOREIGN KEY (assigned_csr_id) REFERENCES employees(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_tickets_sla_profile FOREIGN KEY (sla_profile_id) REFERENCES sla_profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ticket_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  message_id VARCHAR(255) NOT NULL,
  conversation_id VARCHAR(255) NOT NULL,
  mailbox_id VARCHAR(255) NOT NULL,
  direction ENUM('inbound','outbound') NOT NULL,
  source ENUM('app','webhook','email_sync','delta_sync') NOT NULL,
  from_email VARCHAR(255) NOT NULL,
  to_emails TEXT NULL,
  cc_emails TEXT NULL,
  subject VARCHAR(500) NOT NULL,
  body_preview TEXT NULL,
  sent_or_received_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ticket_messages_message_id (message_id),
  INDEX idx_ticket_messages_ticket_id (ticket_id),
  INDEX idx_ticket_messages_conversation_id (conversation_id),
  INDEX idx_ticket_messages_sent_received (sent_or_received_at),
  CONSTRAINT fk_ticket_messages_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ticket_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  assigned_to_employee_id BIGINT UNSIGNED NULL,
  assigned_to_queue_id BIGINT UNSIGNED NULL,
  assigned_by_employee_id BIGINT UNSIGNED NULL,
  assignment_type ENUM('automatic','manual','escalation','reroute') NOT NULL,
  reason VARCHAR(500) NOT NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME NULL,
  INDEX idx_ticket_assignments_ticket_id (ticket_id),
  INDEX idx_ticket_assignments_employee (assigned_to_employee_id),
  INDEX idx_ticket_assignments_queue (assigned_to_queue_id),
  INDEX idx_ticket_assignments_assigned_at (assigned_at),
  CONSTRAINT fk_ticket_assignments_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ticket_assignments_employee FOREIGN KEY (assigned_to_employee_id) REFERENCES employees(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_ticket_assignments_queue FOREIGN KEY (assigned_to_queue_id) REFERENCES queues(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_ticket_assignments_assigned_by FOREIGN KEY (assigned_by_employee_id) REFERENCES employees(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sla_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  event_type ENUM('CREATED','RECALCULATED','WARNING','CRITICAL','BREACHED','FIRST_RESPONSE','RESOLVED','PROFILE_CHANGED') NOT NULL,
  sla_profile_id BIGINT UNSIGNED NOT NULL,
  elapsed_minutes INT UNSIGNED NOT NULL,
  sla_state ENUM('OK','WARNING','CRITICAL','BREACHED') NOT NULL,
  event_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  details JSON NULL,
  INDEX idx_sla_events_ticket_id (ticket_id),
  INDEX idx_sla_events_event_type (event_type),
  INDEX idx_sla_events_event_at (event_at),
  CONSTRAINT fk_sla_events_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_sla_events_profile FOREIGN KEY (sla_profile_id) REFERENCES sla_profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE classification_results (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  category ENUM('billing','technical','complaint','internal_request','management_task','inquiry','escalation','other') NOT NULL,
  urgency ENUM('low','medium','high','critical') NOT NULL,
  importance ENUM('low','medium','high','critical') NOT NULL,
  suggested_action ENUM('assign_csr','escalate','create_task','route_to_department','hold_for_review') NOT NULL,
  requires_response BOOLEAN NOT NULL,
  estimated_due_date DATETIME NULL,
  summary VARCHAR(1000) NOT NULL,
  confidence FLOAT NOT NULL DEFAULT 0,
  raw_llm_response LONGTEXT NULL,
  validation_status ENUM('valid','fallback','invalid_json','invalid_schema','llm_unavailable') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_classification_ticket_id (ticket_id),
  INDEX idx_classification_category_action (category, suggested_action),
  INDEX idx_classification_urgency (urgency),
  CONSTRAINT fk_classification_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE routing_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rule_name VARCHAR(100) NOT NULL,
  priority_order INT UNSIGNED NOT NULL,
  sender_type ENUM('known_customer','internal_employee','management','unknown','domain_match') NULL,
  category ENUM('billing','technical','complaint','internal_request','management_task','inquiry','escalation','other') NULL,
  urgency ENUM('low','medium','high','critical') NULL,
  importance ENUM('low','medium','high','critical') NULL,
  suggested_action ENUM('assign_csr','escalate','create_task','route_to_department','hold_for_review') NULL,
  target_queue_id BIGINT UNSIGNED NULL,
  target_role ENUM('csr','team_lead','supervisor','admin','manager','employee') NULL,
  sla_profile_id BIGINT UNSIGNED NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_routing_rules_name (rule_name),
  INDEX idx_routing_rules_priority (priority_order, is_active),
  INDEX idx_routing_rules_match (sender_type, category, suggested_action, urgency, importance),
  CONSTRAINT fk_routing_rules_queue FOREIGN KEY (target_queue_id) REFERENCES queues(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_routing_rules_sla FOREIGN KEY (sla_profile_id) REFERENCES sla_profiles(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Microsoft Graph subscription tables
-- =========================================================

CREATE TABLE mailbox_subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  subscription_id VARCHAR(255) NOT NULL,
  mailbox_id VARCHAR(255) NOT NULL,
  mailbox_type ENUM('shared','csr') NOT NULL,
  resource VARCHAR(500) NOT NULL,
  delta_link LONGTEXT NULL,
  expires_at DATETIME NOT NULL,
  last_renewed_at DATETIME NULL,
  status ENUM('active','expired','failed') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mailbox_subscriptions_subscription_id (subscription_id),
  UNIQUE KEY uq_mailbox_subscriptions_mailbox_resource (mailbox_id, resource),
  INDEX idx_mailbox_subscriptions_expiry (expires_at, status),
  INDEX idx_mailbox_subscriptions_mailbox (mailbox_id),
  INDEX idx_mailbox_subscriptions_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE subscription_audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  subscription_id VARCHAR(255) NULL,
  mailbox_id VARCHAR(255) NOT NULL,
  event_type ENUM('REGISTERED','RENEWED','EXPIRED','FAILED','RECOVERED','DELTA_SYNC') NOT NULL,
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  succeeded_at DATETIME NULL,
  error_message TEXT NULL,
  delta_link LONGTEXT NULL,
  INDEX idx_subscription_audit_subscription_id (subscription_id),
  INDEX idx_subscription_audit_mailbox_id (mailbox_id),
  INDEX idx_subscription_audit_event_type (event_type),
  INDEX idx_subscription_audit_attempted_at (attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- General audit log
-- =========================================================

CREATE TABLE audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  entity_type VARCHAR(100) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(100) NOT NULL,
  actor_employee_id BIGINT UNSIGNED NULL,
  event_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  old_values JSON NULL,
  new_values JSON NULL,
  details JSON NULL,
  INDEX idx_audit_entity (entity_type, entity_id),
  INDEX idx_audit_event_type (event_type),
  INDEX idx_audit_event_at (event_at),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_employee_id) REFERENCES employees(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Seed data
-- =========================================================

INSERT INTO sla_profiles (id, name, description, target_minutes, warning_threshold_pct, critical_threshold_pct, is_active)
VALUES
  (1, 'customer_standard', 'Standard customer request SLA', 480, 70, 90, TRUE),
  (2, 'customer_critical', 'Critical customer issue SLA', 120, 60, 85, TRUE),
  (3, 'internal_request', 'Internal employee request SLA', 960, 70, 90, TRUE),
  (4, 'management_task', 'Management request SLA requiring acknowledgement', 240, 50, 80, TRUE),
  (5, 'unassigned_holding', 'Unassigned or unknown sender holding SLA', 30, 50, 80, TRUE);

INSERT INTO queues (id, name, queue_type, default_sla_profile_id, is_active)
VALUES
  (1, 'customer_standard_queue', 'customer', 1, TRUE),
  (2, 'customer_critical_queue', 'customer', 2, TRUE),
  (3, 'internal_queue', 'internal', 3, TRUE),
  (4, 'management_queue', 'management', 4, TRUE),
  (5, 'supervisor_queue', 'supervisor', 5, TRUE),
  (6, 'verification_queue', 'verification', 5, TRUE),
  (7, 'general_queue', 'general', 1, TRUE);

-- Default global business hours: Monday-Friday, 09:00-17:00 UTC.
-- day_of_week: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday.
INSERT INTO business_hours (queue_id, day_of_week, start_time, end_time, is_active)
VALUES
  (NULL, 1, '09:00:00', '17:00:00', TRUE),
  (NULL, 2, '09:00:00', '17:00:00', TRUE),
  (NULL, 3, '09:00:00', '17:00:00', TRUE),
  (NULL, 4, '09:00:00', '17:00:00', TRUE),
  (NULL, 5, '09:00:00', '17:00:00', TRUE),
  (NULL, 0, '09:00:00', '17:00:00', FALSE),
  (NULL, 6, '09:00:00', '17:00:00', FALSE);

INSERT INTO routing_rules (
  rule_name,
  priority_order,
  sender_type,
  category,
  urgency,
  importance,
  suggested_action,
  target_queue_id,
  target_role,
  sla_profile_id,
  is_active
)
VALUES
  ('management_tasks_to_management_queue', 10, 'management', 'management_task', NULL, NULL, 'create_task', 4, 'manager', 4, TRUE),
  ('critical_escalations_to_critical_queue', 20, NULL, 'escalation', 'critical', NULL, 'escalate', 2, 'supervisor', 2, TRUE),
  ('complaints_to_supervisor_queue', 30, NULL, 'complaint', NULL, NULL, 'escalate', 5, 'supervisor', 2, TRUE),
  ('internal_requests_to_internal_queue', 40, 'internal_employee', 'internal_request', NULL, NULL, 'route_to_department', 3, 'team_lead', 3, TRUE),
  ('domain_match_to_verification_queue', 50, 'domain_match', NULL, NULL, NULL, 'hold_for_review', 6, 'supervisor', 5, TRUE),
  ('unknown_to_supervisor_queue', 60, 'unknown', NULL, NULL, NULL, 'hold_for_review', 5, 'supervisor', 5, TRUE),
  ('known_customer_assign_csr_standard', 70, 'known_customer', NULL, NULL, NULL, 'assign_csr', 1, 'csr', 1, TRUE),
  ('default_hold_for_review', 999, NULL, NULL, NULL, NULL, 'hold_for_review', 5, 'supervisor', 5, TRUE);

INSERT INTO app_settings (setting_key, setting_value, description)
VALUES
  ('round_robin_pointer_csr', '0', 'Persistent pointer for normal-priority CSR round-robin assignment.'),
  ('shared_mailbox_email', 'ecomcsr@apexpress.com', 'Primary shared customer service mailbox.'),
  ('sla_timezone_display', 'America/Los_Angeles', 'Display timezone only; all stored timestamps remain UTC.');

-- Optional starter employees. Change emails/names later.
INSERT INTO employees (display_name, email, role, department, is_active, is_online)
VALUES
  ('Action Desk Admin', 'admin@example.com', 'admin', 'Customer Service', TRUE, FALSE),
  ('Supervisor Queue Owner', 'supervisor@example.com', 'supervisor', 'Customer Service', TRUE, FALSE);

-- Seed audit entries documenting initial setup.
INSERT INTO audit_log (entity_type, entity_id, event_type, details)
VALUES
  ('system', NULL, 'SCHEMA_INITIALIZED', JSON_OBJECT('database', 'action_desk', 'engine', 'MariaDB')),
  ('sla_profiles', NULL, 'SEED_DATA_INSERTED', JSON_OBJECT('count', 5)),
  ('queues', NULL, 'SEED_DATA_INSERTED', JSON_OBJECT('count', 7)),
  ('routing_rules', NULL, 'SEED_DATA_INSERTED', JSON_OBJECT('count', 8));
