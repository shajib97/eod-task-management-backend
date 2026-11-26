import type { RowDataPacket } from "mysql2";
import { db } from "./db";

interface ShiftTask extends RowDataPacket {
    id: number;
    name: string;
    notes: string | null;
    status: "Pending" | "Completed";
    carriedOver: number;
    completedAtDhaka: string | null;
}

export async function getShiftTasks(date: string, shiftName: string) {

    const [tasks] = await db.execute<ShiftTask[]>(
        `SELECT
            t.id,
            t.name,
            t.notes,
            t.status,
            DATE_FORMAT(
                DATE_ADD(t.completed_at, INTERVAL 6 HOUR),
                '%d-%m-%Y %h:%i:%s %p'
            ) AS completedAtDhaka,
            EXISTS (
                SELECT 1
                FROM task_handovers AS h
                WHERE h.task_id = t.id
                  AND h.to_shift_date = t.shift_date
                  AND h.to_shift_name = t.shift_name
            ) AS carriedOver
         FROM shift_tasks AS t
         WHERE t.shift_date = ?
           AND t.shift_name = ?
         ORDER BY t.id`,
        [date, shiftName]
    );

    return tasks;
}