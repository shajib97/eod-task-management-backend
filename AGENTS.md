# EOD Task Management Backend

- This Express project owns Better Auth, workspace access checks, MySQL queries and transactions, shift processing, and email delivery. The sibling Next.js frontend is at `C:\projects\eod-task-management`.
- Register workspace routes in `workspace.ts` using the existing `read` and `write` wrappers. Require admin access for user approvals, templates, and report email settings. Derive actor identity from the verified session and check current approval on each request.
- Validate request input in the API and services. Bind SQL parameters, preserve locks and transactions for concurrent changes, and return only the fields needed by authorized callers. Keep credentials in backend environment variables and preserve generic responses for unexpected failures.
- Coordinate route and response changes with the frontend HTTP client and affected forms. Preserve Dhaka shift boundaries, task history attribution, and report delivery safeguards.
- Run `npm run typecheck` and verify affected frontend-to-API flows. Use an isolated database and stub mail transport for tests that write records or deliver reports.
