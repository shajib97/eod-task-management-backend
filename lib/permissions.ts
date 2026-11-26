import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import { auth } from "./auth";
import { getApprovedAccess } from "./access-list";
import { RequestError } from "./request-error";

export type OperatorAccess = {
    user: { id: string; email: string; name: string };
    role: "admin" | "operator";
};

export async function requireOperator(request: Request): Promise<OperatorAccess> {
    const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
        query: { disableCookieCache: true },
    });

    if (!session) {
        throw new RequestError(401, "Sign in to continue.", "SIGN_IN_REQUIRED");
    }

    if (!session.user.emailVerified) {
        throw new RequestError(403, "Verify your work email before continuing.");
    }

    const access = await getApprovedAccess(session.user.email);
    if (!access || (access.role !== "admin" && access.role !== "operator")) {
        throw new RequestError(403, "Your access is inactive or not approved.");
    }

    const { id, email, name } = session.user;
    return { user: { id, email, name }, role: access.role };
}

export async function requireAdmin(request: Request): Promise<OperatorAccess> {
    const access = await requireOperator(request);
    if (access.role !== "admin") {
        throw new RequestError(403, "Administrator access is required.", "ADMIN_REQUIRED");
    }
    return access;
}
