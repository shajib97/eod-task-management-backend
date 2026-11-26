import type { RowDataPacket } from "mysql2/promise";
import { db } from "./db";
import { sendReportEmail } from "./report-mailer";

interface LockRow extends RowDataPacket {
    acquired: number | null;
}

interface SettingsRow extends RowDataPacket {
    enabled: number;
}

interface DeliveryRow extends RowDataPacket {
    id: number;
    recipient_emails: string;
    report_subject: string;
    report_body: string;
}

export async function deliverShiftReports() {
    const connection = await db.getConnection();
    let locked = false;

    try {
        const [locks] = await connection.execute<LockRow[]>(
            "SELECT GET_LOCK('eod_task_management.report_delivery', 0) AS acquired",
        );

        locked = locks[0]?.acquired === 1;

        if (!locked) {
            console.log("Another report delivery job is running.");
            return;
        }

        // A previous worker may have stopped during an SMTP send.
        // Do not automatically resend those reports.
        await connection.execute(
            `UPDATE shift_report_deliveries
             SET delivery_status = 'Uncertain',
                 last_error = 'Previous delivery worker stopped before recording its result.'
             WHERE delivery_status = 'Sending'`,
        );

        for (let step = 0; step < 10; step++) {
            const [settings] = await connection.execute<SettingsRow[]>(
                `SELECT enabled
                 FROM email_report_settings
                 WHERE id = 1`,
            );

            if (!settings[0]?.enabled) {
                console.log("Automatic email reports are disabled.");
                return;
            }

            const [reports] = await connection.execute<DeliveryRow[]>(
                `SELECT
                    id,
                    recipient_emails,
                    report_subject,
                    report_body
                 FROM shift_report_deliveries
                 WHERE delivery_status = 'Pending'
                 ORDER BY id
                 LIMIT 1`,
            );

            const report = reports[0];

            if (!report) {
                console.log("No pending report emails.");
                return;
            }

            // Check credentials before marking a delivery as started.
            if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
                throw new Error("Missing SMTP credentials.");
            }

            await connection.execute(
                `UPDATE shift_report_deliveries
                 SET delivery_status = 'Sending',
                     attempts = attempts + 1,
                     last_attempt_at = UTC_TIMESTAMP(),
                     last_error = NULL
                 WHERE id = ?`,
                [report.id],
            );

            let result;

            try {
                result = await sendReportEmail({
                    recipients: report.recipient_emails
                        .split(",")
                        .map((email) => email.trim())
                        .filter((email) => email.length > 0),
                    subject: report.report_subject,
                    body: report.report_body,
                });
            } catch {
                // A connection error can happen after SMTP acceptance.
                await connection.execute(
                    `UPDATE shift_report_deliveries
                     SET delivery_status = 'Uncertain',
                         last_error = 'SMTP attempt failed; check delivery before retrying.'
                     WHERE id = ?`,
                    [report.id],
                );

                console.error(
                    `Report ${report.id}: delivery uncertain; review required.`,
                );

                continue;
            }

            const fullyAccepted =
                result.accepted.length > 0 &&
                result.rejected.length === 0;

            await connection.execute(
                `UPDATE shift_report_deliveries
                 SET delivery_status = ?,
                     sent_at = ?,
                     message_id = ?,
                     last_error = ?
                 WHERE id = ?`,
                [
                    fullyAccepted ? "Sent" : "Uncertain",
                    fullyAccepted ? new Date() : null,
                    result.messageId,
                    fullyAccepted
                        ? null
                        : "Not all recipients were accepted. Review before retrying.",
                    report.id,
                ],
            );

            console.log(
                `Report ${report.id}: ${fullyAccepted ? "SMTP accepted" : "review required"
                }.`,
            );
        }
    } finally {
        try {
            if (locked) {
                await connection.execute(
                    "SELECT RELEASE_LOCK('eod_task_management.report_delivery')",
                );
            }
        } finally {
            connection.release();
        }
    }
}