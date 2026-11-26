import type { RowDataPacket } from "mysql2";
import {
    getCurrentShiftKey,
    getNextShiftKey,
    type ShiftKey,
} from "../lib/current-shift";
import { db } from "../lib/db";
import { handOverPendingTasks } from "../lib/task-handovers";

interface SourceShift extends RowDataPacket {
    date: string;
    name: ShiftKey["name"];
}

interface LockResult extends RowDataPacket {
    acquired: number | null;
}

async function runHandovers() {
    const lockConnection = await db.getConnection();

    try {
        const [locks] = await lockConnection.execute<LockResult[]>(
            "SELECT GET_LOCK('eod_task_management.handovers', 0) AS acquired",
        );

        if (locks[0].acquired !== 1) {
            console.log("Another handover job is running.");
            return;
        }

        const current = getCurrentShiftKey();
        let totalMoved = 0;

        // Limit each run's work. Later runs continue any remaining catch-up.
        for (let step = 0; step < 100; step++) {
            const [sources] = await db.execute<SourceShift[]>(
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
         ORDER BY
           shift_date,
           FIELD(shift_name, 'morning', 'evening', 'night')
         LIMIT 1`,
                [current.date, current.date, current.name],
            );

            const source = sources[0];

            if (!source) break;

            const destination = getNextShiftKey(source);
            const moved = await handOverPendingTasks(source, destination);

            totalMoved += moved;

            console.log(
                `${source.date} ${source.name} -> ` +
                `${destination.date} ${destination.name}: ${moved} task(s)`,
            );
        }

        console.log(`Finished. Total task transfers: ${totalMoved}`);
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

runHandovers()
    .catch((error) => {
        console.error("Handover job failed:", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await db.end();
    });