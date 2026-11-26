import type { RowDataPacket } from "mysql2/promise";
import { db } from "./db";
import type { ShiftKey } from "./current-shift";

export interface TaskTemplate extends RowDataPacket {
    id: number;
    name: string;
    shift_name: ShiftKey["name"];
    is_active: number;
}

export async function getTaskTemplates() {
    const [templates] = await db.execute<TaskTemplate[]>(
        `SELECT id, name, shift_name, is_active
         FROM task_templates
         ORDER BY
             FIELD(shift_name, 'morning', 'evening', 'night'),
             name,
             id`
    );

    return templates;
}