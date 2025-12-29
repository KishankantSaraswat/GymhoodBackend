// import BlacklistToken from "../models/blacklistToken.model.js";
import User from "../models/0_unifiedUserModel.js";
import { catchAsyncErrors } from "./catchAsyncErrors.js";
import ErrorHandler from "./errorMiddlewares.js"
import jwt from "jsonwebtoken";

export const isAuthenticated = catchAsyncErrors(async (req, res, next) => {
    let token;

    // 1. Check Authorization header first (explicit token)
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1]?.trim();
        console.log("🔍 Auth Middleware - Found token in Header");
    }
    // 2. Fallback to Cookies
    else if (req.cookies.gymshood_token) {
        token = req.cookies.gymshood_token.trim();
        console.log("🔍 Auth Middleware - Found token in Cookie");
    }

    if (!token) {
        console.log("❌ Auth Middleware - No token found in Header or Cookie");
        return next(new ErrorHandler("User is not authenticated.", 401));
    }

    console.log(`🎫 Received Token: ${token.substring(0, 10)}... (Length: ${token.length})`);

    // Strip quotes if any (e.g. JWT_SECRET_KEY="secret")
    const secretKey = process.env.JWT_SECRET_KEY?.trim().replace(/^["']|["']$/g, '');

    if (!secretKey) {
        console.error("🚨 CRITICAL: JWT_SECRET_KEY is MISSING in backend config!");
    } else {
        console.log(`ℹ️ Auth Middleware - Key Fingerprint: ${secretKey.substring(0, 2)}...${secretKey.substring(secretKey.length - 2)} (Length: ${secretKey.length})`);
    }

    try {
        // Decode without verification just for debugging
        const payload = jwt.decode(token);
        console.log("🎫 Token Payload (unverified):", payload);

        if (!payload || !payload.id) {
            console.error("🚨 SECURITY ALERT: Token payload is missing 'id'. Likely an external token.");
            return next(new ErrorHandler("Detected a token from another application. Please click 'Reset Session' and log in again.", 401));
        }

        console.log("🔑 Auth Middleware - Verifying token...");
        const decoded = jwt.verify(token, secretKey);
        console.log("✅ Auth Middleware - Token verified, user ID:", decoded.id);
        req.user = await User.findById(decoded.id);
        if (!req.user) {
            console.log("❌ Auth Middleware - User not found in DB");
            return next(new ErrorHandler("User not found.", 404));
        }
        next();
    } catch (error) {
        console.error("❌ Auth Middleware - JWT Error:", error.message);

        if (error.message === "invalid signature") {
            return next(new ErrorHandler("Signature mismatch! Your token might be from another application or server instance. Please click 'Reset Session' and log in again.", 401));
        }

        return next(new ErrorHandler("Invalid or expired token.", 401));
    }
});

// Role-based authorization middleware (both isAuthorized & requireRole is truely identical)

// export const isAuthorized = (...roles) => {
//     return (req, res, next) => {
//         if (!roles.includes(req.user.role)) {
//             return next(
//                 new ErrorHandler(`Role (${req.user.role}) is not authorized to access this resource`, 403)
//             );
//         }
//         next();
//     };
// };

// Only admin and manager can access

// router.get('/admin-data', requireRole('admin', 'manager'), someController);

// Generic role-based authorization middleware
export const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!allowedRoles.includes(req.user.role)) {
            return next(
                new ErrorHandler(
                    `Role ${req.user.role} is not authorized to access this resource.`,
                    403
                )
            );
        }
        next();
    };
};

// Specific role middlewares (for better readability in routes)

// export const isAdmin = isAuthorized('SuperAdmin', 'RegionalAdmin', 'SupportAdmin');
export const isAdmin = requireRole('Admin');
export const isGymOwner = requireRole('GymOwner');
export const isStaff = requireRole('Staff');
export const isTrainer = requireRole('Trainer');
export const isMember = requireRole('Member');

// Composite middlewares for common scenarios
export const isGymOwnerOrAdmin = requireRole('GymOwner', 'Admin');
export const isStaffOrAdmin = requireRole('Staff', 'Admin');
export const isVerifiedUser = requireRole('Member', 'Trainer', 'Staff', 'GymOwner', 'Admin');


// Optional: Middleware to check if user owns the gym resource
export const isGymResourceOwner = catchAsyncErrors(async (req, res, next) => {
    const gymId = req.params.id || req.body.gymId;

    if (!gymId) {
        return next(new ErrorHandler("Gym ID not provided", 400));
    }

    // Assuming you have a Gym model with owner reference
    const gym = await Gym.findById(gymId);
    if (!gym) {
        return next(new ErrorHandler("Gym not found", 404));
    }

    if (gym.owner.toString() !== req.user._id.toString()) {
        return next(new ErrorHandler("You are not the owner of this gym", 403));
    }

    next();
});

// Optional: Middleware to check if user has active plan for gym-specific actions
export const hasActivePlan = catchAsyncErrors(async (req, res, next) => {
    const gymId = req.params.gymId || req.body.gymId;
    const userId = req.user._id;

    if (!gymId) {
        return next(new ErrorHandler("Gym ID not provided", 400));
    }

    const activePlan = await UserPlan.findOne({
        userId,
        gymId,
        isExpired: false
    });

    if (!activePlan) {
        return next(new ErrorHandler("You need an active plan to perform this action", 403));
    }

    req.activePlan = activePlan; // Attach plan to request for later use
    next();
});