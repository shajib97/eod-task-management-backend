import type { RowDataPacket } from "mysql2";
import {
    getCurrentShiftKey,
    getNextShiftKey,
    type ShiftKey,
} from "./current-shift";
import { db } from "./db";
import { handOverPendingTasks } from "./task-handovers";
interface SourceShift extends RowDataPacket {
    date: string;
    name: ShiftKey["name"];
}

interface LockResult extends RowDataPacket {
    acquired: number | null;
}

export async function processShifts() {
    const lockConnection = await db.getConnection();

    try {
        const [locks] = await lockConnection.execute<LockResult[]>(
            "SELECT GET_LOCK('eod_task_management.handovers', 0) AS acquired",
        );

        if (locks[0]?.acquired === 0) return;
        if (locks[0]?.acquired !== 1) throw new Error("Could not acquire the handover lock.");

        const current = getCurrentShiftKey();

        // Catch up one ended shift at a time.
        for (let step = 0; step < 100; step++) {
            const [sources] = await lockConnection.execute<SourceShift[]>(
                `SELECT
           DATE_FORMAT(shift_date, '%Y-%m-%d') AS date,
           shift_name AS name
         FROM shift_tasks
         WHERE status = 'Pending'
           AND (
             shift_date < ?
             OR (
               shift_date = ?
               AND FIELD(shift_name, 'morning', 'evening', 'night')
                 < FIELD(?, 'morning', 'evening', 'night')
             )
           )
         GROUP BY shift_date, shift_name
         ORDER BY shift_date,
           FIELD(shift_name, 'morning', 'evening', 'night')
         LIMIT 1`,
                [current.date, current.date, current.name],
            );

            if (sources.length === 0) break;

            const source = sources[0];
            await handOverPendingTasks(lockConnection, source, getNextShiftKey(source));
        }

        await lockConnection.execute(
            `INSERT INTO shift_tasks (
         name, template_id, shift_date, shift_name,
         origin_shift_date, origin_shift_name
       )
       SELECT t.name, t.id, ?, ?, ?, ?
       FROM task_templates AS t
       WHERE t.shift_name = ? AND t.is_active = 1
       ON DUPLICATE KEY UPDATE id = shift_tasks.id`,
            [
                current.date,
                current.name,
                current.date,
                current.name,
                current.name,
            ],
        );
    } finally {
        try {
            await lockConnection.execute(
                "SELECT RELEASE_LOCK('eod_task_management.handovers')",
            );
        } finally {
            lockConnection.release();
        }
    }
}