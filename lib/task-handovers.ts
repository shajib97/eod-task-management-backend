import type { PoolConnection, RowDataPacket } from "mysql2/promise";

type ShiftKey = {
    date: string;
    name: "morning" | "evening" | "night";
};

interface PendingTask extends RowDataPacket {
    id: number;
}

export async function handOverPendingTasks(connection: PoolConnection, from: ShiftKey, to: ShiftKey) {
    if (from.date === to.date && from.name === to.name) {
        throw new Error("Choose a different destination shift.");
    }

    try {
        await connection.beginTransaction();

        const [tasks] = await connection.execute<PendingTask[]>(
            `SELECT id
       FROM shift_tasks
       WHERE shift_date = ? AND shift_name = ? AND status = 'Pending'
       ORDER BY id
       FOR UPDATE`,
            [from.date, from.name],
        );

        for (const task of tasks) {
            await connection.execute(
                `INSERT INTO task_handovers (
           task_id, from_shift_date, from_shift_name,
           to_shift_date, to_shift_name
         ) VALUES (?, ?, ?, ?, ?)`,
                [task.id, from.date, from.name, to.date, to.name],
            );

            await connection.execute(
                `UPDATE shift_tasks
         SET shift_date = ?, shift_name = ?
         WHERE id = ?`,
                [to.date, to.name, task.id],
            );
        }

        await connection.commit();
        return tasks.length;
    } catch (error) {
        await connection.rollback();
        throw error;
    }
}