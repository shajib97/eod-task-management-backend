import { RequestError } from "../lib/request-error";
import { db } from "../lib/db";

export async function addTaskTemplate(formData: { get(key: string): unknown }) {
    const rawName = formData.get("name");
    const shift = formData.get("shift");

    if (typeof rawName !== "string") {
        throw new RequestError(400, "Enter a task name.");
    }

    const name = rawName.trim();

    if (!name || name.length > 120) {
        throw new RequestError(400, "Task name must contain 1–120 characters.");
    }

    if (
        shift !== "morning" &&
        shift !== "evening" &&
        shift !== "night"
    ) {
        throw new RequestError(400, "Select a valid shift.");
    }

    await db.execute(
        `INSERT INTO task_templates (name, shift_name)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE id = task_templates.id`,
        [name, shift]
    );
}
export async function updateTemplateStatus(formData: { get(key: string): unknown }) {
    const rawId = formData.get("id");
    const active = formData.get("active");

    if (typeof rawId !== "string" || !/^[1-9]\d*$/.test(rawId)) {
        throw new RequestError(400, "Invalid template ID.");
    }

    const id = Number(rawId);

    if (!Number.isSafeInteger(id)) {
        throw new RequestError(400, "Invalid template ID.");
    }

    if (active !== "0" && active !== "1") {
        throw new RequestError(400, "Invalid template status.");
    }

    await db.execute(
        `UPDATE task_templates
         SET is_active = ?
         WHERE id = ?`,
        [Number(active), id]
    );
}
export async function renameTaskTemplate(formData: { get(key: string): unknown }) {
    const rawId = formData.get("id");
    const rawName = formData.get("name");

    if (
        typeof rawId !== "string" ||
        !/^[1-9]\d*$/.test(rawId)
    ) {
        throw new RequestError(400, "Invalid template ID.");
    }

    const id = Number(rawId);

    if (!Number.isSafeInteger(id)) {
        throw new RequestError(400, "Invalid template ID.");
    }

    if (typeof rawName !== "string") {
        throw new RequestError(400, "Enter a task name.");
    }

    const name = rawName.trim();

    if (!name || name.length > 120) {
        throw new RequestError(400, "Task name must contain 1–120 characters.");
    }

    try {
        await db.execute(
            `UPDATE task_templates
             SET name = ?
             WHERE id = ?`,
            [name, id]
        );
    } catch (error) {
        if (
            error instanceof Error &&
            "code" in error &&
            error.code === "ER_DUP_ENTRY"
        ) {
            throw new RequestError(
                400,
                "Another template already has this name for the same shift."
            );
        }

        throw error;
    }
}