import nodemailer from "nodemailer";

interface ReportEmail {
    recipients: string[];
    subject: string;
    body: string;
}

export async function sendReportEmail({
    recipients,
    subject,
    body,
}: ReportEmail) {
    const user = process.env.SMTP_USER;
    const password = process.env.SMTP_PASSWORD;

    if (!user || !password) {
        throw new Error("Missing SMTP credentials.");
    }

    if (recipients.length === 0) {
        throw new Error("No report recipients configured.");
    }

    const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        requireTLS: true,
        auth: {
            user,
            pass: password,
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 30000,
    });

    try {
        const result = await transporter.sendMail({
            from: {
                name: "EOD Task Management",
                address: user,
            },
            to: recipients,
            subject,
            text: body,
        });

        return {
            messageId: result.messageId,
            accepted: result.accepted.map(String),
            rejected: result.rejected.map(String),
        };
    } finally {
        transporter.close();
    }
}