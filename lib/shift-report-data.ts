import type { RowDataPacket } from "mysql2/promise";
import { db } from "./db";
import type { ShiftKey } from "./current-shift";

export interface ShiftReportTask extends RowDataPacket {
    id: number;
    name: string;
    notes: string | null;
    reportStatus: "Pending" | "Completed" | "Handed over";
    carriedIn: number;
    completedAtDhaka: string | null;
    nextShiftDate: string | null;
    nextShiftName: ShiftKey["name"] | null;
}

export async function getShiftReportData(shift: ShiftKey) {
    const [tasks] = await db.execute<ShiftReportTask[]>(
        `
        SELECT
            t.id,
            t.name,
            t.notes,
            t.status AS reportStatus,
            EXISTS (
                SELECT 1
                FROM task_handovers incoming
                WHERE incoming.task_id = t.id
                  AND incoming.to_shift_date = ?
                  AND incoming.to_shift_name = ?
            ) AS carriedIn,
            DATE_FORMAT(
                DATE_ADD(t.completed_at, INTERVAL 6 HOUR),
                '%d-%m-%Y %h:%i:%s %p'
            ) AS completedAtDhaka,
            NULL AS nextShiftDate,
            NULL AS nextShiftName
        FROM shift_tasks t
        WHERE t.shift_date = ?
          AND t.shift_name = ?

        UNION ALL

        SELECT
            t.id,
            t.name,
            t.notes,
            'Handed over' AS reportStatus,
            EXISTS (
                SELECT 1
                FROM task_handovers incoming
                WHERE incoming.task_id = t.id
                  AND incoming.to_shift_date = ?
                  AND incoming.to_shift_name = ?
            ) AS carriedIn,
            NULL AS completedAtDhaka,
            DATE_FORMAT(
                outgoing.to_shift_date,
                '%Y-%m-%d'
            ) AS nextShiftDate,
            outgoing.to_shift_name AS nextShiftName
        FROM task_handovers outgoing
        JOIN shift_tasks t ON t.id = outgoing.task_id
        WHERE outgoing.from_shift_date = ?
          AND outgoing.from_shift_name = ?
          AND NOT (
              t.shift_date = ?
              AND t.shift_name = ?
          )

        ORDER BY id
        `,
        [
            shift.date,
            shift.name,
            shift.date,
            shift.name,
            shift.date,
            shift.name,
            shift.date,
            shift.name,
            shift.date,
            shift.name,
        ],
    );

    return tasks;
}