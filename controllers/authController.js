// authController.js - Simplified OTP flow & Debug Logs
import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddlewares.js";
import User from "../models/0_unifiedUserModel.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { sendToken } from "../utils/sendToken.js";
import { sendEmail } from "../utils/sendEmail.js";
import { sendVerificationCode } from "../utils/sendVerificationCode.js";
import { generateForgotPasswordEmailTemplate, generateVerificationOtpEmailTemplate } from "../utils/emailTemplate.js";
import { OAuth2Client } from "google-auth-library";
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Register: create user and send OTP
export const register = catchAsyncErrors(async (req, res, next) => {
  const { name, email, password, role, phone, height, weight, gender, foodType } = req.body;
  if (!name || !email || !password || !role) {
    return next(new ErrorHandler("Please enter all fields.", 400));
  }
  if (/[^a-zA-Z0-9!@#$%^&*]/.test(password)) {
    return next(new ErrorHandler("Invalid characters in password.", 400));
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const existing = await User.findOne({ email });

  if (existing && existing.accountVerified && existing.isPwdAuth) {
    return next(new ErrorHandler("User already exists.", 400));
  }

  const registrationSessionId = crypto.randomUUID();
  const verificationCode = Math.floor(100000 + Math.random() * 900000); // Generate 6-digit OTP
  const verificationCodeExpire = Date.now() + 15 * 60 * 1000; // 15 minutes expiry

  let user;
  if (existing) {
    // Update existing record (e.g., after previous failed attempt)
    existing.name = name;
    existing.password = hashedPassword;
    existing.role = role;
    existing.phone = phone || existing.phone;
    existing.accountVerified = false; // Ensure not verified yet
    existing.isPwdAuth = true;
    existing.verificationCode = verificationCode;
    existing.verificationCodeExpire = verificationCodeExpire;
    existing.registrationSessionId = registrationSessionId;
    await existing.save();
    user = existing;
  } else {
    user = new User({
      name,
      email,
      password: hashedPassword,
      role,
      phone: phone || undefined,
      registrationSessionId,
      accountVerified: false, // Default to false
      isPwdAuth: true,
      verificationCode,
      verificationCodeExpire,
    });
    await user.save();
  }

  // Create UserData entry if fitness data is provided
  if (height || weight || gender || foodType) {
    try {
      const { UserData } = await import("../models/UserData.js");
      const userData = await UserData.findOne({ userId: user._id });

      if (userData) {
        // Update existing UserData
        if (height) userData.height = height;
        if (weight) userData.weight = weight;
        if (gender) userData.gender = gender;
        if (foodType) userData.foodType = foodType;
        await userData.save();
      } else {
        // Create new UserData
        await UserData.create({
          userId: user._id,
          height: height || undefined,
          weight: weight || undefined,
          gender: gender || undefined,
          foodType: foodType || undefined,
        });
      }
    } catch (error) {
      console.error("Failed to create/update UserData during registration:", error);
      // Don't fail registration if UserData creation fails
    }
  }

  // Send OTP
  try {
    await sendVerificationCode(verificationCode, email, res, registrationSessionId);
  } catch (error) {
    user.verificationCode = null;
    user.verificationCodeExpire = null;
    await user.save();
    return next(new ErrorHandler("Failed to send verification email.", 500));
  }
});

// verifyOTP: Verify the code and activate account
export const verifyOTP = catchAsyncErrors(async (req, res, next) => {
  const { otp } = req.body;
  const email = req.cookies.email || req.body.email;
  const registrationSessionId = req.cookies.reg_session || req.body.registrationSessionId;

  if (!email || !otp || !registrationSessionId) {
    return next(new ErrorHandler("Required fields are missing.", 400));
  }

  const user = await User.findOne({
    email,
    registrationSessionId,
  });

  if (!user) {
    return next(new ErrorHandler("Invalid session or user not found.", 400));
  }

  if (user.accountVerified) {
    return res.status(200).json({ success: true, message: "User already verified." });
  }

  if (user.verificationCode !== Number(otp)) {
    return next(new ErrorHandler("Invalid OTP.", 400));
  }

  if (user.verificationCodeExpire < Date.now()) {
    return next(new ErrorHandler("OTP expired. Please register again.", 400));
  }

  // OTP is valid
  user.accountVerified = true;
  user.verificationCode = null;
  user.verificationCodeExpire = null;
  user.registrationSessionId = null;
  await user.save();

  sendToken(user, 200, "Account verified successfully.", res);
});

// Login with Debug Logs
export const login = catchAsyncErrors(async (req, res, next) => {
  const { email, password, role } = req.body;
  console.log("🔑 Login Request:", { email, role });

  if (!email || !password || !role) {
    return next(new ErrorHandler("Please enter all fields.", 400));
  }

  const user = await User.findOne({ email, accountVerified: true, role }).select("+password");

  if (!user) {
    console.log("❌ Login Failed: User not found or not verified/role mismatch");
    // Debug: check if user exists at all
    const debugUser = await User.findOne({ email });
    if (debugUser) {
      console.log("🔍 Debug: User exists but...", {
        verified: debugUser.accountVerified,
        role: debugUser.role,
        reqRole: role
      });
    } else {
      console.log("🔍 Debug: User does not exist at all");
    }
    return res.status(400).json({ success: false, message: "User not found. Please register first." });
  }

  if (!user.isPwdAuth) {
    console.log("❌ Login Failed: Not password authenticated");
    return next(new ErrorHandler("Use Google Sign-In to log in, or register with your email and password.", 400));
  }

  const isPasswordMatched = await bcrypt.compare(password, user.password);
  console.log("🔐 Password Match Result:", isPasswordMatched);

  if (!isPasswordMatched) {
    console.log("❌ Login Failed: Invalid password");
    return next(new ErrorHandler("Invalid email or password", 400));
  }

  sendToken(user, 200, "User login successfully.", res);
});

// Google login (unchanged)
export const googleLogin = catchAsyncErrors(async (req, res, next) => {
  const { token, role } = req.body;
  if (!token || !role) return next(new ErrorHandler("either token or role is missing.", 400));
  const googleUser = await verifyGoogleToken(token);
  const { name, email, picture, sub: googleId } = googleUser;
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      name,
      email,
      googleId,
      isPwdAuth: false,
      password: null,
      profile_picture: { url: picture, public_id: null },
      role,
      accountVerified: true,
    });
  } else {
    if (user.role !== role) return next(new ErrorHandler("incorrect role.", 400));
    if (!user.googleId) {
      user.googleId = googleId;
      user.profile_picture = { url: picture, public_id: null };
      await user.save();
    }
  }
  sendToken(user, 200, "Google Login successful", res);
});

async function verifyGoogleToken(token) {
  try {
    const ticket = await client.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID });
    return ticket.getPayload();
  } catch (error) {
    console.error("Error verifying Google token:", error);
    throw error;
  }
}

export const logout = catchAsyncErrors(async (req, res, next) => {
  res.status(200)
    .cookie("token", "", { expires: new Date(0), httpOnly: true })
    .json({ success: true, message: "Logged out successfully." });
});

export const getUser = catchAsyncErrors(async (req, res, next) => {
  const user = req.user;
  res.status(200).json({ success: true, user });
});

export const updateUserProfile = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user._id;
  const { name, phone } = req.body;

  const updateData = {};
  if (name !== undefined) {
    if (!name || name.trim().length === 0) {
      return next(new ErrorHandler("Name cannot be empty.", 400));
    }
    updateData.name = name.trim();
  }
  if (phone !== undefined) {
    updateData.phone = phone ? phone.trim() : null;
  }

  if (Object.keys(updateData).length === 0) {
    return next(new ErrorHandler("No valid fields to update.", 400));
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: updateData },
    { new: true, runValidators: true }
  );

  if (!user) {
    return next(new ErrorHandler("User not found.", 404));
  }

  res.status(200).json({
    success: true,
    message: "Profile updated successfully",
    user,
  });
});

export const forgotPassword = catchAsyncErrors(async (req, res, next) => {
  if (!req.body.email) return next(new ErrorHandler("Email is required.", 400));

  const user = await User.findOne({
    email: req.body.email,
    accountVerified: true,
  });

  if (!user) return next(new ErrorHandler("Invalid email.", 400));

  if (!user.isPwdAuth) {
    return next(new ErrorHandler("Use Google Sign-In to log in, or register with your email and password.", 400));
  }

  if (!user.forgotPasswordAttemptsExpire || user.forgotPasswordAttemptsExpire < Date.now()) {
    user.forgotPasswordAttempts = 0;
    user.forgotPasswordAttemptsExpire = Date.now() + 60 * 60 * 1000; // 1 hour expiry
  }

  if (user.forgotPasswordAttempts >= 3) {
    return next(new ErrorHandler("Too many reset requests. Try again after 1 hour.", 429));
  }

  user.forgotPasswordAttempts += 1;

  // Generate 6-digit OTP
  const resetOTP = Math.floor(100000 + Math.random() * 900000);
  user.resetPasswordOTP = resetOTP;
  user.resetPasswordOTPExpire = Date.now() + 15 * 60 * 1000; // 15 minutes expiry

  await user.save({ validateBeforeSave: false });

  const message = generateVerificationOtpEmailTemplate(resetOTP);

  try {
    await sendEmail({
      to: user.email,
      subject: "🔐 Reset Your gymsHood Password - OTP Verification",
      message,
    });

    res.status(200).json({
      success: true,
      message: `OTP sent to ${user.email} successfully.`,
    });
  } catch (error) {
    user.resetPasswordOTP = undefined;
    user.resetPasswordOTPExpire = undefined;
    await user.save({ validateBeforeSave: false });
    return next(new ErrorHandler("Failed to send OTP email.", 500));
  }
});

export const verifyResetOTP = catchAsyncErrors(async (req, res, next) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return next(new ErrorHandler("Email and OTP are required.", 400));
  }

  const user = await User.findOne({ email, accountVerified: true });

  if (!user) {
    return next(new ErrorHandler("Invalid email.", 400));
  }

  if (!user.resetPasswordOTP) {
    return next(new ErrorHandler("No OTP request found. Please request a new OTP.", 400));
  }

  if (user.resetPasswordOTP !== Number(otp)) {
    return next(new ErrorHandler("Invalid OTP.", 400));
  }

  if (user.resetPasswordOTPExpire < Date.now()) {
    return next(new ErrorHandler("OTP expired. Please request a new one.", 400));
  }

  // OTP is valid, create reset session
  const resetSessionId = crypto.randomUUID();
  user.resetPasswordSessionId = resetSessionId;
  user.resetPasswordSessionExpire = Date.now() + 15 * 60 * 1000; // 15 minutes
  user.resetPasswordOTP = undefined;
  user.resetPasswordOTPExpire = undefined;

  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    message: "OTP verified successfully.",
    resetSessionId,
  });
});

export const resetPassword = catchAsyncErrors(async (req, res, next) => {
  const { resetSessionId, password, confirmPassword } = req.body;

  if (!resetSessionId) {
    return next(new ErrorHandler("Reset session ID is required.", 400));
  }

  const user = await User.findOne({
    resetPasswordSessionId: resetSessionId,
    resetPasswordSessionExpire: { $gt: Date.now() },
  }).select("+password");

  if (!user) {
    return next(new ErrorHandler("Invalid or expired reset session.", 400));
  }

  const newPassword = String(password).trim();
  const confirmPass = String(confirmPassword).trim();

  if (newPassword !== confirmPass) {
    return next(new ErrorHandler("Password & confirm password don't match.", 400));
  }

  if (await bcrypt.compare(newPassword, user.password)) {
    return next(new ErrorHandler("New password must be different from the old password.", 400));
  }

  if (newPassword.length < 8 || newPassword.length > 16) {
    return next(new ErrorHandler("Password must be between 8 & 16 characters.", 400));
  }

  if (/^0+$/.test(newPassword)) {
    return next(new ErrorHandler("Password cannot be all zeros.", 400));
  }

  const invalidChars = newPassword.match(/[^a-zA-Z0-9!@#$%^&*]/);
  if (invalidChars) {
    return next(new ErrorHandler(`Invalid character(s) in password: ${invalidChars.join(", ")}`, 400));
  }

  user.password = await bcrypt.hash(newPassword, 10);
  user.resetPasswordSessionId = undefined;
  user.resetPasswordSessionExpire = undefined;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;

  await user.save();
  sendToken(user, 200, "Password reset successfully. Please log in again.", res);
});

// Placeholder for updatePassword (not used in simplified flow)
export const updatePassword = catchAsyncErrors(async (req, res, next) => {
  // In a real app, you'd verify current password, hash new password, etc.
  res.status(200).json({ success: true, message: "Password updated (placeholder)." });
});

// Placeholder for updateUserLocation
export const updateUserLocation = catchAsyncErrors(async (req, res, next) => {
  // In a real app, you'd update user's location in DB.
  res.status(200).json({ success: true, message: "User location updated (placeholder)." });
});