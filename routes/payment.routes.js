// routes/walletRoutes.js
import express from "express";
import { 
  getGymWalletBalance,
  payMoneyToGym,
  getPaymentHistory,
  payRefundToUser
} from "../controllers/walletController.js";
import { isAuthenticated, isAdmin, isGymOwnerOrAdmin } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Gym wallet balance
router.get("/gym-balance/:gymId?", 
  isAuthenticated, 
  isGymOwnerOrAdmin, 
  getGymWalletBalance
);

// Admin operations
router.post("/pay-to-gym",
  isAuthenticated,
  isAdmin,
  payMoneyToGym
);

router.get("/history/:gymId?",
  isAuthenticated,
  isGymOwnerOrAdmin,
  getPaymentHistory
);

router.post("/refund-user",
  isAuthenticated,
  isAdmin,
  payRefundToUser
);

export default router;



