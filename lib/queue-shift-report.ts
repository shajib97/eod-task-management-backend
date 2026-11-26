import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db } from "./db";
import type { ShiftKey } from "./current-shift";
import type { ShiftReportTask } from "./shift-report-data";

interface EmailSettingsRow extends RowDataPacket {
    enabled: number;
    recipientEmails: string;
}

export async function queueShiftReport(
    shift: ShiftKey,
    tasks: ShiftReportTask[],
) {
    const [settings] = await db.execute<EmailSettingsRow[]>(
        `SELECT
            enabled,
            recipient_emails AS recipientEmails
         FROM email_report_settings
         WHERE id = 1`,
    );

    const config = settings[0];

    if (!config || !config.enabled) {
        return { queued: false };
    }

    const recipients = config.recipientEmails
        .split(",")
        .map((email) => email.trim())
        .filter((email) => email.length > 0);

    if (recipients.length === 0) {
        throw new Error("Email reports are enabled without recipients.");
    }

    const completed = tasks.filter(
        (task) => task.reportStatus === "Completed",
    ).length;

    const pending = tasks.filter(
        (task) => task.reportStatus === "Pending",
    ).length;

    const handedOver = tasks.filter(
        (task) => task.reportStatus === "Handed over",
    ).length;

    const shiftLabel =
        shift.name.charAt(0).toUpperCase() + shift.name.slice(1);

    const subject =
        `EOD shift report — ${shift.date} — ${shiftLabel}`;

    const lines = [
        "EOD Task Management — Shift Report",
        "",
        `Shift date: ${shift.date}`,
        `Shift: ${shiftLabel}`,
        "Time zone: Asia/Dhaka",
        "",
        `Total tasks: ${tasks.length}`,
        `Completed: ${completed}`,
        `Pending: ${pending}`,
        `Handed over: ${handedOver}`,
        "",
        "Task details",
        "------------",
    ];

    if (tasks.length === 0) {
        lines.push("No tasks recorded for this shift.");
    }

    for (const task of tasks) {
        lines.push(
            "",
            `${task.name} — ${task.reportStatus}`,
        );

        if (task.completedAtDhaka) {
            lines.push(
                `Completed at: ${task.completedAtDhaka} (Dhaka time)`,
            );
        }

        if (task.nextShiftDate && task.nextShiftName) {
            lines.push(
                `Handed to: ${task.nextShiftDate} ${task.nextShiftName}`,
            );
        }

        if (task.notes) {
            lines.push(`Remarks: ${task.notes}`);
        }
    }

    const [result] = await db.execute<ResultSetHeader>(
        `INSERT INTO shift_report_deliveries (
            shift_date,
            shift_name,
            recipient_emails,
            report_subject,
            report_body
         )
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            id = shift_report_deliveries.id`,
        [
            shift.date,
            shift.name,
            recipients.join(", "),
            subject,
            lines.join("\n"),
        ],
    );

    return {
        queued: result.affectedRows === 1,
    };
}