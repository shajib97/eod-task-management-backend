import type { OperatorAccess } from "../lib/permissions";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "../lib/db";
import {
    getCurrentShiftKey,
    type ShiftKey,
} from "../lib/current-shift";
import { getShiftReportData } from "../lib/shift-report-data";
import { sendReportEmail } from "../lib/report-mailer";

interface LockRow extends RowDataPacket {
    acquired: number | null;
}

interface SettingsRow extends RowDataPacket {
    recipientEmails: string;
}

interface ExistingReport extends RowDataPacket {
    id: number;
    delivery_status: string;
}

export async function sendSelectedShiftReport(formData: { get(key: string): unknown }, access: OperatorAccess) {
    const date = formData.get("date");
    const name = formData.get("shift");

    if (
        typeof date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        (name !== "morning" &&
            name !== "evening" &&
            name !== "night")
    ) {
        return { status: "invalid" } as const;
    }

    const parsedDate = new Date(`${date}T00:00:00Z`);

    if (
        Number(date.slice(0, 4)) < 1000 ||
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== date
    ) {
        return { status: "invalid" } as const;
    }

    const shift: ShiftKey = { date, name };
    const current = getCurrentShiftKey();
    const order = { morning: 0, evening: 1, night: 2 };

    const hasEnded =
        date < current.date ||
        (date === current.date &&
            order[name] < order[current.name]);

    if (!hasEnded) {
        return { shift, status: "not-ended" };
    }

    const connection = await db.getConnection();
    const lockName = `eod.report.${date}.${name}`;
    let locked = false;
    let outcome = "failed";

    try {
        const [locks] = await connection.execute<LockRow[]>(
            "SELECT GET_LOCK(?, 0) AS acquired",
            [lockName],
        );

        locked = locks[0]?.acquired === 1;

        if (!locked) {
            outcome = "busy";
        } else {
            const [existing] =
                await connection.execute<ExistingReport[]>(
                    `SELECT id, delivery_status
                     FROM shift_report_deliveries
                     WHERE shift_date = ? AND shift_name = ?`,
                    [date, name],
                );

            if (existing.length > 0) {
                outcome =
                    existing[0].delivery_status === "Sent"
                        ? "already-sent"
                        : "review";
            } else {
                const [settings] =
                    await connection.execute<SettingsRow[]>(
                        `SELECT recipient_emails AS recipientEmails
                         FROM email_report_settings
                         WHERE id = 1`,
                    );

                const recipients = [
                    ...new Set(
                        (settings[0]?.recipientEmails ?? "")
                            .split(",")
                            .map((email) => email.trim())
                            .filter((email) => email.length > 0),
                    ),
                ];

                const invalidRecipients =
                    recipients.length === 0 ||
                    recipients.length > 10 ||
                    recipients.some(
                        (email) =>
                            email.length > 254 ||
                            !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(
                                email,
                            ),
                    );

                if (invalidRecipients) {
                    outcome = "recipients";
                } else if (
                    !process.env.SMTP_USER ||
                    !process.env.SMTP_PASSWORD
                ) {
                    outcome = "smtp";
                } else {
                    const tasks = await getShiftReportData(shift);

                    const completed = tasks.filter(
                        (task) => task.reportStatus === "Completed",
                    ).length;

                    const pending = tasks.filter(
                        (task) => task.reportStatus === "Pending",
                    ).length;

                    const handedOver = tasks.filter(
                        (task) => task.reportStatus === "Handed over",
                    ).length;

                    const subject =
                        `EOD shift report — ${date} — ${name}`;

                    const lines = [
                        "EOD Task Management — Shift Report",
                        "",
                        `Shift start date: ${date}`,
                        `Shift: ${name}`,
                        "Time zone: Asia/Dhaka",
                        `Submitted by: ${access.user.name}`,
                        "",
                        `Total tasks: ${tasks.length}`,
                        `Completed: ${completed}`,
                        `Pending: ${pending}`,
                        `Handed over: ${handedOver}`,
                        "",
                        "Task details and notes reflect the time of submission.",
                        "",
                    ];

                    if (tasks.length === 0) {
                        lines.push("No tasks recorded for this shift.");
                    }

                    for (const task of tasks) {
                        lines.push(
                            `${task.name} — ${task.reportStatus}`,
                        );

                        if (task.completedAtDhaka) {
                            lines.push(
                                `Completed: ${task.completedAtDhaka} (Dhaka)`,
                            );
                        }

                        if (task.nextShiftName) {
                            lines.push(
                                `Handed to: ${task.nextShiftDate} ${task.nextShiftName}`,
                            );
                        }

                        if (task.notes) {
                            lines.push(`Remarks: ${task.notes}`);
                        }

                        lines.push("");
                    }

                    const body = lines.join("\n");

                    await connection.execute(
                        `INSERT INTO shift_report_deliveries (
                            shift_date,
                            shift_name,
                            recipient_emails,
                            report_subject,
                            report_body,
                            delivery_status,
                            attempts,
                            last_attempt_at,
                            requested_by_user_id,
                            requested_by_name,
                            requested_at
                         )
                         VALUES (
                            ?, ?, ?, ?, ?, 'Sending',
                            1, UTC_TIMESTAMP(), ?, ?, UTC_TIMESTAMP()
                         )`,
                        [
                            date,
                            name,
                            recipients.join(", "),
                            subject,
                            body,
                            access.user.id,
                            access.user.name,
                        ],
                    );

                    try {
                        const result = await sendReportEmail({
                            recipients,
                            subject,
                            body,
                        });

                        const accepted =
                            result.accepted.length === recipients.length &&
                            result.rejected.length === 0;

                        await connection.execute(
                            `UPDATE shift_report_deliveries
                             SET delivery_status = ?,
                                 sent_at = ?,
                                 message_id = ?,
                                 last_error = ?
                             WHERE shift_date = ?
                               AND shift_name = ?`,
                            [
                                accepted ? "Sent" : "Uncertain",
                                accepted ? new Date() : null,
                                result.messageId,
                                accepted
                                    ? null
                                    : "Not all recipients were accepted; review before retrying.",
                                date,
                                name,
                            ],
                        );

                        outcome = accepted ? "sent" : "review";
                    } catch {
                        await connection.execute(
                            `UPDATE shift_report_deliveries
                             SET delivery_status = 'Uncertain',
                                 last_error = 'Delivery could not be confirmed; review before retrying.'
                             WHERE shift_date = ?
                               AND shift_name = ?`,
                            [date, name],
                        );

                        outcome = "review";
                    }
                }
            }
        }
    } catch {
        console.error("Manual shift report submission failed.");
        outcome = "failed";
    } finally {
        try {
            if (locked) {
                await connection.execute(
                    "SELECT RELEASE_LOCK(?)",
                    [lockName],
                );
            }
        } finally {
            connection.release();
        }
    }

    return { shift, status: outcome };
}