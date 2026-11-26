import type { RowDataPacket } from "mysql2";
import { db } from "./db";

interface AllowedEmail extends RowDataPacket {
    role: "admin" | "operator";
}

export async function findAllowedEmail(email: string) {
    const [rows] = await db.execute<AllowedEmail[]>(
        `SELECT role
     FROM allowed_emails
     WHERE email = ? AND is_active = 1`,
        [email.trim().toLowerCase()],
    );

    return rows[0] ?? null;
}