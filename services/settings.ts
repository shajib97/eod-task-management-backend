import { db } from "../lib/db";

export async function saveEmailReportSettings(formData: { get(key: string): unknown }) {
    const rawRecipients = formData.get("recipientEmails");
    const rawEnabled = formData.get("automaticReports");
    if (rawEnabled !== null && rawEnabled !== "on" && rawEnabled !== "off") {
        return { status: "invalid" } as const;
    }
    const enabled = rawEnabled === null ? null : rawEnabled === "on";

    if (
        typeof rawRecipients !== "string" ||
        rawRecipients.length > 2000
    ) {
        return { status: "invalid" } as const;
    }

    const recipients = [
        ...new Set(
            rawRecipients
                .split(",")
                .map((email) => email.trim())
                .filter((email) => email.length > 0),
        ),
    ];

    const hasInvalidEmail = recipients.some(
        (email) =>
            email.length > 254 ||
            !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email),
    );

    if (
        recipients.length === 0 ||
        recipients.length > 10 ||
        hasInvalidEmail
    ) {
        return { status: "invalid" } as const;
    }

    await db.execute(
        `INSERT INTO email_report_settings (
            id,
            enabled,
            recipient_emails
         )
         VALUES (1, COALESCE(?, FALSE), ?)
         ON DUPLICATE KEY UPDATE
            enabled = COALESCE(?, enabled),
            recipient_emails = VALUES(recipient_emails)`,
        [enabled, recipients.join(", "), enabled],
    );

    return { status: "saved" } as const;
}