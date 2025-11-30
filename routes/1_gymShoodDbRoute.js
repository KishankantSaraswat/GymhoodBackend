import express from "express";
import {
  registerGym,
  addUpdateGymMedia,
  getGymDetails,
  updateGym,
  // deleteGym,
  getAllGyms,
  // updateEquipment,
  getGymsByOwner,

  
  createGymAnnouncement,
  getUserAnnouncementsByGym,
  deleteGymAnnouncement,
  toggleGymStatus,
  addUpdateVerificationDocuments,
  

  // createContactAndFundAccount,
  // submitGymOwnerKYC,
  // recreateContactAndFundAccount
} from "../controllers/1_gymReg.js";
// import { uploadKycDocs } from '../middlewares/kycUpload.js';


import {
  createPlan,
  getGymPlans,
  updatePlan,  
  getPlanNameById,
  getGymPlansAdminView,
} from "../controllers/3_planMang.js";


import {
  purchasePlan,
  verifyPlanPayment,
  getWalletTransactions,
  getUserPlans,
  getPurchasedPlans,
  // cancelPlan,
  getPlanUsage,
} from "../controllers/4_userPlanController.js";


import {
  qrCheckIn,
  qrCheckOut,
  getGymRegisterByDate,
  getActiveUsers,
  cleanExpiredUsers,
  getYearlyGymHeatmap,
  streak,
} from "../controllers/4_userGymEntry.js";



import {
  addRating,
  getGymRatings,
  updateRating,
  deleteRating,
  // likeRating
} from "../controllers/5_ratingController.js";

import {
  getGymDashboardStats,
  getRevenueAnalytics,
  getMemberAnalytics
} from "../controllers/6_dashboardController.js";


import { isAuthenticated, isGymOwner, isAdmin } from "../middlewares/authMiddleware.js";
import { body, validationResult } from "express-validator";
import ErrorHandler from "../middlewares/errorMiddlewares.js";
// import { validatePayment } from "../middlewares/paymentMiddleware.js";
// import upload from '../middlewares/upload.js'; // your multer config

const router = express.Router();

// Validation middleware
const validateGymRegistration = [
  body('name').notEmpty().withMessage('Gym name is required'),
  body('location').notEmpty().withMessage('Location is required'),
  body('capacity').isInt({ min: 1 }).withMessage('Capacity must be at least 1'),
  body('openTime').notEmpty().withMessage('Opening time is required'),
  body('closeTime').notEmpty().withMessage('Closing time is required'),
  body('contactEmail').isEmail().withMessage('Invalid email format'),
  body('phone').notEmpty().withMessage('Phone number is required'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(err => err.msg).join(', ');
      return next(new ErrorHandler(`Validation error: ${errorMessages}`, 400));
    }
    next();
  }
];

const validatePlanCreation = [
  body('name').notEmpty().withMessage('Plan name is required'),
  body('validity').isInt({ min: 1 }).withMessage('Validity must be at least 1 day'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('discountPercent').isFloat({ min: 0, max: 100 }).withMessage('Discount must be between 0-100'),
  // body('planType').isIn(['day', 'monthly', 'yearly']).withMessage('Invalid plan type'),
body('duration')
  .isFloat({ gt: 0 }) // Allows numbers > 0, including decimals like 1.5
  .withMessage('Workout duration must be a number greater than 0'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(err => err.msg).join(', ');
      return next(new ErrorHandler(`Validation error: ${errorMessages}`, 400));
    }
    next();
  }
];

//:id-->gymID, planID,..

// Gym Registration & Management Routes
router.post("/gym/register", isAuthenticated, isGymOwner, validateGymRegistration, registerGym);
// router.delete("/gyms/:id",isAuthenticated,isGymOwner,deleteGym); //by adminOnly (not gymOwner)
router.get('/me', isAuthenticated, (req, res) => { //also profileRoute in auth..
  res.status(200).json({
      success: true,
      userId: req.user._id, 
  });
});
router.get("/gyms", getAllGyms); 
router.get("/gym/:id", getGymDetails);
router.put("/gym/:id", isAuthenticated, isGymOwner, updateGym); //will handel updateEquipment also
router.post("/gym/:gymId/media", isAuthenticated, isGymOwner, addUpdateGymMedia); //also updateGymMedia
router.get("/gym/owner/:ownerId", isAuthenticated, isGymOwner, getGymsByOwner); 
// Gym Management
router.put("/gyms/status", isAuthenticated, isGymOwner, toggleGymStatus);
router.put("/gyms/verification", 
  isAuthenticated, 
  isGymOwner,
  addUpdateVerificationDocuments
);

// Announcement Management
router.post("/gyms/announcements",
  isAuthenticated,
  isGymOwner,
  // validateGymAnnouncement,
  createGymAnnouncement
);

router.get("/announcements/gym", isAuthenticated, getUserAnnouncementsByGym);
router.delete("/announcements/gym/:announcementId", 
  isAuthenticated, 
  isGymOwner,
  deleteGymAnnouncement
);

// Plans Management Routes (gymId not require also, as gymOwner can create only 1 gym)
router.post("/:gymId/plans", isAuthenticated, isGymOwner, validatePlanCreation, createPlan); //plans/:gymId (not extendable && feels gym belong to a plan)
router.get("/plans/gym/:gymId", getGymPlans);  //as plans of user also: route should be clear
router.put("/plans/:planId", isAuthenticated, isGymOwner, updatePlan);
// router.get("/plans/gym/adminView/:gymId",isAuthenticated,getGymPlansAdminView); //nonActive Plan(gymOwner)-->need to update, or otherGymsNonactivePlan(admin)
router.get("/name/:id", getPlanNameById); // Route to get plan name by ID


router.post("/plans/purchase", isAuthenticated, purchasePlan); //validatePayment, purchasePlan
router.post("/plans/verifyPlanPayment",isAuthenticated,verifyPlanPayment); //no isAuth required..
router.get("/plans/user", isAuthenticated, getUserPlans);
router.get("/userPlans/gym",isAuthenticated, getPurchasedPlans);
router.get("/api/transactions",isAuthenticated, getWalletTransactions);
// router.patch("/plans/:id/cancel", isAuthenticated, cancelPlan); //only for basicPlan (1day)
router.get("/plans/usage/:planId", isAuthenticated, getPlanUsage); //userPlanId (as multiple_samePlan buy allowed)


// Ratings & Reviews Routes
router.post("/ratings", isAuthenticated, addRating);
router.get("/ratings/gym/:gymId", getGymRatings);
router.put("/ratings/:id", isAuthenticated, updateRating);
router.delete("/ratings/:id", isAuthenticated, deleteRating);
// router.post("/ratings/:id/like", isAuthenticated, likeRating); //like dislike bboth, include('like')??


// User Gym Entry Routes
router.post("/gym/check-in", isAuthenticated, qrCheckIn); // 1. QR Check-In (User)
router.post("/gym/check-out", isAuthenticated, qrCheckOut); // 2. QR Check-Out (User)
router.get("/userStreak", isAuthenticated, streak); // 3. Streak Calculation (User)
// 4. Daily Earnings Auto-Update (No Route Needed)
// Cron controller hits 3x/day, internally updates GymOwner WalletBalance
router.get("/user/yearly-data", isAuthenticated, getYearlyGymHeatmap); // 5. User Dashboard: Get Yearly Gym Data
////add condition: gymBelongs to gymOwner..
router.get("/gym/:gymId/today-register", isAuthenticated, isGymOwner, getGymRegisterByDate); // 6. Gym Dashboard: Get Today’s Check-in Register
router.get("/gym/:gymId/active-users", isAuthenticated, isGymOwner, getActiveUsers); // 7. Gym Dashboard: Get Active + Expired Users (un-checked-out)
router.put("/gym/:gymId/clean-expired-users", isAuthenticated, isGymOwner, cleanExpiredUsers); // 8. Gym Dashboard: Clean Expired Users (checkOutTimeCalc < now)


// Gym Dashboard Routes
router.get("/dashboard/stats/:gymId", isAuthenticated, isGymOwner, getGymDashboardStats);
router.get("/dashboard/revenue/:gymId", isAuthenticated, isGymOwner, getRevenueAnalytics);
router.get("/dashboard/members/:gymId", isAuthenticated, isGymOwner, getMemberAnalytics);

export default router;






