import type { OperatorAccess } from "../lib/permissions";
import { RequestError } from "../lib/request-error";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "../lib/db";

interface ApprovedUser extends RowDataPacket {
    email: string;
    role: "admin" | "operator";
    is_active: number;
}

function readEmail(formData: { get(key: string): unknown }) {
    const value = formData.get("email");

    if (typeof value !== "string") {
        throw new RequestError(400, "Enter a valid work email.");
    }

    const email = value.trim().toLowerCase();

    if (
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
        throw new RequestError(400, "Enter a valid work email.");
    }

    return email;
}

export async function addApprovedUser(formData: { get(key: string): unknown }) {
    const email = readEmail(formData);
    const role = formData.get("role");

    if (role !== "admin" && role !== "operator") {
        throw new RequestError(400, "Select a valid role.");
    }

    try {
        await db.execute(
            `INSERT INTO allowed_emails (email, role, is_active)
             VALUES (?, ?, 1)`,
            [email, role]
        );
    } catch (error) {
        if (
            error instanceof Error &&
            "code" in error &&
            error.code === "ER_DUP_ENTRY"
        ) {
            throw new RequestError(
                400,
                "This email is already listed. Update its existing entry instead."
            );
        }

        throw error;
    }
}

export async function manageApprovedUser(formData: { get(key: string): unknown }, access: OperatorAccess) {
    const email = readEmail(formData);
    const operation = formData.get("operation");

    if (
        operation !== "activate" &&
        operation !== "deactivate" &&
        operation !== "remove"
    ) {
        throw new RequestError(400, "Invalid operation.");
    }

    if (
        operation === "remove" &&
        formData.get("confirmRemoval") !== "yes"
    ) {
        throw new RequestError(400, "Confirm that you want to remove approval.");
    }

    const actorEmail = access.user.email.trim().toLowerCase();
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // Lock the approval rows so concurrent changes cannot
        // remove all active admins.
        const [users] = await connection.execute<ApprovedUser[]>(
            `SELECT email, role, is_active
             FROM allowed_emails
             ORDER BY email
             FOR UPDATE`
        );

        // Recheck the acting admin after acquiring the locks.
        const actor = users.find(
            (user) => user.email.toLowerCase() === actorEmail
        );

        if (
            !actor ||
            actor.role !== "admin" ||
            !actor.is_active
        ) {
            throw new RequestError(400, "Administrator access is required.");
        }

        const target = users.find(
            (user) => user.email.toLowerCase() === email
        );

        if (!target) {
            throw new RequestError(400, "This approved email no longer exists.");
        }

        if (target.email.toLowerCase() === actorEmail) {
            throw new RequestError(
                400,
                "You cannot change or remove your own access."
            );
        }

        const activeAdmins = users.filter(
            (user) => user.role === "admin" && Boolean(user.is_active)
        ).length;

        if (
            operation !== "activate" &&
            target.role === "admin" &&
            Boolean(target.is_active) &&
            activeAdmins <= 1
        ) {
            throw new RequestError(
                400,
                "At least one active administrator must remain."
            );
        }

        if (operation === "remove") {
            await connection.execute(
                `DELETE FROM allowed_emails WHERE email = ?`,
                [target.email]
            );
        } else {
            await connection.execute(
                `UPDATE allowed_emails
                 SET is_active = ?
                 WHERE email = ?`,
                [
                    operation === "activate" ? 1 : 0,
                    target.email,
                ]
            );
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}