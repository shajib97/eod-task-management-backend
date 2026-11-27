import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import mysql from "mysql2/promise";
import nodemailer from "nodemailer";

test("verified sessions, rate limits, workspace writes and report delivery", {
    skip: !process.env.TEST_DATABASE_URL && "Provide a disposable empty MySQL database",
    timeout: 30000,
}, async (t) => {
    const target = new URL(process.env.TEST_DATABASE_URL!);
    assert.match(target.pathname, /^\/eod_[a-z0-9_]*test[a-z0-9_]*$/i);
    const setup = await mysql.createConnection({ uri: target.href, multipleStatements: true });
    t.after(() => setup.end());
    const [existing] = await setup.query<mysql.RowDataPacket[]>("SHOW TABLES");
    assert.equal(existing.length, 0, "Use an empty test database.");
    for (const path of ["better-auth-schema.sql", "schema/001-workspace.sql", "schema/002-auth-rate-limit.sql"]) {
        await setup.query(await readFile(new URL("../" + path, import.meta.url), "utf8"));
    }
    await setup.query("INSERT INTO allowed_emails (email, role) VALUES ('officer@example.test', 'operator'), ('admin@example.test', 'admin')");
    const origin = "http://localhost:3000";
    const secret = "test-only-proxy-secret-with-at-least-32-bytes";
    Object.assign(process.env, {
        DB_HOST: target.hostname, DB_PORT: target.port || "3306",
        DB_USER: decodeURIComponent(target.username), DB_PASSWORD: decodeURIComponent(target.password),
        DB_NAME: target.pathname.slice(1), PORT: "0", HOST: "127.0.0.1",
        BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: "test-only-better-auth-secret-with-at-least-32-bytes",
        AUTH_PROXY_SECRET: secret, SMTP_USER: "sender@example.test", SMTP_PASSWORD: "fixture",
    });
    const delivered: { text: string; to: string[] }[] = [];
    t.mock.method(nodemailer, "createTransport", () => ({
        close() {},
        async sendMail(mail: { text: string; to: string[] }) {
            delivered.push(mail);
            return { accepted: mail.to, rejected: [], messageId: "test-message" };
        },
    }));
    const { db } = await import("../lib/db");
    t.after(() => db.end());
    const { server } = await import("../server");
    t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
    if (!server.listening) await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;

    function request(path: string, { body, cookie, ip = "192.0.2.10", proxy = true }: {
        body?: object; cookie?: string; ip?: string; proxy?: boolean;
    } = {}) {
        const headers = new Headers({ origin });
        if (proxy) {
            headers.set("x-eod-auth-proxy-secret", secret);
            headers.set("x-eod-client-ip", ip);
        }
        if (cookie) headers.set("cookie", cookie);
        if (body) headers.set("content-type", "application/json");
        return fetch(base + path, { headers, redirect: "manual", ...(body && { method: "POST", body: JSON.stringify(body) }) });
    }

    assert.equal((await request("/api/auth/ok", { proxy: false })).status, 403);
    const password = "dummy-password-for-testing";
    for (let attempt = 0; attempt < 3; attempt++) {
        assert.equal((await request("/api/auth/sign-in/email", {
            body: { email: "missing@example.test", password },
        })).status, 401);
    }
    assert.equal((await request("/api/auth/sign-in/email", {
        body: { email: "missing@example.test", password },
    })).status, 429);

    async function register(email: string, ip: string) {
        const body = { email, name: "Mutable display name", password };
        assert.equal((await request("/api/auth/sign-up/email", { body, ip })).status, 200);
        assert.equal((await request("/api/auth/sign-in/email", { body, ip })).status, 403);
        const verification = delivered.find(mail => mail.to.includes(email))?.text.match(/https?:\/\/[^\s]+/)?.[0];
        assert.ok(verification);
        const link = new URL(verification);
        let currentPassword = password;
        if (email === "officer@example.test") {
            assert.equal((await request("/api/auth/request-password-reset", {
                body: { email, redirectTo: "/reset-password" }, ip,
            })).status, 200);
            const resetMail = delivered.find(mail => mail.to.includes(email) && mail.text.includes("requested an EOD password reset"));
            const resetUrl = resetMail?.text.match(/https?:\/\/[^\s]+/)?.[0];
            assert.ok(resetUrl);
            const reset = new URL(resetUrl);
            const callback = await request(reset.pathname + reset.search, { ip });
            assert.equal(callback.status, 302);
            const token = new URL(callback.headers.get("location")!, origin).searchParams.get("token");
            assert.ok(token);
            currentPassword = "replacement-dummy-password";
            assert.equal((await request("/api/auth/reset-password", {
                body: { token, newPassword: currentPassword }, ip,
            })).status, 200);
        }
        assert.equal(link.origin, origin);
        assert.equal((await request(link.pathname + link.search, { ip })).status, 302);
        if (currentPassword !== password) {
            assert.equal((await request("/api/auth/sign-in/email", { body, ip })).status, 401);
        }
        const signedIn = await request("/api/auth/sign-in/email", { body: { ...body, password: currentPassword }, ip });
        assert.equal(signedIn.status, 200);
        const cookie = signedIn.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
        assert.ok(cookie.includes("session_token"));
        return cookie;
    }
    const officer = await register("officer@example.test", "192.0.2.11");
    const admin = await register("admin@example.test", "192.0.2.12");
    const api = (path: string, cookie: string, body?: object) => request("/api/workspace" + path, { cookie, body });
    assert.equal((await api("/settings/email", officer)).status, 403);
    assert.equal((await api("/settings/email", admin, { recipientEmails: "recipient@example.test", automaticReports: "on" })).status, 200);
    assert.equal((await api("/settings/email", admin, { recipientEmails: "reports@example.test" })).status, 200);
    assert.equal((await (await api("/settings/email", admin)).json()).enabled, true);
    assert.deepEqual(await (await api("/tasks", officer, { name: "  " })).json(), { status: "invalid" });

    const shift = await (await api("/shifts/current", officer)).json();
    assert.equal((await api("/tasks", officer, { name: "Audit task" })).status, 204);
    const [task] = await (await api(`/tasks?date=${shift.date}&shift=${shift.name}`, officer)).json();
    assert.equal((await api("/tasks/status", officer, { id: String(task.id), status: "Completed" })).status, 204);
    const [audit] = await (await api("/task-history", officer)).json();
    assert.equal(audit.changedByEmail, "officer@example.test");
    const [[zone]] = await db.query<mysql.RowDataPacket[]>("SELECT @@session.time_zone AS zone");
    assert.equal(zone.zone, "+00:00");

    await setup.query("SELECT GET_LOCK('eod_task_management.handovers', 0)");
    try {
        assert.deepEqual(await (await api("/shifts/sync", officer, {})).json(), { success: true });
    } finally {
        await setup.query("SELECT RELEASE_LOCK('eod_task_management.handovers')");
    }

    const report = { date: "2020-01-01", shift: "night" };
    await setup.query("SELECT GET_LOCK('eod_task_management.report_delivery', 0)");
    try {
        assert.equal((await (await api("/reports/send", officer, report)).json()).status, "busy");
    } finally {
        await setup.query("SELECT RELEASE_LOCK('eod_task_management.report_delivery')");
    }
    assert.equal((await (await api("/reports/send", officer, report)).json()).status, "sent");
    assert.equal((await (await api("/reports/send", officer, report)).json()).status, "already-sent");
    assert.match(delivered.at(-1)?.text ?? "", /Submitted by: officer@example\.test/);
});
