import Razorpay from "razorpay";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envCandidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "config.env"),
];

const didLoadEnv = envCandidates.some((envPath) => {
    if (!fs.existsSync(envPath)) return false;
    const { error } = dotenv.config({ path: envPath });
    return !error;
});

if (!didLoadEnv) {
    dotenv.config();
}

export const createRazorpayInstance = () => {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        throw new Error("Razorpay keys not configured in environment variables");
    }

    return new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
};