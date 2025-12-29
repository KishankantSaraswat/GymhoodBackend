export const sendToken = (user, statusCode, message, res) => {
    const key = (process.env.JWT_SECRET_KEY || "").trim();
    console.log(`🔑 Token Generation - Key Fingerprint: ${key.substring(0, 2)}...${key.substring(key.length - 2)} (Length: ${key.length})`);
    const token = user.generateToken();

    const cookieExpireDays = process.env.COOKIE_EXPIRE || 5; // Default to 5 days

    const options = {
        expires: new Date(
            Date.now() + cookieExpireDays * 24 * 60 * 60 * 1000
        ),
        httpOnly: true,
    };

    res.status(statusCode)
        .cookie("gymshood_token", token, options)
        .json({
            success: true,
            user,
            message,
            token,
        });
};