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


## MySQL setup and upgrade

For a fresh MySQL 8+ database, apply [better-auth-schema.sql](better-auth-schema.sql), [001-workspace.sql](schema/001-workspace.sql), and [002-auth-rate-limit.sql](schema/002-auth-rate-limit.sql), in that order. Add the first approved administrator to `allowed_emails` using your database provisioning account. The administrator then registers and verifies their work email through the app.

For an existing installation with the workspace tables, apply **only** `002-auth-rate-limit.sql` before starting the new backend. Apply it with a schema administrator or migration account. It adds a table for Better Auth's per-client rate limits, shared across backend instances. If the runtime account has table-level permissions, grant it SELECT, INSERT, UPDATE, and DELETE on `auth_rate_limit`. Existing tables and records stay in place. New connections set their SQL session time zone to UTC. Dhaka time is applied when formatting output.

## Auth and network configuration

- Use SMTP credentials on Express for verification links, password reset links, and report email. Users can request a reset to recover an account registered with their approved email. Keep manual database verification out of the account recovery process. For accounts verified manually before this release, confirm ownership and have the mailbox owner reset the password if there is any doubt.
- For a public frontend, set `NODE_ENV=production` on the backend and use a shared random `AUTH_PROXY_SECRET` of at least 32 bytes on both servers. Next.js forwards the address supplied by the trusted ingress. Express accepts the forwarded address only with the shared secret. Follow the frontend README to configure the ingress header.
- Keep Express reachable only from Next.js and authorized internal services. For containers, binding to `0.0.0.0` is for private networking. Avoid publishing the Express port to the internet. Use TLS when traffic crosses an untrusted network.
- For loopback development with a local `BETTER_AUTH_URL`, the two services can run without the proxy secret. Local browser auth attempts share one rate-limit bucket. Rate limits remain enabled in development.

## Scheduled jobs

Run these from the backend project with the same database configuration as the API. Carry over your existing scheduler's timing and arguments.

```powershell
npm run jobs:handovers
npm run jobs:reports
npm run jobs:reports -- --send
```

The handover job transfers pending work from ended shifts. The report job prepares the previous shift's report when Automatic reports is enabled in Settings. Manual sends and the delivery worker share a delivery lock. The `--send` flag also attempts queued deliveries. The web app still processes shifts when the workspace syncs and sends selected reports through the Reports page.

`npm run test:email` sends the existing dummy report to `REPORT_TEST_TO`.

## Tests

Run `npm run typecheck`. For the integration suite, create an empty disposable MySQL database whose name starts with `eod_` and contains `test`, then set `TEST_DATABASE_URL` to its connection URL and run `npm test`. The suite creates its fixtures and schema there, leaves them available for inspection, and uses a stub mail transport.
