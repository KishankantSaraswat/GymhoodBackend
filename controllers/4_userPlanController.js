import UserPlan from "../models/14_userPlanModel.js";
import WalletTransaction from "../models/13_walletTransactionModel.js";
import ErrorHandler from "../middlewares/errorMiddlewares.js";
import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import { GymPlanRevenue } from "../models/4_gymPlanRevenueModel.js";
import UserGymLog from "../models/6_userGymLogModel.js";
import User from "../models/0_unifiedUserModel.js";
import Plan from "../models/3_planModel.js";
import mongoose from "mongoose";
import { createRazorpayInstance } from "../config/razorpay.config.js";
import Gym from "../models/1_gymModel.js";
import crypto from "crypto";
import { sendEmail } from "../utils/sendEmail.js"; // Adjust path as needed


// Lazy initialization of Razorpay instance
let razorpayInstance = null;
const getRazorpay = () => {
  if (!razorpayInstance) {
    razorpayInstance = createRazorpayInstance();
  }
  return razorpayInstance;
};
// import Contact from "../models/1_contactModel.js"
// import axios from 'axios';


export const purchasePlan = catchAsyncErrors(async (req, res, next) => {
  const { planId } = req.body;
  const userId = req.user._id;

  // Get plan and gym details
  const plan = await Plan.findById(planId).populate('gymId'); //careful if populated plan with gym, then plan.gymId._id for fetch id***
  if (!plan || !plan.isActive) return next(new ErrorHandler("Plan not found or inactive", 404));

  if (!plan.gymId || !plan.gymId.isVerified) {
    return next(new ErrorHandler("Associated gym is not verified", 403));
  }

  // Calculate discounted price
  const discountedPrice = Math.round(plan.price * (1 - plan.discountPercent / 100));
  const gym = await Gym.findById(plan.gymId);
  if (!gym) return next(new ErrorHandler("Gym not found", 404));

  // Create shorter receipt ID (max 40 chars)
  const receiptId = `plan_${planId.toString().substring(18, 24)}_${Date.now().toString().substring(6)}`;
  // Example: "plan_507f1_345678"

  //   const receiptId = `plan_${require('crypto').randomBytes(8).toString('hex')}`;
  // // Example: "plan_1a2b3c4d5e"

  // Start MongoDB session
  const session = await mongoose.startSession();

  try {
    //start & commit transaction in tryBlock
    session.startTransaction();

    // 1. Create Razorpay order
    const orderOptions = {
      amount: discountedPrice * 100,
      currency: "INR",
      receipt: receiptId,
      notes: {
        userId: userId.toString(),
        planId: planId.toString(),
        // gymId: plan.gymId.toString() // ONLY store the ID string
        gymId: plan.gymId._id.toString() // Explicitly use _id.toString() && all because while fetching plan..i populated it with gymId
      }
    };
    const order = await getRazorpay().orders.create(orderOptions);
    // console.log( order);
    // console.log("Api key:   ", process.env.RAZORPAY_API_KEY_ID);


    // 2. Create initial wallet transaction record
    // Create wallet transaction PROPERLY with session (Array->demand)
    const walletTransaction = await WalletTransaction.create([{
      userId: userId,
      amount: discountedPrice,
      type: 'Debit',
      status: 'Pending',
      razorpayOrderId: order.id,
      reason: `Purchase of ${plan.name} plan`,
      metadata: {
        planId: plan._id,
        gymId: plan.gymId._id //gymId._id?? as populated 
      }
    }], { session });

    // console.log( order,process.env.RAZORPAY_API_KEY_ID)
    // console.log("walletTransactionId of array: ", walletTransaction[0]._id);
    await session.commitTransaction();

    //when list of walletTransaction..
    //     const [walletTransaction] = await WalletTransaction.create([{
    //   // your data
    // }], { session });


    // 3. Return order details to frontend for payment processing
    res.status(200).json({
      success: true,
      order,
      key: process.env.RAZORPAY_KEY_ID,
      walletTransactionId: walletTransaction[0]._id
    });

    // Note: Frontend will now handle the payment and call verifyPlanPayment
  } catch (error) {
    await session.abortTransaction();
    console.error("Plan purchase initiation error:", error);
    return next(new ErrorHandler("Failed to initiate plan purchase", 500));
  } finally {
    session.endSession();
  }
});

export const verifyPlanPayment = catchAsyncErrors(async (req, res, next) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, walletTransactionId } = req.body;
  const userId = req.user._id;

  // Signature Verification
  const generatedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest("hex");

  if (generatedSignature !== razorpay_signature) {
    console.error('[VerifyPayment] Signature verification failed', {
      received: razorpay_signature,
      generated: generatedSignature
    });
    return next(new ErrorHandler("Payment verification failed - Invalid signature", 400));
  }

  const session = await mongoose.startSession();
  // session.startTransaction();

  let walletTransaction;

  try {
    session.startTransaction();
    console.log('[VerifyPayment] Transaction started');

    // 1. Find and validate wallet transaction
    walletTransaction = await WalletTransaction.findOne({
      _id: walletTransactionId,
      userId,
      razorpayOrderId: razorpay_order_id,
      status: 'Pending'
    }).session(session);

    if (!walletTransaction) {
      console.error('[VerifyPayment] Transaction not found or already processed', {
        walletTransactionId
      });
      return next(new ErrorHandler("Transaction not found or already processed", 404));
    }

    // 2. Fetch payment details from Razorpay
    const payment = await getRazorpay().payments.fetch(razorpay_payment_id);
    console.log('[VerifyPayment] Razorpay payment details', {
      paymentStatus: payment.status,
      amount: payment.amount,
      currency: payment.currency
    });

    // 3. Get plan and gym details with robust error handling
    const order = await getRazorpay().orders.fetch(razorpay_order_id);
    const orderNotes = order.notes;

    // console.log("0");

    let gymId;
    try {
      // Handle all possible cases of gymId storage
      if (typeof orderNotes.gymId === 'string') {
        gymId = orderNotes.gymId;
      }

      else {
        throw new Error('Invalid gymId format');
      }

      // Validate it's a proper ObjectId
      if (!mongoose.Types.ObjectId.isValid(gymId)) {
        throw new Error('Invalid gymId format');
      }
    } catch (parseError) {
      console.error('[VerifyPayment] GymId parsing failed', {
        originalGymId: orderNotes.gymId,
        error: parseError.message
      });
      await session.abortTransaction();
      return next(new ErrorHandler("Invalid gym data format", 400));
    }

    const plan = await Plan.findById(orderNotes.planId).session(session);
    const gym = await Gym.findById(gymId).session(session); // Use parsed gymId

    if (!plan || !gym) {
      throw new ErrorHandler("Plan or Gym not found", 404);
    }



    // 4. Calculate revenue split
    //[Changelog 26/07/2025] Changed gym cut to 90%
    const gymPercentage = 90;
    const gymShare = Math.round(walletTransaction.amount * gymPercentage / 100);
    const platformShare = walletTransaction.amount - gymShare;

    console.log('[VerifyPayment] Revenue split calculated', {
      gymPercentage,
      gymShare,
      platformShare
    });

    // 5. Update wallet transaction
    walletTransaction.status = 'Completed';
    walletTransaction.razorpayPaymentId = razorpay_payment_id;
    walletTransaction.metadata = {
      planId: plan._id,
      gymId: gym._id,
      // gymShare,//not need for user to know this details on his transaction
      // platformShare
    };
    await walletTransaction.save({ session });

    console.log('[VerifyPayment] Wallet transaction updated', {
      transactionId: walletTransaction._id //need [0]?? as, above in status also not required.. (as find from model, it not list like created in transaction)
    });

    let factor = 1;
    let totalDays = 0;
    if (plan.planType.trim() === "1 day") {
      factor = 7;
      totalDays = 1;
    } else if (plan.planType.trim() === "7 days") {
      factor = 30;
      totalDays = 7;
    }
    else if (plan.planType.trim() === "15 days") {
      factor = 45;
      totalDays = 15;
    }
    else if (plan.planType.trim() === "1 month") {
      factor = 90;
      totalDays = 30;
    }

    // 6. Create user plan
    const userPlan = await UserPlan.create([{
      userId,
      gymId: plan.gymId,
      planId: plan._id,
      amountDeducted: walletTransaction.amount,
      totalDays: totalDays,
      purchaseDate: new Date(),
      maxExpiryDate: new Date(Date.now() + factor * 24 * 60 * 60 * 1000),
      perDayCost: walletTransaction.amount / plan.validity,
      planDuration: plan.duration,
      paymentId: razorpay_payment_id,
      paymentMetadata: {
        razorpayOrderId: razorpay_order_id,
        transactionId: walletTransaction._id
      }
    }], { session });

    console.log('[VerifyPayment] User plan created', {
      userPlanId: userPlan[0]._id
    });
    const user = await User.findById(userId).select("name email");

    const emailContent = `
  <h2>Hi ${user.name || "User"},</h2>
  <p>Thank you for purchasing the <strong>${plan.name}</strong> plan from <strong>${gym.name}</strong>.</p>
  <p>Here are your plan details:</p>
  <ul>
    <li><strong>Plan Name:</strong> ${plan.name}</li>
    <li><strong>Amount Paid:</strong> ₹${walletTransaction.amount}</li>
    <li><strong>Duration:</strong> ${plan.planType} (${plan.duration} hours)</li>
    <li><strong>Purchase Date:</strong> ${new Date().toLocaleDateString()}</li>
  </ul>
  <p>You can now start visiting your gym using this plan!</p>
  <p>Stay fit,<br/>Team GymsHood</p>
`;

    // Send the email
    await sendEmail({
      to: user.email,
      subject: "🎉 Plan Purchase Confirmation - GymsHood",
      message: emailContent
    });

    console.log('[VerifyPayment] Purchase confirmation email sent');
    // 7. Update gym revenue
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await GymPlanRevenue.findOneAndUpdate(
      {
        planId: plan._id,
        gymId: plan.gymId,
        date: today
      },
      { $inc: { revenue: gymShare } }, //with gymShare
      { upsert: true, session }
    );

    console.log('[VerifyPayment] Gym revenue updated');

    // 8. Create credit transaction for gym owner
    const gymTransaction = await WalletTransaction.create([{
      userId: gym.owner,
      amount: gymShare,
      type: 'Credit',
      status: 'Completed',
      reason: `Revenue share for ${plan.name} plan purchase`,
      metadata: {
        userPlanId: userPlan[0]._id,
        originalTransaction: walletTransaction._id,
        planId: plan._id,
        gymId: gym._id
      }
    }], { session });

    await User.findByIdAndUpdate(
      gym.owner,
      { $inc: { walletBalance: gymShare } },
      { session }
    );

    console.log('[VerifyPayment] Gym owner transaction created', {
      gymTransactionId: gymTransaction[0]._id
    });

    await session.commitTransaction();
    console.log('[VerifyPayment] Transaction committed successfully');

    res.status(200).json({
      success: true,
      message: "Plan purchased successfully",
      userPlan: userPlan[0], // Return first element of created array
      paymentDetails: {
        totalAmount: walletTransaction.amount,// Since we used findOne() not create()
        // gymShare,
        // platformShare
      }
    });

  } catch (error) {
    await session.abortTransaction();

    console.error('[VerifyPayment] Transaction failed', {
      error: error.message,
      stack: error.stack
    });

    // Attempt refund if payment was captured
    if (razorpay_payment_id && walletTransaction) {
      try {
        const refund = await getRazorpay().payments.refund(razorpay_payment_id, {
          amount: walletTransaction.amount * 100,
          speed: 'normal',
          notes: {
            reason: 'Automatic refund due to processing failure'
          }
        });
        console.warn('[VerifyPayment] Automatic refund initiated', {
          refundId: refund.id,
          amount: walletTransaction.amount
        });
      } catch (refundError) {
        console.error('[VerifyPayment] Refund failed', {
          error: refundError.message,
          paymentId: razorpay_payment_id
        });
      }
    }

    // Update transaction status
    if (walletTransactionId) {
      await WalletTransaction.findByIdAndUpdate(walletTransactionId, {
        status: 'Failed',
        error: error.message
      });
    }


    return next(new ErrorHandler("Plan purchase processing failed: " + error.message, 500));
  } finally {
    session.endSession();
  }
});

// Additional helper function for refund handling (need of maintaining walletBalance by gymOwner)
export const processRefund = catchAsyncErrors(async (req, res, next) => {
  const { userPlanId, reason } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userPlan = await UserPlan.findById(userPlanId).session(session);
    if (!userPlan) return next(new ErrorHandler("Plan not found", 404));

    // 1. Find original payment transaction
    const originalTx = await WalletTransaction.findOne({
      'metadata.userPlanId': userPlanId,
      type: 'Debit'
    }).session(session);

    if (!originalTx) return next(new ErrorHandler("Original transaction not found", 404));

    // 2. Find gym's credit transaction
    const gymTx = await WalletTransaction.findOne({
      'metadata.originalTransaction': originalTx._id,
      type: 'Credit'
    }).session(session);

    // 3. Calculate refund amount (pro-rated if partial refund)
    const daysUsed = Math.floor((new Date() - userPlan.purchaseDate) / (1000 * 60 * 60 * 24));
    const refundAmount = Math.max(0, userPlan.amountDeducted - (daysUsed * userPlan.perDayCost));

    // 4. Deduct from gym's balance if they received share
    if (gymTx) {
      const gymUser = await User.findById(gymTx.userId).session(session);
      if (gymUser.walletBalance < gymTx.amount) {
        // Handle case where gym doesn't have enough balance
        // Could implement overdraft or other logic here
      }
      gymUser.walletBalance -= Math.min(gymTx.amount, refundAmount);
      await gymUser.save({ session });
    }

    // 5. Process refund to customer
    const refund = await getRazorpay().payments.refund(originalTx.razorpayPaymentId, {
      amount: refundAmount * 100,
      notes: { reason } //provided from frontend
    });

    // 6. Update all records
    await WalletTransaction.create([{
      userId: userPlan.userId,
      amount: refundAmount,
      type: 'Credit',
      status: 'Completed',
      reason: `Refund for ${userPlanId}: ${reason}`,
      razorpayRefundId: refund.id,
      metadata: {
        originalTransaction: originalTx._id,
        refundReason: reason
      }
    }], { session });

    // 7. Update user plan status
    userPlan.status = 'Refunded';
    userPlan.refundAmount = refundAmount;
    await userPlan.save({ session });

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: "Refund processed successfully",
      refundAmount
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Refund processing error:", error);
    return next(new ErrorHandler("Refund processing failed", 500));
  } finally {
    session.endSession();
  }
});

export const getUserPlans = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user._id;

  // Auto-update expiry status before fetching
  await updateUserPlanExpiryStatus(userId);

  const plans = await UserPlan.find({ userId })
    .sort({ isExpired: 1, purchaseDate: -1 });
  // .populate('planId', 'name validity price');

  res.status(200).json({ success: true, plans });
});

export const getPurchasedPlans = catchAsyncErrors(async (req, res, next) => {
  const ownerId = req.user._id;

  // Find the gym owned by this user
  const gym = await Gym.findOne({ owner: ownerId });
  if (!gym) {
    return res.status(404).json({ success: false, message: "Gym not found for this owner" });
  }

  // Find all active (not expired) user plans for this gym
  const activePlans = await UserPlan.find({ gymId: gym._id, isExpired: false })
    .sort({ purchaseDate: -1 })
    .populate('userId', 'name email'); // optional, populate user info

  res.status(200).json({ success: true, plans: activePlans });
});


const updateUserPlanExpiryStatus = catchAsyncErrors(async (userId) => {
  const today = new Date();

  await UserPlan.updateMany(
    {
      userId,
      isExpired: false,
      $or: [
        { $expr: { $gte: ['$usedDays', '$totalDays'] } },
        { maxExpiryDate: { $lte: today } }
      ]
    },
    { $set: { isExpired: true } }
  );
});

export const getPlanUsage = catchAsyncErrors(async (req, res, next) => {
  const { planId } = req.params;
  // const { userId } = req.user;

  const userId = req.user._id;

  const plan = await UserPlan.findOne({ _id: planId, userId });
  if (!plan) {
    return next(new ErrorHandler("Plan not found", 404));
  }

  const daysUsed = Math.floor((new Date() - plan.purchaseDate) / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.max(0, plan.totalDays - daysUsed);

  res.status(200).json({
    success: true,
    daysUsed,
    daysRemaining,
    isExpired: daysRemaining <= 0
  });
});

export const getWalletTransactions = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user._id;

  // Optional: Validate userId (should be valid ObjectId)
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return next(new ErrorHandler("Invalid user ID", 400));
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Find all wallet transactions for this user
    const transactions = await WalletTransaction.find({ userId }).sort({ createdAt: -1 }).session(session);

    // Optional: Check if empty
    if (!transactions || transactions.length === 0) {
      throw new ErrorHandler("No wallet transactions found for this user", 404);
    }

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      count: transactions.length,
      data: transactions,
    });

  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
});