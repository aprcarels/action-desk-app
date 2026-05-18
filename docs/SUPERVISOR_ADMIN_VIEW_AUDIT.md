# Supervisor/Admin View Audit

Audit date: 2026-05-01

Scope: compare Admin and Supervisor data sources, filters, and transformations for users, customers, assignments, feed ownership, and workload. This pass does not change app behavior, schema, UI, or assignment resolver code.

## Executive Summary

Admin and Supervisor screens mostly use the same frontend state names, but those states are populated differently after bootstrap:

- Admin loads `workflowState.reps` and `savedCustomers` from `/api/workflow/bootstrap`, then refreshes users from `/api/admin/users` and replaces `workflowState.reps` with all active MariaDB-managed users.
- Supervisor loads `workflowState.reps` and `savedCustomers` only from `/api/workflow/bootstrap`. Supervisor does not call `/api/admin/users`.
- Supervisor correctness depends on normalized location ids matching across `currentUser.locationId`, CSR `rep.locationId`, customer `locationId`, and assignment `locationName`.
- Workload is empty when `getWorkloadVisibleReps()` receives no active `rep` records in the supervisor location. The workload summarizer itself includes zero-ticket CSRs if they are present in the input list.
- Feed assignment resolution happens before feed filtering, but it receives the already-scoped `savedCustomers` and `workflowState.reps`. If the supervisor bootstrap omitted a matching customer or CSR, feed cards can resolve to `unassigned` or `missing_rep` even when Admin sees the assignment.

The highest-probability root cause is not a label-rendering issue. It is a Supervisor-scoped directory payload issue, most likely caused by location normalization/mapping or by Supervisor using only the bootstrap-filtered `reps/customers` payload while Admin gets a full `/api/admin/users` refresh.

## Data Source Table

| Area | Admin source | Supervisor source | Backing store | Important functions/files |
| --- | --- | --- | --- | --- |
| Current user/session | `/api/auth/session`; then MariaDB overlay if repository is loaded | Same | SQLite session existence plus MariaDB employee resolution | `loadAuthSession()` in `src/services/sharedWorkflowApi.ts`; `/api/auth/session` in `electron/appServer.cjs`; `getDirectorySessionState()` in `electron/appServer.cjs`; `resolveCurrentRepProfile()` in `src/repositories/mariadb/workflowDirectoryRepository.ts` |
| User role/email/id/location | MariaDB `employees` once session is resolved | Same | MariaDB, with SQLite session id/rep mirror | `resolveSignInRepProfile()`, `resolveCurrentRepProfile()`, `mapEmployeeRowToRepProfile()` |
| Capabilities | Role-based policy | Role-based policy | In-memory policy | `getCapabilitiesForRole()` in `electron/sharedAuthPolicy.cjs` |
| Bootstrap route | `GET /api/workflow/bootstrap` | Same route | Mixed: MariaDB for users/customers; SQLite for thread state/presence/preferences/SLA | `getDirectoryBootstrap()` in `electron/appServer.cjs` |
| Bootstrap reps | All active MariaDB directory employees in allowed roles | Location-filtered active MariaDB employees; if supervisor location is missing, only self | MariaDB | `listVisibleRepProfiles()` |
| Bootstrap customers | All active MariaDB customers | Active MariaDB customers whose derived `customer.locationId` equals supervisor location | MariaDB | `listSavedCustomersForUser()` |
| Admin user list | `GET /api/admin/users` after bootstrap | Not called by frontend; supervisors lack `manage_users` | MariaDB | `loadSharedUsers()`; `/api/admin/users`; `listManagedUsers({ includeInactive: false })` |
| Customer save/delete/clear | `/api/workflow/customers/*` | Same endpoints | MariaDB when repository is loaded | `upsertSavedCustomer()`, `deleteSavedCustomer()`, `clearSavedCustomers()` |
| Settings customer list | `savedCustomers` from bootstrap/mutation response | Same state name, but supervisor-scoped payload | MariaDB payload, then frontend location filter | `SettingsPanel`; `CustomerListManager` |
| Settings CSR list | `workflowState.reps`; after admin refresh, all active users mapped from `/api/admin/users` | `workflowState.reps` from bootstrap only | MariaDB payload, frontend role/location filters | `applyAdminUsers()` in `src/App.tsx`; `CustomerListManager` |
| Location list | Static config | Static config, filtered to supervisor location if present | In-memory config | `ACTION_DESK_LOCATIONS` in `src/config/actionDeskLocations.json`; `src/services/locations.ts` |
| Feed queue cards | `queueItems` state from inbox/mock/test queue pipeline | Same | Frontend queue state plus SQLite shared thread state | `loadInboxQueue()`, `processInboxEmailBatch()`, `buildWorkflowThreads()` |
| Feed customer matching | Admin `savedCustomers` | Supervisor-scoped `savedCustomers` | MariaDB payload in frontend memory | `applyCustomerPriorityToEmails()`, `findCustomerMatch()` |
| Feed assignment resolution | Admin `savedCustomers` plus `workflowState.reps` | Supervisor-scoped `savedCustomers` plus supervisor-visible `workflowState.reps` | MariaDB payload plus SQLite manual/persisted thread assignment state | `resolveCanonicalAssignment()` |
| Workload reps | Active `role === "rep"` records from all active users | Active `role === "rep"` records whose location matches supervisor | MariaDB payload in frontend memory | `getWorkloadVisibleReps()` |
| Workload counts | Visible threads grouped over workload reps | Same, but empty if reps input is empty | Derived in frontend | `calculateRepWorkloadSummaries()` |

## Filter Table

| Filter | Admin behavior | Supervisor behavior | Risk |
| --- | --- | --- | --- |
| Session user active check | MariaDB employee must be active | Same | Deactivated MariaDB users are rejected, but a valid SQLite session must still exist before MariaDB overlay runs. |
| Role mapping | `admin` stays admin | MariaDB `supervisor`, `team_lead`, `manager` map to `supervisor`; `csr` maps to `rep` | If DB role is not one of the expected values, it maps to rep behavior. |
| Location normalization | Mostly bypassed for data visibility | Required for current user, reps, customers, cards, workload | Mismatched raw values in `employees.department` or `customer_csr_assignments.location_name` collapse supervisor views. |
| Bootstrap reps | All active employees in `admin`, `supervisor`, `team_lead`, `manager`, `csr` | Self plus employees whose location or active assignment location matches supervisor location | If supervisor location is missing, bootstrap reps become only self; workload then has zero CSRs because self is not `role === "rep"`. |
| Bootstrap customers | All active customers | Only customers whose derived customer location equals supervisor location | Customers with missing/unnormalized location disappear from Supervisor but appear in Admin. |
| Settings visible customers | All customers | `canAccessLocation(currentRep, customer.locationId)` after bootstrap | `canAccessLocation()` returns true for missing customer location, but the repository may already have filtered such customers out. |
| Settings visible owner reps | All active role `rep` users; location select may further filter | Active role `rep` users where `rep.locationId` equals supervisor location, then selected customer location | Supervisor cannot display assignments to CSRs missing from bootstrap or with non-normalized locations. |
| Feed location scope | Admin can access all locations | `canAccessLocation(currentRep, thread.locationId)` | If assignment resolution cannot derive a thread location, `canAccessLocation()` allows it; if it derives a different location, it hides it. |
| Feed unassigned filter | `assignmentStatus === "unassigned"` | Same, after assignment resolution with scoped inputs | Supervisor can see more unassigned cards if its scoped inputs are missing the customer/CSR. |
| Workload visible reps | All active CSRs | Active CSRs matching supervisor location | Empty workload means the input CSR list is empty or location-filtered out. |
| Zero-ticket CSR inclusion | Included | Included if present in workload rep input | Empty workload is not caused by zero-ticket filtering inside the workload summarizer. |

## 1. Current User/Session

Frontend entry point:

- `src/services/sharedWorkflowApi.ts`
  - `loadAuthSession()` calls `GET /api/auth/session`.
  - Session id is stored in browser `localStorage` under `action-desk.shared-session-id`.

Server route:

- `electron/appServer.cjs`
  - `/api/auth/session` first reads `store.getSessionSummary(sessionId)` from `sharedWorkflowStore`.
  - If a local session exists and the MariaDB repository is loaded, `getDirectorySessionState()` overlays:
    - `currentUser` from `workflowDirectoryRepository.resolveCurrentRepProfile(baseSummary.currentUser)`.
    - `reps` from `workflowDirectoryRepository.listVisibleRepProfiles(currentUser)`.
  - If MariaDB no longer has an active employee matching the session user id/email, access changes and the session is cleared.

Sign-in path:

- `electron/main.cjs`
  - Microsoft sign-in calls `desktopAppServer.startSessionForIdentity(...)`.
- `electron/appServer.cjs`
  - `startDirectoryBackedSession()` calls `workflowDirectoryRepository.resolveSignInRepProfile(identity)`.
  - Then it calls `store.startSessionForRepProfile(sessionId, repProfile)` to mirror the MariaDB profile into SQLite session tables.

Role/location mapping:

- `src/repositories/mariadb/workflowDirectoryRepository.ts`
  - `mapEmployeeRowToRepProfile()` maps MariaDB `employees` rows into `RepProfile`.
  - `employees.role` maps as:
    - `admin` -> `admin`
    - `supervisor`, `team_lead`, `manager` -> `supervisor`
    - other allowed directory role, especially `csr` -> `rep`
  - `employees.department` is normalized through `normalizeLocationId()`.
  - If `department` does not match a configured location id/name/alias, `locationId` becomes `undefined`.

Permissions:

- `electron/sharedAuthPolicy.cjs`
  - Admin has `manage_users`, `manage_customer_ownership`, `view_all_emails`, diagnostics, backup, and test data.
  - Supervisor has `manage_customer_ownership`, `view_all_emails`, and SLA ownership, but not `manage_users`.
  - This is why Admin refreshes the full user directory and Supervisor does not.

Admin vs Supervisor difference:

- Admin can survive bad or missing location fields because most visibility gates allow admins.
- Supervisor depends on a normalized `currentUser.locationId`. If it is missing, supervisor bootstrap reps fall back to self only and customers become empty.

## 2. Bootstrap Routes

### `GET /api/workflow/bootstrap`

Frontend:

- `src/App.tsx`
  - Initial boot calls `loadAuthSession()`, then `loadSharedWorkflowBootstrap()`.
  - Sign-in does the same after Microsoft auth.
  - Bootstrap sets:
    - `authSession.currentUser`
    - `workflowState`
    - `savedCustomers`
    - `slaSettings`

Route:

- `electron/appServer.cjs`
  - `/api/workflow/bootstrap` requires a valid session.
  - With MariaDB repository loaded, it calls `getDirectoryBootstrap()`.
  - `getDirectoryBootstrap()` uses:
    - `workflowDirectoryRepository.listSavedCustomersForUser(currentUser)` for customers.
    - session summary reps from `workflowDirectoryRepository.listVisibleRepProfiles(currentUser)`.
    - `store.listThreadStates(currentUser)`, `store.listThreadPresence()`, and `store.getPreferences(currentUser.id)` from SQLite/sharedWorkflowStore.
    - `store.getSlaSettings(currentUser.locationId)` from SQLite/sharedWorkflowStore.

Admin returned records:

- `currentUser`: active MariaDB employee mapped to admin.
- `reps`: all active MariaDB directory employees in allowed directory roles.
- `customers`: all active MariaDB customers.
- `workflowState.threadStates/presence/preferences`: SQLite/sharedWorkflowStore.
- `slaSettings`: SQLite/sharedWorkflowStore.

Supervisor returned records:

- `currentUser`: active MariaDB employee mapped to supervisor.
- `reps`: active MariaDB employees filtered by supervisor location.
- `customers`: active MariaDB customers filtered by derived customer location.
- `workflowState.threadStates`: SQLite/sharedWorkflowStore, location-filtered by thread state location.
- `threadPresence`: SQLite/sharedWorkflowStore, unscoped.
- `preferences` and `slaSettings`: SQLite/sharedWorkflowStore.

Important repository filters:

- `listVisibleRepProfiles(currentUser)`
  - Admin: returns all active profiles.
  - Supervisor:
    - `currentLocationId = normalizeLocationId(currentUser.locationId)`.
    - If no current location, returns only the current user's profile.
    - Otherwise returns self plus profiles whose `profile.locationId` equals supervisor location or whose active customer assignment location matches supervisor location.
- `listSavedCustomersForUser(currentUser)`
  - Admin: returns all active customers.
  - Supervisor:
    - If no current location, returns an empty list.
    - Otherwise returns customers where `normalizeLocationId(customer.locationId) === currentLocationId`.

### `GET /api/admin/users`

Frontend:

- `src/App.tsx`
  - `refreshAdminUsers()` calls `loadSharedUsers()`.
  - `loadSharedUsers()` calls `/api/admin/users`.
  - This is only called when bootstrap capabilities include `manage_users`.
  - Admin has `manage_users`; Supervisor does not.
  - `applyAdminUsers()` maps returned active `ManagedUser[]` into `RepProfile[]` and replaces `workflowState.reps`.

Route/repository:

- `electron/appServer.cjs`
  - `/api/admin/users` requires `manage_users`.
- `src/repositories/mariadb/workflowDirectoryRepository.ts`
  - `listManagedUsers({ includeInactive: false })` reads MariaDB `employees`.
  - It returns active users only unless `includeInactive` is explicitly true.

Admin returned records:

- All active MariaDB employees, mapped to `ManagedUser`.
- Then frontend maps them to `RepProfile` and updates `workflowState.reps`.

Supervisor returned records:

- None. The route is not called and Supervisor lacks the capability.

### `/api/workflow/customers`

There is no standalone `GET /api/workflow/customers` route in the audited code. Customer reads are done through `/api/workflow/bootstrap`, and customer writes return a fresh filtered customer list.

Equivalent customer routes:

- `/api/workflow/customers/upsert`
- `/api/workflow/customers/delete`
- `/api/workflow/customers/clear`

With the MariaDB repository loaded, these call:

- `upsertSavedCustomer(currentUser, customer)`
- `deleteSavedCustomer(currentUser, customerId)`
- `clearSavedCustomers(currentUser)`

Each returns `listSavedCustomersForUser(currentUser)`, so Admin receives all active customers after a mutation and Supervisor receives only matching-location customers after a mutation.

## 3. Settings Screens

Shared component path:

- `src/App.tsx` renders `SettingsPanel`.
- `SettingsPanel` passes:
  - `currentUser={currentRep}`
  - `reps={workflowState.reps}`
  - `customers={savedCustomers}`
  - `adminUsers={canManageUsers ? adminUsers : undefined}`
- `SettingsPanel` always renders `CustomerListManager`.
- `SettingsPanel` renders `UserAccessManager` only when `manage_users` is present.

### Admin Settings

Customer list source:

- `savedCustomers` from `/api/workflow/bootstrap` or customer mutation response.
- Backing source: MariaDB `customers` plus active `customer_csr_assignments`.
- Admin customer list is all active customers.

User/CSR list source:

- First bootstrap `workflowState.reps`.
- Then `/api/admin/users`, mapped by `applyAdminUsers()`, replaces `workflowState.reps`.
- Backing source: MariaDB `employees`.
- Active users only.

Location list source:

- Static `ACTION_DESK_LOCATIONS` in `src/config/actionDeskLocations.json`.

Assignment list source:

- `customer.assignedCSRs` produced by MariaDB `customer_csr_assignments`.
- Legacy fallback exists in repository mapping from `customers.assigned_csr_id` if no active assignment rows exist.

Filters:

- `CustomerListManager.visibleCustomers`: Admin sees all customers.
- `availableOwnerReps`: active `role === "rep"` only.
- Admin `visibleOwnerReps`: all active CSRs.
- `locationScopedOwnerReps`: further filtered by the selected customer location when a location is selected.

Where "Unassigned" is computed:

- Primary CSR dropdown has an explicit `<option value="">Unassigned</option>`.
- Customer card text uses `getCustomerOwnerRepIds(customer)`.
  - If no owner ids are present, it renders `Assigned CSRs: Unassigned`.
  - If owner ids exist but a rep is missing from `reps`, it renders `Assigned Rep Missing`, not `Unassigned`.
- Customer location label renders `Unassigned location` when `getLocationLabel(customer.locationId)` cannot normalize.

### Supervisor Settings

Customer list source:

- Same prop name, `savedCustomers`, but it is already filtered by `/api/workflow/bootstrap`.
- Backing source: MariaDB.
- Repository filter: customer derived location must equal supervisor location.

User/CSR list source:

- `workflowState.reps` from bootstrap only.
- Backing source: MariaDB.
- No `/api/admin/users` refresh.

Location list source:

- Same static config.
- `CustomerListManager.availableLocations` narrows to only the supervisor location when `currentRepLocationId` is present.

Assignment list source:

- Same `customer.assignedCSRs` from the bootstrap customers payload.
- Display names are resolved by finding each assignment rep id in the bootstrap `reps` prop.

Filters:

- `visibleCustomers`: after bootstrap, filtered again by `canAccessLocation(currentRep, customer.locationId)`.
- `visibleOwnerReps`: active `role === "rep"` where `normalizeLocationId(rep.locationId) === currentRepLocationId`.
- `locationScopedOwnerReps`: further filtered by selected form location.

Supervisor-specific failure modes:

- If the supervisor `currentRep.locationId` is undefined, `listSavedCustomersForUser()` returns no customers and `getWorkloadVisibleReps()` returns no CSRs.
- If CSR `employees.department` values do not normalize to the supervisor location, `workflowState.reps` lacks those CSRs.
- If customer location derivation does not normalize to the supervisor location, Supervisor bootstrap omits that customer before `CustomerListManager` can render it.
- If customers appear but assigned CSR ids are not present in supervisor `reps`, cards show `Assigned Rep Missing`.
- If customers have no active assignment rows and no legacy owner fallback, settings show `Unassigned`.

## 4. Feed Cards

Queue item source:

- `src/App.tsx` keeps `queueItems` in React state.
- Queue items are loaded/processed from the inbox pipeline (`loadInboxQueue()`, `processInboxEmailBatch()`) and optional test/demo queue routes.
- The code explicitly notes the visible feed still builds from inbox/mock/persisted queue items plus shared workflow settings.

Customer matching source:

- `buildWorkflowThreads({ items, workflowState, customers: savedCustomers })`.
- `applyCustomerSettingsToFeedItems()` calls `applyCustomerPriorityToEmails(items, customers)`.
- Matching uses the `savedCustomers` payload available to the current user:
  - Admin: all active MariaDB customers.
  - Supervisor: supervisor-location MariaDB customers only.

Assignment resolver input:

- `resolveCanonicalAssignment()` receives:
  - representative feed item
  - `customers` from `savedCustomers`
  - `reps` from `workflowState.reps`
  - optional `threadState` from SQLite/sharedWorkflowStore

Assignment resolver order:

1. Manual thread assignment from SQLite/sharedWorkflowStore.
2. Persisted auto assignment from SQLite/sharedWorkflowStore.
3. Customer ownership match from the current `customers` input.
4. Empty/unassigned resolution if no owner can be found.

Assignment resolver output:

- Assigned if primary assigned rep id exists and that rep is active/present in `reps`.
- Missing rep if a primary assigned rep id exists but the rep cannot be found active in `reps`.
- Unassigned if no primary rep id/customer ownership match exists.

Unassigned filter logic:

- `matchesQueueScope()` treats the `unassigned` queue as `thread.assignmentResolution.assignmentStatus === "unassigned"`.
- `applySupervisorQuickFilter({ quickFilter: "unassigned" })` uses the same assignment status.
- Metrics count unassigned with the same assignment status check.

Supervisor filtering order:

1. Build threads from current queue items, current `savedCustomers`, and current `workflowState.reps`.
2. Assignment resolution runs during `buildWorkflowThreads()`.
3. Then `filterWorkflowThreads()` applies:
   - queue scope
   - location scope
   - status filter
   - search

This means Supervisor assignment resolution happens with already supervisor-scoped customers/reps. If the scoped bootstrap payload is missing the matching customer or CSR, assignment is degraded before the Supervisor feed filter runs.

## 5. Workload Screen

Frontend path:

- `src/App.tsx`
  - `workloadVisibleReps = getWorkloadVisibleReps(workflowState.reps, currentRep)`.
  - `roleScopedWorkflowThreads = filterWorkflowThreads(...)`.
  - `repWorkloads = calculateRepWorkloadSummaries({ threads: roleScopedWorkflowThreads, reps: workloadVisibleReps })`.
  - `RepWorkloadPanel` renders every workload row it receives.

Admin behavior:

- `getWorkloadVisibleReps()` filters `workflowState.reps` to active `role === "rep"`.
- Admin receives all active CSRs because `applyAdminUsers()` replaces reps with all active users from `/api/admin/users`.

Supervisor behavior:

- `getWorkloadVisibleReps()` filters `workflowState.reps` to active `role === "rep"` and matching normalized location.
- If supervisor location is missing, returns `[]`.
- If bootstrap `workflowState.reps` has no active matching-location CSRs, returns `[]`.

Zero-ticket handling:

- `calculateRepWorkloadSummaries()` maps over the `reps` input first, then counts assigned threads.
- Therefore CSRs with zero cards are included if they are present in `workloadVisibleReps`.
- Empty workload points upstream to `workflowState.reps`, role mapping, active filtering, or location normalization, not to the workload summary calculation.

## 6. Intended Differences

Admin should see:

- All locations.
- All active customers.
- All active CSRs.
- All workload groups, including zero-ticket CSRs.
- Full user management.

Supervisor should see:

- Only the supervisor's normalized location.
- Only active CSRs in that location.
- Only customers/cards relevant to that location.
- Correct assignments for customers in that location.
- Zero-ticket CSRs in that location.
- No inactive/deactivated users unless an explicit inactive toggle exists.

## Root Cause Hypotheses

1. Location normalization mismatch is the most likely root cause.
   - Supervisor views depend on `normalizeLocationId()` for every visibility step.
   - Accepted configured locations are:
     - `apexpress_irwindale`
     - `apexpress_corona`
     - `worldpackusa_las_vegas`
   - Aliases are defined in `src/config/actionDeskLocations.json`.
   - Raw MariaDB values to inspect are `employees.department` and `customer_csr_assignments.location_name`.

2. Supervisor bootstrap is missing CSRs.
   - Admin Settings works because Admin refreshes users from `/api/admin/users`.
   - Supervisor never calls `/api/admin/users`; it depends only on `listVisibleRepProfiles(currentUser)`.
   - If that repository filter returns self only or omits active CSRs, workload is empty and assignment display cannot find reps.

3. Supervisor bootstrap is missing customers.
   - `listSavedCustomersForUser(supervisor)` filters after deriving each customer location.
   - Customer location is derived in this order:
     - active assignment `locationName`
     - assigned employee `department`
     - legacy assigned employee `department`
   - If none normalize to the supervisor location, Supervisor omits the customer even though Admin sees it.

4. Assignment resolution uses scoped inputs.
   - This is structurally correct for visibility, but it magnifies bad scoping.
   - The resolver cannot assign to a customer or CSR that bootstrap did not provide to the Supervisor view.

5. Repository fallback can reintroduce SQLite if the MariaDB repository is unavailable.
   - `electron/appServer.cjs` loads `../dist-electron/repositories/mariadb/workflowDirectoryRepository`.
   - If the compiled repository is missing, appServer falls back to `sharedWorkflowStore` behavior for directory-like routes.
   - Production should verify the built Electron artifact includes the MariaDB repository.

## Recommended Minimal Fix Plan

This audit pass does not implement the repair. The next repair should avoid UI label patches and start by proving the payload mismatch.

1. Capture actual payload diagnostics for one Admin and one Supervisor:
   - `/api/auth/session`
   - `/api/workflow/bootstrap`
   - `/api/admin/users` for Admin
   - Compare `currentUser.role`, `currentUser.email`, `currentUser.id`, `currentUser.locationId`, `reps.length`, active CSR count, `customers.length`, and active assignment count.

2. Query MariaDB raw location fields:

   ```sql
   SELECT id, display_name, email, role, department, is_active
   FROM employees
   WHERE is_active = TRUE
   ORDER BY role, display_name;
   ```

   ```sql
   SELECT
     cca.customer_id,
     c.name AS customer_name,
     cca.employee_id,
     e.display_name AS csr_name,
     cca.assignment_role,
     cca.location_name,
     e.department,
     cca.is_active AS assignment_active,
     e.is_active AS employee_active,
     c.is_active AS customer_active
   FROM customer_csr_assignments cca
   JOIN customers c ON c.id = cca.customer_id
   JOIN employees e ON e.id = cca.employee_id
   WHERE c.is_active = TRUE
     AND cca.is_active = TRUE
     AND e.is_active = TRUE
   ORDER BY c.name, cca.assignment_role, e.display_name;
   ```

3. Normalize or repair data before changing code if the raw values do not match configured ids/aliases.
   - Supervisor employee `department` must normalize.
   - CSR employee `department` must normalize.
   - Assignment `location_name` should normalize when present.

4. If data is correct but Supervisor bootstrap is still wrong, instrument only the repository/route payload in development:
   - current user id/email/role/location
   - `listVisibleRepProfiles()` input/output counts
   - `listSavedCustomersForUser()` input/output counts
   - customer ids filtered out because of location
   - assignment rows filtered out because employee inactive or location missing

5. After the payload mismatch is confirmed, fix the single source of truth path:
   - Keep customers/users/assignments MariaDB-backed.
   - Keep SQLite/sharedWorkflowStore only for thread state, presence, preferences, SLA, and temporary queue/test data.
   - Do not add a second assignment resolver.
   - Prefer repairing `listVisibleRepProfiles()` and `listSavedCustomersForUser()` scoping/data mapping over patching UI labels.

## Files/Functions Involved

Session and routes:

- `src/services/sharedWorkflowApi.ts`
  - `loadAuthSession()`
  - `loadSharedWorkflowBootstrap()`
  - `loadSharedUsers()`
  - customer mutation helpers
- `electron/main.cjs`
  - Microsoft sign-in IPC handler
- `electron/appServer.cjs`
  - `loadDefaultWorkflowDirectoryRepository()`
  - `getDirectorySessionState()`
  - `getDirectoryBootstrap()`
  - `startDirectoryBackedSession()`
  - `/api/auth/session`
  - `/api/workflow/bootstrap`
  - `/api/admin/users`
  - `/api/workflow/customers/*`
- `electron/sharedAuthPolicy.cjs`
  - `getCapabilitiesForRole()`
- `electron/sharedWorkflowStore.cjs`
  - `getSessionSummary()`
  - `startSessionForRepProfile()`
  - `listThreadStates()`
  - `listThreadPresence()`
  - `getPreferences()`
  - `getSlaSettings()`

MariaDB directory repository:

- `src/repositories/mariadb/workflowDirectoryRepository.ts`
  - `resolveSignInRepProfile()`
  - `resolveCurrentRepProfile()`
  - `listVisibleRepProfiles()`
  - `listSavedCustomersForUser()`
  - `listManagedUsers()`
  - `getCustomerLocationId()`
  - `mapCustomerRowToSavedCustomer()`

Settings:

- `src/App.tsx`
  - initial bootstrap effect
  - `refreshAdminUsers()`
  - `applyAdminUsers()`
  - `SettingsPanel` props
- `src/components/SettingsPanel.tsx`
  - `CustomerListManager`
  - `UserAccessManager`
- `src/components/CustomerListManager.tsx`
  - `visibleCustomers`
  - `availableOwnerReps`
  - `visibleOwnerReps`
  - `locationScopedOwnerReps`
  - settings "Unassigned" display
- `src/components/UserAccessManager.tsx`

Feed/workload:

- `src/App.tsx`
  - queue item state
  - `buildWorkflowThreads()` calls
  - `filterWorkflowThreads()` calls
  - `getWorkloadVisibleReps()`
  - `calculateRepWorkloadSummaries()`
- `src/services/workflowSelectors.ts`
  - `buildWorkflowThreads()`
  - `filterWorkflowThreads()`
  - `matchesLocationScope()`
  - `getWorkloadVisibleReps()`
  - `groupWorkflowThreadsByAssignedRep()`
  - `calculateRepWorkloadSummaries()`
- `src/services/assignmentLogic.ts`
  - `resolveCanonicalAssignment()`
  - `findCustomerOwnershipMatch()`
  - `buildCustomerAssignmentResolution()`
- `src/services/customerMatching.ts`
  - `applyCustomerPriorityToEmails()`
  - `findCustomerMatch()`
- `src/services/customerSettings.ts`
  - `getCustomerPrimaryOwnerId()`
  - `getCustomerOwnerRepIds()`
  - `normalizeCustomerAssignments()`
- `src/services/locations.ts`
  - `normalizeLocationId()`
  - `canAccessLocation()`
  - `getLocationLabel()`

