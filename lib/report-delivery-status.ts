import type { RowDataPacket } from "mysql2/promise";
import { db } from "./db";
import type { ShiftKey } from "./current-shift";

interface ReportDeliveryRow extends RowDataPacket {
    deliveryStatus:
    | "Pending"
    | "Sending"
    | "Sent"
    | "Failed"
    | "Uncertain";
    requestedByEmail: string | null;
    requestedAtDhaka: string | null;
    sentAtDhaka: string | null;
    recipientEmails: string;
    reportSubject: string;
    reportBody: string;
}

export async function getReportDeliveryStatus(shift: ShiftKey) {

    const [rows] = await db.execute<ReportDeliveryRow[]>(
        `SELECT
            delivery_status AS deliveryStatus,
            u.email AS requestedByEmail,
            recipient_emails AS recipientEmails,
            report_subject AS reportSubject,
            report_body AS reportBody,
            DATE_FORMAT(
                DATE_ADD(requested_at, INTERVAL 6 HOUR),
                '%d-%m-%Y %h:%i:%s %p'
            ) AS requestedAtDhaka,
            DATE_FORMAT(
                DATE_ADD(sent_at, INTERVAL 6 HOUR),
                '%d-%m-%Y %h:%i:%s %p'
            ) AS sentAtDhaka
         FROM shift_report_deliveries d
         LEFT JOIN \`user\` u ON u.id = d.requested_by_user_id
         WHERE shift_date = ?
           AND shift_name = ?
         LIMIT 1`,
        [shift.date, shift.name],
    );

    return rows[0] ?? null;
}