import type { RowDataPacket } from "mysql2/promise";
import { db } from "./db";

interface AllowedEmail extends RowDataPacket {
    email: string;
    role: "admin" | "operator";
    is_active: number;
}

export async function getApprovedAccess(email: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const [rows] = await db.execute<AllowedEmail[]>(
        `SELECT email, role, is_active
         FROM allowed_emails
         WHERE email = ?
           AND is_active = 1
         LIMIT 1`,
        [normalizedEmail]
    );

    return rows[0] ?? null;
}