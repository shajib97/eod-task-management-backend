import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { RequestHandler } from "express";

export const protectAuthIngress: RequestHandler = (request, response, next) => {
    const secret = process.env.AUTH_PROXY_SECRET;
    const supplied = Buffer.from(request.get("x-eod-auth-proxy-secret") ?? "");
    const expected = Buffer.from(secret ?? "");
    const peer = request.socket.remoteAddress;
    const isLocalPeer = peer === "127.0.0.1" || peer === "::1" || peer === "::ffff:127.0.0.1";
    const hostname = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").hostname;
    const isLocalFrontend = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
    const trustedProxy = expected.length >= 32 && supplied.length === expected.length &&
        timingSafeEqual(supplied, expected);
    const clientIp = trustedProxy
        ? request.get("x-eod-client-ip")
        : !secret && isLocalPeer && isLocalFrontend ? "127.0.0.1" : undefined;

    if (!clientIp || !isIP(clientIp)) {
        response.status(403).json({ message: "Auth proxy access is required." });
        return;
    }

    request.headers["x-eod-client-ip"] = clientIp;
    delete request.headers["x-eod-auth-proxy-secret"];
    next();
};
