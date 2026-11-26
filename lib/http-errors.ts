import type { Response } from "express";
import { RequestError } from "./request-error";

export function respondToError(error: unknown, response: Response) {
    if (error instanceof RequestError) {
        response.status(error.status).json({ message: error.message, code: error.code });
        return;
    }

    if (error instanceof Error && "type" in error) {
        if (error.type === "entity.parse.failed") {
            response.status(400).json({ message: "Invalid JSON request." });
            return;
        }
        if (error.type === "entity.too.large") {
            response.status(413).json({ message: "Request body is too large." });
            return;
        }
    }

    console.error("Backend request failed:", error);
    response.status(500).json({ message: "The backend could not complete this request." });
}
