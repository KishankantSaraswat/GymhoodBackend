export const sendToken = (user, statusCode, message, res) => {
    const token = user.generateToken();

    const cookieExpireDays = process.env.COOKIE_EXPIRE || 5; // Default to 5 days

    const options = {
        expires: new Date(
            Date.now() + cookieExpireDays * 24 * 60 * 60 * 1000
        ),
        httpOnly: true,
    };

    res.status(statusCode)
        .cookie("token", token, options)
        .json({
            success: true,
            user,
            message,
            token,
        });
};