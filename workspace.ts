import express, { type Request, type RequestHandler } from "express";
import { getCurrentShiftKey, type ShiftKey } from "./lib/current-shift";
import { getEmailReportSettings } from "./lib/email-report-settings";
import { requireAdmin, requireOperator, type OperatorAccess } from "./lib/permissions";
import { processShifts } from "./lib/process-shifts";
import { getReportDeliveryStatus } from "./lib/report-delivery-status";
import { RequestError } from "./lib/request-error";
import { getShiftReportData } from "./lib/shift-report-data";
import { getShiftTasks } from "./lib/shift-tasks";
import { getTaskTemplates } from "./lib/task-templates";
import { sendSelectedShiftReport } from "./services/reports";
import { saveEmailReportSettings } from "./services/settings";
import { addTask, generateShiftChecklist, updateTaskNotes, updateTaskStatus } from "./services/shift-tasks";
import { addTaskTemplate, renameTaskTemplate, updateTemplateStatus } from "./services/task-templates";
import { addApprovedUser, manageApprovedUser } from "./services/users";
import { getApprovedUsers, getHandovers, getRecentTaskActivity, getTaskHistory } from "./services/workspace-queries";

export const workspace = express.Router();

function read(
    handler: (request: Request, access: OperatorAccess) => unknown,
    authorize = requireOperator,
): RequestHandler {
    return async (request, response) => {
        const access = await authorize(request);
        response.json(await handler(request, access));
    };
}

type Fields = { get(key: string): unknown };

function write(
    handler: (fields: Fields, access: OperatorAccess) => Promise<unknown>,
    authorize = requireOperator,
): RequestHandler {
    return async (request, response) => {
        const access = await authorize(request);
        if (!request.is("application/json")) {
            throw new RequestError(415, "Send mutation data as JSON.");
        }
        const body: unknown = request.body;
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new RequestError(400, "Expected a JSON object.");
        }
        const values = body as Record<string, unknown>;
        const fields = { get: (key: string) => Object.hasOwn(values, key) ? values[key] : null };
        const result = await handler(fields, access);

        if (result === undefined) {
            response.status(204).end();
            return;
        }
        response.json(result);
    };
}

function parseShift(request: Request): ShiftKey {
    const { date, shift: name } = request.query;
    if (
        typeof date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        (name !== "morning" && name !== "evening" && name !== "night")
    ) {
        throw new RequestError(400, "Select a valid date and shift.");
    }

    const parsed = new Date(`${date}T00:00:00Z`);
    if (
        Number(date.slice(0, 4)) < 1000 ||
        Number.isNaN(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== date
    ) {
        throw new RequestError(400, "Select a valid date and shift.");
    }

    return { date, name };
}

workspace.use(express.json({ limit: "64kb" }));

workspace.get("/session", read((_request, access) => access));
workspace.get("/session/admin", read((_request, access) => access, requireAdmin));
workspace.get("/shifts/current", read(getCurrentShiftKey));
workspace.get("/tasks", read((request) => {
    const shift = parseShift(request);
    return getShiftTasks(shift.date, shift.name);
}));
workspace.get("/task-history", read(getTaskHistory));
workspace.get("/recent-activity", read(getRecentTaskActivity));
workspace.get("/handovers", read(getHandovers));
workspace.get("/reports", read((request) => getShiftReportData(parseShift(request))));
workspace.get("/reports/delivery", read((request) => getReportDeliveryStatus(parseShift(request))));
workspace.get("/users", read(getApprovedUsers, requireAdmin));
workspace.get("/templates", read(getTaskTemplates, requireAdmin));
workspace.get("/settings/email", read(getEmailReportSettings, requireAdmin));

workspace.post("/tasks", write(addTask));
workspace.post("/tasks/status", write(updateTaskStatus));
workspace.post("/tasks/checklist", write(generateShiftChecklist));
workspace.post("/tasks/notes", write(updateTaskNotes));
workspace.post("/reports/send", write(sendSelectedShiftReport));
workspace.post("/users", write(addApprovedUser, requireAdmin));
workspace.post("/users/access", write(manageApprovedUser, requireAdmin));
workspace.post("/templates", write(addTaskTemplate, requireAdmin));
workspace.post("/templates/status", write(updateTemplateStatus, requireAdmin));
workspace.post("/templates/name", write(renameTaskTemplate, requireAdmin));
workspace.post("/settings/email", write(saveEmailReportSettings, requireAdmin));
workspace.post("/shifts/sync", write(async () => {
    try {
        await processShifts();
        return { success: true };
    } catch (error) {
        console.error("Shift processing failed:", error);
        return { success: false };
    }
}));
