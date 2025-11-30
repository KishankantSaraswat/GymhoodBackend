// controllers/walletController.js
import WalletTransaction from "../models/13_walletTransactionModel.js";
import User from "../models/0_unifiedUserModel.js";
import Gym from "../models/1_gymModel.js";
import UserPlan from "../models/14_userPlanModel.js";
import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddlewares.js";
import mongoose from "mongoose";

/**
 * @description Get gym wallet balance
 * @route GET /api/wallet/gym-balance/:gymId?
 * @access Private (admin or gym owner)
 */
export const getGymWalletBalance = catchAsyncErrors(async (req, res, next) => {
  const { gymId } = req.params;
  const userId = req.user._id;

  // For admin accessing any gym, or owner accessing their own gym
  let query = {};
 

if (req.user.role === "Admin") {
  query = { _id: gymId };
} else {
  query= {_id: gymId, owner: userId};
  // query = { _id: gymId, owner: new mongoose.Types.ObjectId(userId) }; //carefull when sending in params (gymId, not userId send)

  //  {
  // _id: '684f16aeb8e5418c007d292c',
  // owner: new ObjectId('684f16aeb8e5418c007d292c')
  // }
}

  console.log(query);
 

  const gym = await Gym.findOne(query).populate("owner", "walletBalance");
  if (!gym) return next(new ErrorHandler("Gym not found", 404));

  res.status(200).json({
    success: true,
    data: {
      gymId: gym._id,
      balance: gym.owner.walletBalance,
      gymName: gym.name
    }
  });
});

/**
 * @description Admin transfers money to gym
 * @route POST /api/wallet/pay-to-gym
 * @access Private (admin only)
 */
export const payMoneyToGym = catchAsyncErrors(async (req, res, next) => {
  const { gymId, amount, adminTransferTxnId, adminNotes } = req.body;
  
  if (!gymId || !amount || !adminTransferTxnId) {
    return next(new ErrorHandler("Missing required fields", 400));
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const gym = await Gym.findById(gymId).populate("owner").session(session);
    if (!gym) {
      throw new ErrorHandler("Gym not found", 404);
    }

    // Create wallet transaction
    const transaction = await WalletTransaction.create([{
      userId: gym.owner._id,
      amount: amount,
      type: "Debit", //debit from virtual wallet && payment into realMoney..(its like gym debit from his walletA/c)
      status: "Completed",
      reason: "admin payment to gym",
      adminTransferTxnId,
      adminNotes,
      metadata: {
        gymId: gym._id
      }
    }], { session });

    // Update gym owner's wallet balance
    await User.findByIdAndUpdate(
      gym.owner._id,
      { $inc: { walletBalance: -amount } }, //mongodb not support "dec" operator
      { session }
    );

    await session.commitTransaction();
    
    res.status(200).json({
      success: true,
      data: transaction[0]
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
});


/**
 * @description Get payment history
 * @route GET /api/wallet/history
 * @access Private (admin only)
 */
export const getPaymentHistory = catchAsyncErrors(async (req, res, next) => {
  const { gymId } = req.params;
  const requesterId = req.user._id;
  const role = req.user.role;

  if (!gymId) {
    return next(new ErrorHandler("Must provide gymId", 400));
  }

  let query = {}; //not const query..as to change

  if (role === "Admin") {
  // query = { _id: gymId };
  query["metadata.gymId"] = gymId;
    query.reason = "admin payment to gym";
} else {
  // query= {_id: gymId, owner: requesterId};
  const gym = await Gym.findOne({ _id: gymId, owner: requesterId });
  if (!gym) return next(new ErrorHandler("Unauthorized to access this gym's data", 403));
      query["metadata.gymId"] = gymId;
    query.reason = "admin payment to gym";
}

  const transactions = await WalletTransaction.find(query)
    .sort({ createdAt: -1 })
    .populate("userId", "name email");

  res.status(200).json({
    success: true,
    data: transactions,
  });
});


/**
 * @description Admin issues refund to user
 * @route POST /api/wallet/refund-user
 * @access Private (admin only)
 */
export const payRefundToUser = catchAsyncErrors(async (req, res, next) => {
  const { userPlanId, amount, adminTransferTxnId, adminNotes, gymShare } = req.body;
  
  if (!userPlanId || !amount || !adminTransferTxnId) {
    return next(new ErrorHandler("Missing required fields", 400));
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const userPlan = await UserPlan.findById(userPlanId)
      .populate("userId")
      .populate("gymId")
      .session(session);
    
    if (!userPlan) {
      throw new ErrorHandler("User plan not found", 404);
    }

    // Create user refund transaction (credit to user)
    const userTransaction = await WalletTransaction.create([{
      userId: userPlan.userId._id,
      amount: amount,
      type: "Credit",
      status: "Completed",
      reason: "refund to user",
      adminTransferTxnId,
      adminNotes,
      metadata: {
        planId: userPlan.planId,
        gymId: userPlan.gymId._id,
        userPlanId: userPlan._id
      }
    }], { session });

    const gymBear=amount*gymShare;

    // Create gym debit transaction
    const gymTransaction = await WalletTransaction.create([{
      userId: userPlan.gymId.owner,
      amount: gymBear,
      type: "Debit", //debit from wallet of gymOwner...
      status: "Completed",
      reason: "refund to user",
      adminTransferTxnId,
      adminNotes,
      metadata: {
        planId: userPlan.planId,
        gymId: userPlan.gymId._id,
        userPlanId: userPlan._id,
        relatedTransaction: userTransaction[0]._id
      }
    }], { session });

    // Update user balance (+amount)
    // await User.findByIdAndUpdate(
    //   userPlan.userId._id,
    //   { $inc: { walletBalance: amount } },
    //   { session }
    // );

      // 3. Update user plan to mark as expired
    await UserPlan.findByIdAndUpdate(
      userPlan._id,
      { isExpired: true },
      { session }
    );


    
    // Update gym owner balance (-amount, can go negative)
    await User.findByIdAndUpdate(
      userPlan.gymId.owner,
      { $inc: { walletBalance: -gymBear } }, //amount: correspondingGymShare
      { session }
    );

    await session.commitTransaction();
    
    res.status(200).json({
      success: true,
      data: {
        userTransaction: userTransaction[0],
        gymTransaction: gymTransaction[0]
      }
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
});


























// import Razorpay from "razorpay";
// import ErrorHandler from "../middlewares/errorMiddlewares.js";
// import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
// import mongoose from "mongoose";

// const razorpay = new Razorpay({
//   key_id: process.env.RAZORPAY_API_KEY_ID,
//   key_secret: process.env.RAZORPAY_SECRET_KEY,
// });

// /**
//  * @description Create a linked Razorpay account for a gym owner
//  * @route POST /api/razorpay/create-account
//  * @access Private (Gym Owner)
//  */
// export const createLinkedAccount1 = catchAsyncErrors(async (req, res, next) => {
//   const { email, phone, businessName, contactName } = req.body;
//   const userId = req.user._id;

//   if (!email || !phone || !businessName || !contactName) {
//     return next(new ErrorHandler("Missing required fields", 400));
//   }

//   try {
//     const response = await razorpay.accounts.create({
//       email,
//       phone,
//       legal_business_name: businessName,
//       business_type: "individual",
//       customer_facing_business_name: businessName,
//       contact_name: contactName
//     });

//     // Here you would typically save the account_id to your database
//     // await GymOwnerModel.findByIdAndUpdate(userId, { razorpayAccountId: response.id });

//     res.status(201).json({
//       success: true,
//       data: {
//         accountId: response.id
//       }
//     });
//   } catch (error) {
//     return next(new ErrorHandler(`Razorpay account creation failed: ${error.message}`, 500));
//   }
// });

// export const createLinkedAccount = catchAsyncErrors(async (req, res, next) => {
//   const { email, phone, businessName, contactName } = req.body;
//   const userId = req.user._id;

//   if (!email || !phone || !businessName || !contactName) {
//     return next(new ErrorHandler("Missing required fields", 400));
//   }

//   try {
//     // Validate Razorpay configuration first
//     if (!razorpay || !process.env.RAZORPAY_API_KEY_ID || !process.env.RAZORPAY_SECRET_KEY) {
//       throw new Error("Razorpay configuration incomplete");
//     }

//     const accountData = {
//       email,
//       phone,
//       legal_business_name: businessName,
//       business_type: "individual",
//       customer_facing_business_name: businessName,
//       contact_name: contactName
//     };

//     console.log("Creating Razorpay account with data:", accountData); // Debug log

//     //id & key, is inside razorpay->instance itself..as created with that help...
//     const response = await razorpay.accounts.create(accountData);

//     if (!response || !response.id) {
//       throw new Error("Invalid response from Razorpay API");
//     }

//     res.status(201).json({
//       success: true,
//       data: {
//         accountId: response.id
//       }
//     });

//   } catch (error) {
//     console.error("Razorpay Error:", error);
    
//     // Check for specific Razorpay error structure
//     const errorMessage = error.error?.description || 
//                         error.error?.message || 
//                         error.message || 
//                         "Unknown Razorpay error";
    
//     return next(new ErrorHandler(`Razorpay account creation failed: ${errorMessage}`, 500));
//   }
// });


// /**
//  * @description Add stakeholder for KYC verification
//  * @route POST /api/razorpay/add-stakeholder
//  * @access Private (Gym Owner)
//  */
// export const addStakeholder = catchAsyncErrors(async (req, res, next) => {
//   const { accountId, stakeholderDetails } = req.body;
//   const userId = req.user._id;

//   if (!accountId || !stakeholderDetails) {
//     return next(new ErrorHandler("Account ID and stakeholder details are required", 400));
//   }

//   try {
//     const response = await razorpay.accounts.createStakeholder(accountId, {
//       name: stakeholderDetails.name,
//       email: stakeholderDetails.email,
//       phone: stakeholderDetails.phone,
//       relationship: stakeholderDetails.relationship,
//       addresses: stakeholderDetails.addresses,
//       kyc: stakeholderDetails.kyc
//     });

//     res.status(201).json({
//       success: true,
//       data: {
//         stakeholderId: response.id
//       }
//     });
//   } catch (error) {
//     return next(new ErrorHandler(`Stakeholder creation failed: ${error.message}`, 500));
//   }
// });

// /**
//  * @description Request Route product configuration
//  * @route POST /api/razorpay/request-config
//  * @access Private (Gym Owner)
//  */
// export const requestProductConfig = catchAsyncErrors(async (req, res, next) => {
//   const { accountId } = req.body;
//   const userId = req.user._id;

//   if (!accountId) {
//     return next(new ErrorHandler("Account ID is required", 400));
//   }

//   try {
//     const response = await razorpay.accounts.requestProductConfiguration(accountId, {
//       product: "route"
//     });

//     res.status(200).json({
//       success: true,
//       data: response
//     });
//   } catch (error) {
//     return next(new ErrorHandler(`Product configuration request failed: ${error.message}`, 500));
//   }
// });

// /**
//  * @description Update Route configuration with bank account details
//  * @route POST /api/razorpay/update-config
//  * @access Private (Gym Owner)
//  */
// export const updateProductConfig = catchAsyncErrors(async (req, res, next) => {
//   const { accountId, bankDetails } = req.body;
//   const userId = req.user._id;

//   if (!accountId || !bankDetails) {
//     return next(new ErrorHandler("Account ID and bank details are required", 400));
//   }

//   const session = await mongoose.startSession();
  
//   try {
//     session.startTransaction();

//     // Verify bank details in your system first
//     // const gymOwner = await GymOwnerModel.findById(userId).session(session);
//     // if (!gymOwner) {
//     //   throw new ErrorHandler("Gym owner not found", 404);
//     // }

//     const response = await razorpay.accounts.updateProductConfiguration(
//       accountId, 
//       "route", 
//       {
//         account_number: bankDetails.accountNumber,
//         ifsc_code: bankDetails.ifscCode,
//         beneficiary_name: bankDetails.beneficiaryName
//       }
//     );

//     // Update your database with the configuration
//     // gymOwner.razorpayRouteConfigured = true;
//     // await gymOwner.save({ session });

//     await session.commitTransaction();

//     res.status(200).json({
//       success: true,
//       data: response
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     return next(new ErrorHandler(`Product configuration update failed: ${error.message}`, 500));
//   } finally {
//     session.endSession();
//   }
// });

// /**
//  * @description Transfer funds to linked account
//  * @route POST /api/razorpay/transfer
//  * @access Private (Admin)
//  */
// export const transferToLinkedAccount = catchAsyncErrors(async (req, res, next) => {
//   const { accountId, amount, purpose } = req.body;

//   if (!accountId || !amount || !purpose) {
//     return next(new ErrorHandler("Account ID, amount and purpose are required", 400));
//   }

//   if (amount < 1000) { // Minimum ₹10 (1000 paise)
//     return next(new ErrorHandler("Minimum transfer amount is ₹10", 400));
//   }

//   const session = await mongoose.startSession();
  
//   try {
//     session.startTransaction();

//     // Verify and record the transfer in your system first
//     // const paymentRecord = await PaymentModel.create([{
//     //   userId: req.user._id,
//     //   accountId,
//     //   amount,
//     //   status: 'initiated'
//     // }], { session });

//     const response = await razorpay.transfers.create({
//       account: accountId,
//       amount: amount * 100, // Convert rupees to paise
//       currency: "INR",
//       notes: { purpose }
//     });

//     // Update payment record with transfer details
//     // paymentRecord.status = 'completed';
//     // paymentRecord.transferId = response.id;
//     // await paymentRecord.save({ session });

//     await session.commitTransaction();

//     res.status(201).json({
//       success: true,
//       data: response
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     return next(new ErrorHandler(`Fund transfer failed: ${error.message}`, 500));
//   } finally {
//     session.endSession();
//   }
// });