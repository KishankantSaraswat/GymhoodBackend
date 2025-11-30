// import BlacklistToken from "../models/blacklistToken.model.js";
import User from "../models/0_unifiedUserModel.js";
import { catchAsyncErrors } from "./catchAsyncErrors.js";
import ErrorHandler from "./errorMiddlewares.js"
import jwt from "jsonwebtoken";

export const isAuthenticated=catchAsyncErrors(async(req,res,next)=>{
    const {token}=req.cookies; 
    if(!token) return next(new ErrorHandler("User is not authenticated.",400));
    const decoded=jwt.verify(token,process.env.JWT_SECRET_KEY);
    req.user=await User.findById(decoded.id); 
    // console.log(req.user);
    next(); 
}) 

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