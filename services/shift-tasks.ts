import type { OperatorAccess } from "../lib/permissions";
import { RequestError } from "../lib/request-error";
import type { RowDataPacket } from "mysql2/promise";
import { getCurrentShiftKey } from "../lib/current-shift";
import { db } from "../lib/db";

export async function addTask(formData: { get(key: string): unknown }) {
    const value = formData.get("name");
    if (typeof value !== "string") return;

    const name = value.trim();
    if (!name || name.length > 120) return;

    const shift = getCurrentShiftKey();

    await db.execute(
        "INSERT INTO shift_tasks (name, shift_date, shift_name) VALUES (?, ?, ?)",
        [name, shift.date, shift.name],
    );
}

export async function updateTaskStatus(formData: { get(key: string): unknown }, access: OperatorAccess) {
    const rawId = formData.get("id");
    const status = formData.get("status");

    if (
        typeof rawId !== "string" ||
        !/^[1-9]\d*$/.test(rawId)
    ) {
        throw new RequestError(400, "Invalid task ID.");
    }

    const id = Number(rawId);

    if (!Number.isSafeInteger(id)) {
        throw new RequestError(400, "Invalid task ID.");
    }

    if (status !== "Pending" && status !== "Completed") {
        throw new RequestError(400, "Invalid task status.");
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const shift = getCurrentShiftKey();

        const [tasks] = await connection.execute<
            (RowDataPacket & {
                status: "Pending" | "Completed";
            })[]
        >(
            `SELECT status
             FROM shift_tasks
             WHERE id = ?
               AND shift_date = ?
               AND shift_name = ?
             FOR UPDATE`,
            [id, shift.date, shift.name]
        );

        const task = tasks[0];

        if (!task) {
            throw new RequestError(
                400,
                "This task is no longer in the current shift. Refresh the page."
            );
        }

        if (task.status !== status) {
            await connection.execute(
                `UPDATE shift_tasks
                 SET status = ?,
                     completed_at = CASE
                         WHEN ? = 'Completed' THEN UTC_TIMESTAMP()
                         ELSE NULL
                     END
                 WHERE id = ?`,
                [status, status, id]
            );

            await connection.execute(
                `INSERT INTO task_status_history (
                    task_id,
                    previous_status,
                    new_status,
                    shift_date,
                    shift_name,
                    changed_by_user_id,
                    changed_by_name
                 )
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    id,
                    task.status,
                    status,
                    shift.date,
                    shift.name,
                    access.user.id,
                    Array.from(access.user.name).slice(0, 120).join(""),
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

export async function generateShiftChecklist() {
    const shift = getCurrentShiftKey();

    await db.execute(
        `INSERT INTO shift_tasks (
       name,
       template_id,
       shift_date,
       shift_name,
       origin_shift_date,
       origin_shift_name
     )
     SELECT
       t.name,
       t.id,
       ?,
       ?,
       ?,
       ?
     FROM task_templates AS t
     WHERE t.shift_name = ? AND t.is_active = 1
     ON DUPLICATE KEY UPDATE id = shift_tasks.id`,
        [
            shift.date,
            shift.name,
            shift.date,
            shift.name,
            shift.name,
        ],
    );
}

export async function updateTaskNotes(formData: { get(key: string): unknown }) {
    const rawId = formData.get("id");
    const rawNotes = formData.get("notes");
    const originalNotes = formData.get("originalNotes");

    if (
        typeof rawId !== "string" ||
        !/^[1-9]\d*$/.test(rawId) ||
        !Number.isSafeInteger(Number(rawId))
    ) {
        return {
            success: false,
            message: "Invalid task ID.",
        };
    }

    if (
        typeof rawNotes !== "string" ||
        typeof originalNotes !== "string" ||
        rawNotes.length > 2000 ||
        originalNotes.length > 2000
    ) {
        return {
            success: false,
            message: "Notes must contain at most 2,000 characters.",
        };
    }

    const id = Number(rawId);
    const notes = rawNotes.trim();
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const shift = getCurrentShiftKey();

        const [tasks] = await connection.execute<
            (RowDataPacket & { notes: string | null })[]
        >(
            `SELECT notes
             FROM shift_tasks
             WHERE id = ?
               AND shift_date = ?
               AND shift_name = ?
             FOR UPDATE`,
            [id, shift.date, shift.name]
        );

        const task = tasks[0];

        if (!task) {
            await connection.rollback();

            return {
                success: false,
                message:
                    "This task is no longer in the current shift. Copy your draft and refresh the page.",
            };
        }

        if ((task.notes ?? "") !== originalNotes) {
            await connection.rollback();

            return {
                success: false,
                message:
                    "Another officer changed this note. Copy your draft, cancel editing, and review the latest note.",
            };
        }

        await connection.execute(
            `UPDATE shift_tasks
             SET notes = ?
             WHERE id = ?`,
            [notes || null, id]
        );

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }


    return {
        success: true,
        message: "Note saved.",
    };
}