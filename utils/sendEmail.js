import nodeMailer from "nodemailer";

//mailSending issue: generate new appPassword-->simple & most Effective solution:
const getSmtpAccounts = () => [
    {
        host: process.env.SMTP_HOST, // Gets fresh env values when called
        service: process.env.SMTP_SERVICE,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_MAIL,
        pass: process.env.SMTP_PASSWORD
    },

    //   {
    //     host: process.env.SMTP1_HOST, 
    //     service: process.env.SMTP1_SERVICE,
    //     port: process.env.SMTP1_PORT,
    //     user: process.env.SMTP1_MAIL,
    //     pass: process.env.SMTP1_PASSWORD
    //   },

    //   {
    //         host: process.env.SMTP2_HOST,
    //         service: process.env.SMTP2_SERVICE,
    //         port: process.env.SMTP2_PORT,
    //         user: process.env.SMTP2_MAIL,
    //         pass: process.env.SMTP2_PASSWORD,
    //     },
    //     {
    //         host: process.env.SMTP3_HOST,
    //         service: process.env.SMTP3_SERVICE,
    //         port: process.env.SMTP3_PORT,
    //         user: process.env.SMTP3_MAIL,
    //         pass: process.env.SMTP3_PASSWORD,
    //     },
];

// Email counter and index tracker
let emailCount = 0;
let currentIndex = 0;

import nodemailer from "nodemailer";

export const sendEmail = async ({ to, subject, message }) => {
    try {
        // console.log(process.env.HOSTINGER_MAIL,process.env.HOSTINGER_PASS)
        const transporter = nodemailer.createTransport({
            host: "smtp.hostinger.com",
            port: 465, // use 587 for TLS
            secure: true, // true for port 465, false for 587
            auth: {
                user: process.env.HOSTINGER_MAIL, // your full email like yourname@yourdomain.com
                pass: process.env.HOSTINGER_PASS, // your email password
            },
        });

        const mailOptions = {
            from: {
                name: "GymsHood",
                address: process.env.HOSTINGER_MAIL,
            },
            to,
            subject,
            html: message,
        };
        console.log(mailOptions)
        const info = await transporter.sendMail(mailOptions);
        console.log("📧 Email sent:", info.messageId);
    } catch (error) {
        console.error("❌ Failed to send email:", error.message);
        throw new Error("Failed to send email");
    }
};
