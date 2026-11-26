import type { RowDataPacket } from "mysql2/promise";
import { db } from "../lib/db";

interface ApprovedUser extends RowDataPacket {
    email: string;
    role: "admin" | "operator";
    is_active: number;
}

export async function getApprovedUsers() {
    const [users] = await db.execute<ApprovedUser[]>(
        `SELECT email, role, is_active
         FROM allowed_emails
         ORDER BY FIELD(role, 'admin', 'operator'), email`,
    );
    return users;
}

interface Handover extends RowDataPacket {
    id: number;
    task_id: number;
    task_name: string;
    from_date: string;
    from_shift_name: string;
    to_date: string;
    to_shift_name: string;
}

export async function getHandovers() {
    const [handovers] = await db.execute<Handover[]>(
        `SELECT
            h.id,
            h.task_id,
            t.name AS task_name,
            DATE_FORMAT(
                h.from_shift_date,
                '%Y-%m-%d'
            ) AS from_date,
            h.from_shift_name,
            DATE_FORMAT(
                h.to_shift_date,
                '%Y-%m-%d'
            ) AS to_date,
            h.to_shift_name
         FROM task_handovers AS h
         JOIN shift_tasks AS t ON t.id = h.task_id
         ORDER BY h.id DESC
         LIMIT 100`,
    );
    return handovers;
}

interface TaskHistoryEntry extends RowDataPacket {
    id: number;
    taskId: number;
    taskName: string;
    previousStatus: string;
    newStatus: string;
    shiftDate: string;
    shiftName: string;
    changedAtDhaka: string | null;
    changedByName: string | null;
}

export async function getTaskHistory() {
    const [entries] = await db.execute<TaskHistoryEntry[]>(
        `SELECT
            h.id,
            h.task_id AS taskId,
            t.name AS taskName,
            h.previous_status AS previousStatus,
            h.new_status AS newStatus,
            h.changed_by_name AS changedByName,
            DATE_FORMAT(
                h.shift_date,
                '%Y-%m-%d'
            ) AS shiftDate,
            h.shift_name AS shiftName,
            DATE_FORMAT(
                CONVERT_TZ(
                    h.changed_at,
                    @@session.time_zone,
                    '+06:00'
                ),
                '%d-%m-%Y %h:%i:%s %p'
            ) AS changedAtDhaka
         FROM task_status_history h
         JOIN shift_tasks t ON t.id = h.task_id
         ORDER BY h.id DESC
         LIMIT 100`,
    );
    return entries;
}

interface ActivityEntry extends RowDataPacket {
    id: number;
    taskId: number;
    taskName: string;
    newStatus: string;
    changedByName: string | null;
    changedAtDhaka: string | null;
}

export async function getRecentTaskActivity() {
    const [entries] = await db.execute<ActivityEntry[]>(
        `SELECT
            h.id,
            h.task_id AS taskId,
            t.name AS taskName,
            h.new_status AS newStatus,
            h.changed_by_name AS changedByName,
            DATE_FORMAT(
                CONVERT_TZ(
                    h.changed_at,
                    @@session.time_zone,
                    '+06:00'
                ),
                '%d-%m-%Y %h:%i:%s %p'
            ) AS changedAtDhaka
         FROM task_status_history h
         JOIN shift_tasks t ON t.id = h.task_id
         ORDER BY h.id DESC
         LIMIT 3`,
    );
    return entries;
}
