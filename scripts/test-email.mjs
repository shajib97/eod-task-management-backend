import nodemailer from "nodemailer";

async function main() {
    const user = process.env.SMTP_USER;
    const password = process.env.SMTP_PASSWORD;
    const recipient = process.env.REPORT_TEST_TO;

    if (!user || !password || !recipient) {
        throw new Error("Missing SMTP environment variables.");
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
                name: "EOD App — Development Test",
                address: user,
            },
            to: recipient,
            subject: "[TEST] EOD shift report — dummy data",
            text: [
                "EOD Task Management — email delivery test",
                "",
                "This message contains dummy data only.",
                "",
                "Total tasks: 3",
                "Completed: 2",
                "Pending: 1",
                "",
                "This is a manual test, not an automatic shift report.",
            ].join("\n"),
        });

        console.log("SMTP accepted recipients:", result.accepted);
        console.log("SMTP rejected recipients:", result.rejected);
        console.log("Check the recipient inbox and junk folder.");
    } finally {
        transporter.close();
    }
}

main().catch((error) => {
    console.error("Email test failed:", error.code ?? error.name);
    console.error("SMTP response code:", error.responseCode ?? "Unavailable");
    process.exitCode = 1;
});