import type { RowDataPacket } from "mysql2/promise";
import { db } from "./db";

interface EmailReportSettingsRow extends RowDataPacket {
    enabled: number;
    recipientEmails: string;
}

export async function getEmailReportSettings() {

    const [rows] = await db.execute<EmailReportSettingsRow[]>(
        `SELECT
            enabled,
            recipient_emails AS recipientEmails
         FROM email_report_settings
         WHERE id = 1`,
    );

    if (rows.length === 0) {
        throw new Error("Email report settings have not been initialized.");
    }

    return {
        enabled: Boolean(rows[0].enabled),
        recipientEmails: rows[0].recipientEmails,
    };
}