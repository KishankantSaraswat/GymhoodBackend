import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import bcrypt from "bcrypt";


const userSchema = new mongoose.Schema({
  // Authentication fields
  name: { type: String, required: true, trim: true },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  registrationSessionId: {
    type: String,
    default: null,
  },

  isPwdAuth: { type: Boolean, default: false },
  password: { type: String, select: false }, //transfer tempPassword to password (on verifyOTP)
  tempPassword: { type: String }, //in login, check password, not tempPassword
  googleId: { type: String },

  // Gym-specific fields
  role: {
    type: String,
    // enum: ['Trainer', 'Staff', 'User', 'Admin', 'GymOwner'], 
    enum: ['User', 'GymOwner', 'Admin'],
    default: 'User'
  },
  walletBalance: { type: Number, default: 0 }, //min: -ve also.. on gymSide...(userRefund)

  // location: { type: String },
  location: {
    address: {
      type: String,
      // required: [true, 'Address is required'],
      trim: true
    },
    pincode: {
      type: String,
      trim: true
    },
    coordinates: {
      type: [Number],  // [longitude, latitude]
      // required: [true, 'Coordinates are required'],
      validate: {
        validator: function (coords) {
          return coords.length === 2 &&
            typeof coords[0] === 'number' &&
            typeof coords[1] === 'number';
        },
        message: 'Coordinates must be an array of two numbers [longitude, latitude]'
      }
    }
  },
  phone: { type: String },
  profile_picture: {
    public_id: String,
    url: String
  },
  //   ratingInteractions: [{
  //   ratingId: { type: mongoose.Schema.Types.ObjectId, ref: 'GymRating' },
  //   action: { type: Number, enum: [1, -1] }, // 1 = like, -1 = dislike
  //   createdAt: { type: Date, default: Date.now }
  // }],


  // Verification fields
  accountVerified: { type: Boolean, default: false },
  pwdSetupAttempts: {
    count: { type: Number, default: 0 },
    lastAttempt: Date
  },
  forgotPasswordAttempts: { type: Number, default: 0 },
  forgotPasswordAttemptsExpire: { type: Date },
  verificationCode: Number,
  verificationCodeExpire: Date,
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  // OTP-based password reset fields
  resetPasswordOTP: Number,
  resetPasswordOTPExpire: Date,
  resetPasswordSessionId: String,
  resetPasswordSessionExpire: Date,
  isDeleted: { type: Boolean, default: false } //soft delete
}, { timestamps: true });


userSchema.methods.generateVerificationCode = function () {
  function generateRandomFiveDigitNumber() {
    const firstDigit = Math.floor(Math.random() * 9) + 1;
    const remainingDigits = Math.floor(Math.random() * 10000).toString().padStart(4, "0");

    return parseInt(firstDigit + remainingDigits);
  }
  const verificationCode = generateRandomFiveDigitNumber();
  this.verificationCode = verificationCode;
  this.verificationCodeExpire = Date.now() + 15 * 60 * 1000; //for 2min
  return verificationCode;
}

userSchema.methods.generateToken = function () {
  const secret = process.env.JWT_SECRET_KEY?.trim().replace(/^["']|["']$/g, '');
  if (!secret) console.error("🚨 Model generateToken: JWT_SECRET_KEY is missing!");

  return jwt.sign({ id: this._id }, secret, {
    expiresIn: process.env.JWT_EXPIRE || "7d",
  });
}

userSchema.methods.getResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(20).toString("hex");

  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.resetPasswordExpire = Date.now() + 15 * 60 * 1000;

  return resetToken;
}

userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
}

// Add 2dsphere index for geospatial queries
userSchema.index({ 'location.coordinates': '2dsphere' });

userSchema.virtual('formattedAddress').get(function () {
  const lat = this.location?.coordinates?.[1];
  const lng = this.location?.coordinates?.[0];
  const address = this.location?.address ?? 'Unknown address';

  if (lat == null || lng == null) return `${address} (coordinates unavailable)`;
  return `${address} (${lat}, ${lng})`;
});


// Pre-save hook to ensure coordinates are in correct order [long, lat]
userSchema.pre('save', function (next) {
  if (this.location.coordinates && this.location.coordinates.length === 2) {
    // Ensure longitude is between -180 and 180
    this.location.coordinates[0] = Math.max(-180, Math.min(180, this.location.coordinates[0]));
    // Ensure latitude is between -90 and 90
    this.location.coordinates[1] = Math.max(-90, Math.min(90, this.location.coordinates[1]));
  }
  next();
});


export default mongoose.model('User', userSchema);