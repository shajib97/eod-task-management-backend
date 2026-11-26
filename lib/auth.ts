import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { db } from "./db";
import { getApprovedAccess } from "./access-list";

export const auth = betterAuth({
    database: db,

    emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
        autoSignIn: false,
        minPasswordLength: 12,
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