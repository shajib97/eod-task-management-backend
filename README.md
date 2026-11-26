# EOD Task Management API

Standalone Express service for the EOD workspace. It owns Better Auth, MySQL queries and transactions, shift processing, report generation, and SMTP delivery.

## API and access

Next.js reads and writes workspace data over HTTP. Browser sign-in and sign-out go through the frontend's same-origin auth proxy to Express. Scheduled jobs run directly in the backend project.

| Functionality | Routes | Required access |
| --- | --- | --- |
| Health check | `GET /health` | No session. Checks that Express responds. |
| Authentication | `/api/auth/*` | Better Auth applies its own session and registration rules. |
| Current shift and sync | `GET /api/workspace/shifts/current`, `POST /api/workspace/shifts/sync` | Operator or admin |
| Tasks, checklists, statuses, and notes | `GET /api/workspace/tasks`, `POST /api/workspace/tasks`, `POST /api/workspace/tasks/{checklist,status,notes}` | Operator or admin |
| History, activity, and handovers | `GET /api/workspace/{task-history,recent-activity,handovers}` | Operator or admin |
| Shift reports and delivery | `GET /api/workspace/reports`, `GET /api/workspace/reports/delivery`, `POST /api/workspace/reports/send` | Operator or admin |
| Approved users | `GET` and `POST /api/workspace/users`, `POST /api/workspace/users/access` | Admin |
| Task templates | `GET` and `POST /api/workspace/templates`, `POST /api/workspace/templates/{status,name}` | Admin |
| Report recipients | `GET` and `POST /api/workspace/settings/email` | Admin |

Braces list alternative path segments. The workspace routes are registered in [workspace.ts](workspace.ts).

## Security and data handling

- [Permissions](lib/permissions.ts) resolve the Better Auth session from the cookie with the session cookie cache disabled. They require a verified email and check the active approval record in MySQL on every workspace request. Mutations that record an operator use the identity from that session.
- Express requires JSON for workspace writes and limits parsed JSON bodies to 64 KB. Routes and services validate values such as shift dates, statuses, task IDs, and note lengths. Queries use bound parameters for user-supplied values.
- Transactions and row locks protect task status and history updates, concurrent note edits, and approval changes. Handover and report processing use database locks. Recorded report delivery state helps prevent duplicate sends.
- Workspace responses use `Cache-Control: no-store`. Unexpected failures are logged on the backend and return a generic error. API responses intentionally include authorized workspace data, such as task notes and report snapshots, so review response fields when adding endpoints.
- Keep database and SMTP credentials and `BETTER_AUTH_SECRET` in the Express environment. Give the Next.js service network access to Express and keep Express on a private interface where possible. Use HTTPS for the browser-facing frontend in production.

## Run

Use Node.js 22.9 or newer. Copy `.env.example` to `.env.local` and configure it for the existing MySQL schema. Use the existing Better Auth secret and set `BETTER_AUTH_URL` to the public frontend origin. For a deployment, variables can be supplied directly in the process environment.

```powershell
npm ci
npm run dev
```

Use `npm start` to run the service without watch mode and `npm run typecheck` to check its TypeScript.


`better-auth-schema.sql` is the existing Better Auth schema reference. The application also uses its existing task, history, handover, approval, settings, and delivery tables.

## Scheduled jobs

Run these from the backend project with the same database configuration as the API. Carry over your existing scheduler's timing and arguments.

```powershell
npm run jobs:handovers
npm run jobs:reports
npm run jobs:reports -- --send
```

The handover job transfers pending work from ended shifts. The report job prepares the previous shift's report, subject to the stored settings. The `--send` flag also attempts queued deliveries. The web app still processes shifts when the workspace syncs and sends selected reports through the Reports page.

`npm run test:email` sends the existing dummy report to `REPORT_TEST_TO`.
