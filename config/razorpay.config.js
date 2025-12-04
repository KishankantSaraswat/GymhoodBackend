import Razorpay from "razorpay";

export const createRazorpayInstance = () => {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        console.error("❌ Razorpay configuration error:");
        console.error("RAZORPAY_KEY_ID:", process.env.RAZORPAY_KEY_ID ? "✓ Set" : "✗ Missing");
        console.error("RAZORPAY_KEY_SECRET:", process.env.RAZORPAY_KEY_SECRET ? "✓ Set" : "✗ Missing");
        throw new Error("Razorpay keys not configured in environment variables");
    }

    console.log("✅ Razorpay instance created successfully");
    return new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
};