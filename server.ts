import express, { type ErrorRequestHandler } from "express";
import { toNodeHandler } from "better-auth/node";
import { protectAuthIngress } from "./lib/auth-ingress";
import { auth } from "./lib/auth";
import { respondToError } from "./lib/http-errors";
import { workspace } from "./workspace";

const app = express();
app.disable("x-powered-by");
app.disable("etag");

app.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
});

app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
});

// Better Auth reads the original request body and needs the full /api/auth path.
app.all("/api/auth/{*path}", protectAuthIngress, toNodeHandler(auth));
app.use("/api/workspace", workspace);

app.use((_request, response) => {
    response.status(404).json({ message: "Endpoint not found." });
});

const handleError: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    if (response.headersSent) {
        next(error);
        return;
    }

    respondToError(error, response);
};

app.use(handleError);

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? "4000");
export const server = app.listen(port, host, () => {
    console.log(`EOD backend listening on http://${host}:${port}`);
});
