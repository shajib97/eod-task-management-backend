import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { sendEmail } from "./mailer";
import { db } from "./db";
import { getApprovedAccess } from "./access-list";

export const auth = betterAuth({
    database: db,
    rateLimit: { enabled: true, storage: "database", modelName: "auth_rate_limit" },
    advanced: { ipAddress: { ipAddressHeaders: ["x-eod-client-ip"] } },

    emailVerification: {
        sendOnSignUp: true,
        sendOnSignIn: true,
        async sendVerificationEmail({ user, url }) {
            const delivery = await sendEmail({
                recipients: [user.email],
                subject: "Verify your EOD Task Management email",
                body: [
                    "If you created an EOD account, verify your work email:", url,
                    "If you did not register, ignore this email and contact your EOD administrator.",
                ].join("\n\n"),
            });
            if (!delivery.accepted.length || delivery.rejected.length) {
                throw new Error("SMTP did not accept the verification email.");
            }
        },
    },

    emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
        autoSignIn: false,
        minPasswordLength: 12,
        maxPasswordLength: 128,
        revokeSessionsOnPasswordReset: true,
        async sendResetPassword({ user, url }) {
            if (!await getApprovedAccess(user.email)) return;
            const delivery = await sendEmail({
                recipients: [user.email],
                subject: "Reset your EOD Task Management password",
                body: [
                    "If you requested an EOD password reset, open this link:", url,
                    "If you did not request a reset, ignore this email.",
                ].join("\n\n"),
            });
            if (!delivery.accepted.length || delivery.rejected.length) {
                throw new Error("SMTP did not accept the password reset email.");
            }
        },
    },

    databaseHooks: {
        user: {
            create: {
                before: async (user) => {
                    const email = user.email.trim().toLowerCase();
                    const access = await getApprovedAccess(email);

                    if (!access) {
                        throw new APIError("FORBIDDEN", {
                            message:
                                "Registration is restricted to approved work emails.",
                        });
                    }

                    return {
                        data: {
                            ...user,
                            email,
                        },
                    };
                },
            },
        },
    },
});