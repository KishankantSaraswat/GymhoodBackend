import nodeMailer from "nodemailer";

export const sendEmail = async ({ to, subject, message }) => {
    try {
        console.log("📧 Email Configuration:", {
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            service: process.env.SMTP_SERVICE,
            from: process.env.SMTP_MAIL,
            to: to,
            hasPassword: !!process.env.SMTP_PASSWORD
        });

        const transporter = nodeMailer.createTransport({
            host: process.env.SMTP_HOST,   // e.g. smtp.gmail.com or smtp-relay.brevo.com
            port: 587,                     // MUST be 587 for Render
            secure: false,                 // NO SSL
            requireTLS: true,              // Force TLS
            auth: {
                user: process.env.SMTP_MAIL,
                pass: process.env.SMTP_PASSWORD,
            },
        });


        // Verify connection
        await transporter.verify();
        console.log("✅ SMTP connection verified");

        const mailOptions = {
            from: process.env.SMTP_MAIL,
            to,
            subject,
            html: message,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 Email sent successfully to ${to}`);
        console.log(`📧 Message ID: ${info.messageId}`);
        console.log(`📧 Response: ${info.response}`);
    } catch (error) {
        console.error("❌ Failed to send email:", error);
        console.error("❌ Error details:", {
            message: error.message,
            code: error.code,
            command: error.command
        });
        throw new Error("Failed to send email: " + error.message);
    }
};
