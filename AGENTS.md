# Action Desk

## Product Purpose
Action Desk helps support reps triage customer emails faster by generating a useful summary, a recommended next action, and a draft reply. The product should feel practical and operational, not like a generic AI demo.

## Current MVP Scope
- Inbox Queue MVP
- Mock email dataset for realistic support scenarios
- `processEmails` pipeline that converts raw inbox emails into UI-ready processed items
- `runActionDesk` orchestration for single-email analysis, order lookup, and reply generation
- `InboxQueue` list view for triage
- `EmailDetail` work surface for review and action

## Technical Guardrails
- Keep `runActionDesk` as the single-email source of truth
- Keep `processEmails` as the boundary between raw email input and UI-ready processed data
- Prefer adding small helpers over duplicating transformation logic in components
- Keep the app frontend-only for now
- Preserve the existing React + TypeScript + Vite structure unless there is a strong reason to change it
- Avoid introducing backend services, auth, databases, or network dependencies for MVP work

## Engineering Practices (New)

### TDD (Red-Green-Refactor)
- Write one test before implementing new logic
- Ensure it fails (Red)
- Implement minimal code to pass (Green)
- Refactor safely while tests pass

### Service Contract Thinking
- Treat `processEmails` and `runActionDesk` as strict boundaries
- Keep data transformation in pipeline layer, not UI
- Prefer explicit types over loose objects
- Avoid throwing errors — return structured results when expanding logic

## UI/UX Principles
- Optimize for fast triage and scannability
- Make the queue easy to scan by urgency, intent, and issue count
- Make the detail panel feel like a support rep work surface
- Keep interactions obvious and lightweight
- Prefer clarity over polish-heavy UI
- Use simple inline styles unless there is an established reason to do otherwise

## Coding Standards
- Inspect existing files before changing architecture
- Make minimal, targeted changes
- Reuse existing types and helpers where possible
- Prefer readable code over abstraction-heavy patterns
- Keep components presentation-focused when practical
- Keep data shaping in the pipeline layer rather than scattered across UI components
- Maintain TypeScript correctness and avoid `any`

## What Not To Build Yet
- No backend or persistence layer
- No authentication or user management
- No database integration
- No real inbox provider integration as part of the core MVP
- No workflow engine, assignment system, or enterprise-heavy abstractions
- No overbuilt state management unless the current local state becomes clearly insufficient

## Preferred Workflow
1. Inspect the current implementation first
2. Make the smallest change that cleanly solves the task
3. Preserve working core logic unless a fix is necessary
4. Run validation after edits, preferably `npm run build`
5. In the handoff, explain:
   - what changed
   - which files changed
   - any assumptions made
   - any remaining risks or follow-up ideas
