# Action Desk – Codex Implementation Plan

## RULES FOR CODEX (CRITICAL)

- You MUST inspect the existing repository before making changes
- You MUST NOT delete existing working functionality
- You MUST use MariaDB-compatible SQL (NOT PostgreSQL)
- You MUST write production-ready code (no placeholders)
- You MUST implement full features — not partial stubs
- You MUST include error handling for all external calls
- You MUST log all state changes to audit tables
- You MUST follow existing project structure and patterns

---

## PACKET 1 — DATABASE FOUNDATION

### Current Status
The MariaDB database schema has already been created manually from:

database/schema.sql

Codex should NOT recreate, drop, or redesign the schema unless explicitly asked.

### Codex Task
Use the existing schema and build only:
- MariaDB connection helper
- environment variable validation
- query helper
- repository functions for core tables
- basic database health check
### Goal
Create the full MariaDB database schema and connection layer.

### Scope
- Create all tables:
  - tickets
  - customers
  - employees
  - ticket_messages
  - ticket_assignments
  - classification_results
  - sla_profiles
  - business_hours
  - holiday_calendar
  - mailbox_subscriptions
  - subscription_audit_log
- Add all indexes and foreign keys
- Add seed data:
  - default SLA profiles
  - default business hours (Mon–Fri 9–5)
- Create database connection service
- Create base repository/query helper functions

### Acceptance Criteria
- App connects to MariaDB successfully
- Tables exist and can be queried
- Seed data is inserted
- No SQL errors

---

## PACKET 2 — TICKET + EMAIL INGESTION

### Goal
Create ticket system and email ingestion pipeline.

### Scope
- Implement ticket creation using conversationId
- Prevent duplicate tickets using unique constraint
- Implement ticket_messages table
- Implement idempotent email insert (message_id unique)
- Create upsertTicket() logic with transaction
- Create audit logs for:
  - ticket created
  - message added

### Acceptance Criteria
- Same conversationId creates ONE ticket
- Multiple emails attach to same ticket
- Duplicate webhook events do NOT create duplicates

---

## PACKET 3 — SLA ENGINE

### Goal
Implement full SLA tracking system.

### Scope
- Implement:
  - advanceToWorkingTime()
  - getWorkingIntervals()
  - calculateBusinessMinutes()
  - getSlaState()
- Store SLA results on ticket:
  - sla_elapsed_minutes
  - sla_state
- Add SLA recalculation on:
  - ticket creation
  - ticket update
- Use business_hours + holidays tables

### Acceptance Criteria
- SLA excludes weekends
- SLA respects business hours
- SLA state changes correctly (OK → WARNING → CRITICAL → BREACHED)

---

## PACKET 4 — ROUTING ENGINE

### Goal
Automatically assign tickets.

### Scope
- Implement:
  - identifySender()
  - roundRobinCSR()
  - routeTicket()
- Use customers + employees tables
- Implement:
  - supervisor queue
  - management queue
  - internal queue
- Track assignment history

### Acceptance Criteria
- Known customers go to assigned CSR
- Unknown senders go to supervisor queue
- Critical tickets route to lowest-load CSR

---

## PACKET 5 — MICROSOFT GRAPH INTEGRATION

### Goal
Connect real email system.

### Scope
- Implement MSAL authentication
- Implement Graph webhook subscription
- Implement subscription renewal job
- Implement delta sync fallback
- Implement sent items sync
- Ensure all emails flow into ticket system

### Acceptance Criteria
- Emails create tickets automatically
- Replies update tickets
- No duplicate processing
- Subscription never expires without recovery

---

## TESTING CHECKLIST (FOR NON-DEVELOPERS)

After each packet:

1. Run the app
2. Check console for errors
3. Verify:
   - database tables exist
   - new data appears correctly
4. Report any errors exactly as shown

---