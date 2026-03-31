# Action Desk

Action Desk is a frontend-only Inbox Queue MVP for support email triage. The app processes seeded customer emails into a queue and gives a support rep a concise summary, normalized intent and issues, a recommended next action, and a draft reply.

## Current MVP

- Progressive inbox queue rendering
- Search and filtering by urgency and intent
- Detail panel with customer email, analysis, recommended action, and reply draft
- Copy reply workflow
- Regenerate reply workflow for the selected email
- Mock order lookup for realistic shipping and support scenarios

## Active App Surface

- Main browser app entry: [src/main.tsx](src/main.tsx)
- Main app shell: [src/App.tsx](src/App.tsx)
- Inbox queue UI: [src/components/InboxQueue.tsx](src/components/InboxQueue.tsx)
- Detail panel UI: [src/components/EmailDetail.tsx](src/components/EmailDetail.tsx)
- Email processing boundary: [src/app/processEmails.ts](src/app/processEmails.ts)
- Single-email orchestration: [src/app/runActionDesk.ts](src/app/runActionDesk.ts)
- Demo inbox seed data: [src/data/mockEmails.ts](src/data/mockEmails.ts)

## Demo Scenarios Covered

- Where is my order
- Delivered but not received
- Proof of delivery request
- Cancellation request
- Short shipment
- Damaged shipment
- Billing question
- Address change
- Duplicate shipment concern

## Non-Core Files Still In Repo

These are intentionally left in place because they may still be useful for local add-in testing, but they are not required for the core Inbox Queue MVP demo:

- [outlook-addin/manifest.xml](outlook-addin/manifest.xml)
- [taskpane.html](taskpane.html)
- [src/taskpane.tsx](src/taskpane.tsx)
- [src/TaskPaneApp.tsx](src/TaskPaneApp.tsx)
- [src/office/getOutlookShellContext.ts](src/office/getOutlookShellContext.ts)
- [src/office/useOutlookShellContext.ts](src/office/useOutlookShellContext.ts)
- [src/office/office.d.ts](src/office/office.d.ts)
- [certs/localhost.pem](certs/localhost.pem)
- [certs/localhost-key.pem](certs/localhost-key.pem)

If the project is later narrowed to a browser-only Inbox Queue demo, those files are good archive candidates.

## Development

```bash
npm run build
npm run lint
```
