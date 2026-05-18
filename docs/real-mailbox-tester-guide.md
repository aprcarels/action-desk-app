# Action Desk Real Mailbox Tester Guide

## What Action Desk Does

Action Desk helps support reps triage email faster. For each mailbox email, it tries to generate:

- a short summary
- a recommended next action
- a draft reply
- a prioritized queue view so urgent problems are easier to spot

This is an early internal pilot. The goal is to evaluate usefulness, not perfect automation.

## How To Start Real Mailbox Mode

1. Open a terminal in the Action Desk project.
2. Set these environment variables:

```powershell
$env:VITE_INBOX_SOURCE="api"
$env:VITE_AZURE_CLIENT_ID="your-app-client-id"
$env:VITE_AZURE_TENANT_ID="your-tenant-id"
```

If your setup uses a full authority instead of tenant ID, use `VITE_AZURE_AUTHORITY` instead.

3. Start the app:

```powershell
npm run dev
```

4. Open the local Action Desk URL shown in the terminal.

In real mailbox mode, the queue should load real Outlook mailbox emails only. Seeded demo emails should not appear.

## How Microsoft Sign-In Works

- The app will prompt you to sign in with Microsoft if needed.
- It requests mailbox read/write access with `Mail.ReadWrite`.
- Action Desk uses that access to read inbox emails for triage and create saved Outlook reply drafts when you choose that action.
- It does not request `Mail.Send`, and it does not send email.
- If you are already signed in, it may load without showing the popup again.

If sign-in or Azure app configuration is not working, the inbox should show a clear error message instead of loading the queue.

## What To Try

- Scan the queue and see if the highest-priority emails feel like the right ones.
- Click several emails and review the detail panel.
- Turn on `Problems First` and see whether the filtered queue is useful.
- Review the `Top Issues` panel and see whether the grouped problems match what you would expect.
- Read the summary, recommended action, and reply draft for a mix of real emails.

## What Feedback We Want

- Priority accuracy: Did the right emails rise to the top?
- Issue grouping usefulness: Were the `Top Issues` and issue filters helpful?
- Summary usefulness: Did the summary help you understand the email quickly?
- Recommended action usefulness: Did the next step feel practical for support work?
- Draft usefulness: Did the draft save time, or did it miss key context or tone?

Concrete examples are most helpful. If something feels wrong, please share the email scenario and what you expected instead.

## Known Limitations

- Draft-only Outlook integration: Action Desk can create a saved reply draft for live Outlook Graph messages, but it does not send email.
- Manual fallback remains available: use `Copy & Open Outlook` if draft creation is unavailable.
- Early pilot quality: classification, prioritization, and draft quality will still be uneven on some real emails.
