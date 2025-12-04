import * as brevo from '@getbrevo/brevo';

export const sendEmail = async ({ to, subject, message }) => {
    try {
        console.log("📧 Email Configuration:", {
            method: "Brevo API (REST)",
            from: process.env.SMTP_MAIL || "noreply@gymhood.com",
            to: to,
            hasApiKey: !!process.env.BREVO_API_KEY
        });

        // Initialize Brevo API client
        const apiInstance = new brevo.TransactionalEmailsApi();
        apiInstance.setApiKey(
            brevo.TransactionalEmailsApiApiKeys.apiKey,
            process.env.BREVO_API_KEY
        );

        // Prepare email data
        const sendSmtpEmail = new brevo.SendSmtpEmail();
        sendSmtpEmail.sender = {
            email: process.env.SMTP_MAIL || "noreply@gymhood.com",
            name: "GymHood"
        };
        sendSmtpEmail.to = [{ email: to }];
        sendSmtpEmail.subject = subject;
        sendSmtpEmail.htmlContent = message;

        // Send email via Brevo API
        const response = await apiInstance.sendTransacEmail(sendSmtpEmail);

        console.log(`✅ Email sent successfully to ${to}`);
        console.log(`📧 Message ID: ${response.messageId}`);

        return response;
    } catch (error) {
        console.error("❌ Failed to send email:", error);
        console.error("❌ Error details:", {
            message: error.message,
            response: error.response?.text || error.response?.body
        });
        throw new Error("Failed to send email: " + error.message);
    }
};
