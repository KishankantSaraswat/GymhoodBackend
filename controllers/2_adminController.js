import mongoose from 'mongoose';
import fs from 'fs';
import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddlewares.js";
import Gym from '../models/1_gymModel.js';
import VerificationDocument from '../models/1_verificationDoc.js';
import { Announcement } from '../models/23_announcemenetModel.js';
import Plan from '../models/3_planModel.js';
import User from '../models/0_unifiedUserModel.js'
import { GymPlanRevenue } from '../models/4_gymPlanRevenueModel.js';
import UserPlan from '../models/14_userPlanModel.js';

//if verified (then not deleted), if deleted (then not verified), (not verified==>(deleted, not deleted))
// catchAsyncError User (VVI) while writing controllers

//check if isDeleted?? (if changes to isVerified:true, then isDeleted:false (set))
export const toggleGymVerification = catchAsyncErrors(async (req, res, next) => {
  const gym = await Gym.findById(req.params.gymId);
  if (!gym) return next(new ErrorHandler("Gym not found", 404));
  gym.isVerified = !gym.isVerified;
  if (gym.isVerified) gym.isDeleted = false;
  await gym.save();
  res.json({ success: true, isVerified: gym.isVerified, isDeleted: gym.isDeleted, });
});
//if changes to (isDeleted: true==>isVerified:false set)
export const toggleGymDeletion = catchAsyncErrors(async (req, res, next) => {
  const gym = await Gym.findById(req.params.gymId);

  if (!gym) return next(new ErrorHandler("Gym not found", 404));
  gym.isDeleted = !gym.isDeleted;
  if (gym.isDeleted) gym.isVerified = false;
  await gym.save();
  res.json({ success: true, isDeleted: gym.isDeleted, isVerified: gym.isVerified, });
});

//if once deleted, admin can't see gym to make it toogle (so avoid deleteGym, as nonReversible like realDelete)
//if once deleted, admin can't see gym to make it toogle (so avoid deleteGym, as nonReversible like realDelete)
//if once deleted, admin can't see gym to make it toogle (so avoid deleteGym, as nonReversible like realDelete)
export const getUnverifiedGyms = catchAsyncErrors(async (req, res, next) => {
  const gyms = await Gym.find({ isVerified: false, isDeleted: false })
    .populate('media')
    .populate('verificationDocuments')
    .populate('owner', 'name email phone walletBalance');

  res.json({ success: true, gyms });
});

export const getAllGymsForAdmin = catchAsyncErrors(async (req, res, next) => {
  const gyms = await Gym.find({ isDeleted: false })
    .sort({ createdAt: -1 })
    .populate('media')
    .populate('verificationDocuments')
    .populate('owner', 'name email phone walletBalance');

  const now = new Date();
  const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const startOf3MonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const startOf6MonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const revenueBreakdown = await GymPlanRevenue.aggregate([
    {
      $project: {
        gymIdStr: { $toString: "$gymId" },
        revenue: 1,
        date: 1
      }
    },
    {
      $group: {
        _id: "$gymIdStr",
        totalRevenue: { $sum: "$revenue" },
        currentMonth: {
          $sum: { $cond: [{ $gte: ["$date", startOfCurrentMonth] }, "$revenue", 0] }
        },
        lastMonth: {
          $sum: {
            $cond: [
              { $and: [{ $gte: ["$date", startOfLastMonth] }, { $lt: ["$date", startOfCurrentMonth] }] },
              "$revenue",
              0
            ]
          }
        },
        last3Months: {
          $sum: { $cond: [{ $gte: ["$date", startOf3MonthsAgo] }, "$revenue", 0] }
        },
        last6Months: {
          $sum: { $cond: [{ $gte: ["$date", startOf6MonthsAgo] }, "$revenue", 0] }
        }
      }
    }
  ]);

  const revenueMap = revenueBreakdown.reduce((acc, curr) => {
    if (curr._id) {
      acc[curr._id] = curr;
    }
    return acc;
  }, {});

  const gymsWithRevenue = gyms.map(gym => {
    const rev = revenueMap[gym._id.toString()] || {
      totalRevenue: 0,
      currentMonth: 0,
      lastMonth: 0,
      last3Months: 0,
      last6Months: 0
    };

    return {
      ...gym.toObject(),
      revenueBreakdown: rev,
      walletBalance: gym.owner?.walletBalance || 0
    };
  });

  res.json({ success: true, gyms: gymsWithRevenue });
});

export const getGymDetailsAdmin = catchAsyncErrors(async (req, res, next) => {
  const { gymId } = req.params;

  const gym = await Gym.findById(gymId)
    .populate('media')
    .populate('verificationDocuments')
    .populate('owner', 'name email phone walletBalance role');

  if (!gym) return next(new ErrorHandler("Gym not found", 404));

  const plans = await Plan.find({ gymId });

  const totalRevenueAggregation = await GymPlanRevenue.aggregate([
    { $match: { gymId: gym._id } },
    { $group: { _id: null, total: { $sum: "$revenue" } } }
  ]);

  const totalRevenue = totalRevenueAggregation.length > 0 ? totalRevenueAggregation[0].total : 0;

  // New stats for user counts and plan breakdown
  const activeUsersCount = await UserPlan.countDocuments({ gymId, isExpired: false });
  const expiredUsersCount = await UserPlan.countDocuments({ gymId: gym._id, isExpired: true });

  const planBreakdown = await UserPlan.aggregate([
    { $match: { gymId: gym._id } },
    { $group: { _id: "$planId", count: { $sum: 1 } } },
    {
      $lookup: {
        from: 'plans', // Collection name for Plan model
        localField: '_id',
        foreignField: '_id',
        as: 'planDetails'
      }
    },
    { $unwind: "$planDetails" },
    {
      $project: {
        _id: 1,
        count: 1,
        planName: "$planDetails.name",
        planType: "$planDetails.planType"
      }
    }
  ]);

  res.json({
    success: true,
    gym,
    plans,
    totalRevenue,
    userStats: {
      active: activeUsersCount,
      expired: expiredUsersCount,
      planBreakdown
    }
  });
});

//createAnnouncementByGymOwner also need..
//find list of users belong to gym (userPlans ie notExpired->gymId) && send announcement to them only: targetType (specificUser) always

//if announcement common to allUsers && allGyms-->create two announcement with sameMessage with thisTargetType
export const createAnnouncement = catchAsyncErrors(async (req, res, next) => {
  const { title, message, targetType, targetGyms = [], targetUsers = [] } = req.body;

  if (!title || !message) return next(new ErrorHandler("Title and message required", 400));

  const announcement = await Announcement.create({
    title,
    message,
    createdBy: req.user._id,
    targetType,
    targetGyms,
    targetUsers,
  });

  res.status(201).json({ success: true, message: "Announcement created", announcement });
});



// controllers/announcementController.js
export const deleteAnnouncement = catchAsyncErrors(async (req, res, next) => {
  const announcementId = req.params.announcementId;
  //   const userId = req.user._id;

  const announcement = await Announcement.findById(announcementId);

  if (!announcement) {
    return next(new ErrorHandler("Announcement not found", 404));
  }

  //No need of below: as isAdmin (middleware) is sufficient.. (as any admin can delete)

  //   // Only creator can delete
  //   if (!announcement.createdBy.equals(userId)) {
  //     return next(new ErrorHandler("Not authorized to delete this announcement", 403));
  //   }

  await announcement.deleteOne();

  res.status(200).json({
    success: true,
    message: "Announcement deleted successfully",
  });
});


//routeCreate
//condition: if userGymIds exist (gym: isVerified), then only ALL_GYMS announcement show
//update userGymIds to gymId (belongs to owner) && then find in list of targetGyms (ie find gym by userId-->take gymId of the finded gym)

// Get announcements based on user role
export const getUserAnnouncements = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user._id;
  const user = await User.findById(userId);

  let query;
  if (user.role === 'Admin') {
    query = {};
  }
  else if (user.role === 'GymOwner') {
    const gyms = await Gym.find({ owner: userId }).select('_id');
    query = {
      $or: [
        { targetType: "ALL" },
        { targetType: "ALL_GYMS" },
        { targetType: "SPECIFIC_GYMS", targetGyms: { $in: gyms } }
      ]
    };
  }
  else { // Regular User
    query = {
      $or: [
        { targetType: "ALL" },
        { targetType: "ALL_USERS" },
        { targetType: "SPECIFIC_USERS", targetUsers: { $in: [userId] } }
      ]
    };
  }

  const announcements = await Announcement.find(query).select('title message createdAt updatedAt').sort({ createdAt: -1 });
  res.status(200).json({ success: true, announcements });
});

// {
//   "message": "Gym will be closed tomorrow for maintenance."
// }

//byAdmin only (not for gyms, gyms->only use query with UserPlan->gymId->isExpired:false)
export const getUsersByQuery = catchAsyncErrors(async (req, res, next) => {
  const { search, role, email, phone, near } = req.query;
  const query = {};

  if (search) query.name = { $regex: search, $options: 'i' };
  if (role) query.role = role;
  if (email) query.email = email;
  if (phone) query.phone = phone;
  if (near) {
    const [lat, lng, radius] = near.split(',').map(Number);
    query['location.coordinates'] = {
      $near: {
        $geometry: { type: "Point", coordinates: [lng, lat] },
        $maxDistance: radius || 5000
      }
    };
  }

  const users = await User.find(query).select('_id name email role');
  res.status(200).json({ success: true, users });
});

export const getGymsByQuery = catchAsyncErrors(async (req, res, next) => {
  const { status, search, near } = req.query;
  const query = { isDeleted: false };

  if (status) query.status = status;
  if (search) query.name = { $regex: search, $options: 'i' };

  if (near) {
    const [lat, lng, radius] = near.split(',').map(Number);
    query['location.coordinates'] = {
      $near: {
        $geometry: { type: "Point", coordinates: [lng, lat] },
        $maxDistance: radius || 5000
      }
    };
  }

  const gyms = await Gym.find(query).select('_id name status');
  res.status(200).json({ success: true, gyms });
});


export const getPlansByQuery = catchAsyncErrors(async (req, res, next) => {
  const { minValidity, maxValidity, minPrice, maxPrice, minDiscount, maxDiscount, near } = req.query;
  const query = { isActive: true };

  // Price/Discount filters
  if (minValidity) query.validity = { $gte: Number(minValidity) };
  if (maxValidity) query.validity = { ...query.validity, $lte: Number(maxValidity) };
  if (minPrice) query.price = { $gte: Number(minPrice) };
  if (maxPrice) query.price = { ...query.price, $lte: Number(maxPrice) };
  if (minDiscount) query.discountPercent = { $gte: Number(minDiscount) };
  if (maxDiscount) query.discountPercent = { ...query.discountPercent, $lte: Number(maxDiscount) };

  // Handle geospatial query
  let gymIds = [];
  if (near) {
    const [lat, lng, radius] = near.split(',').map(Number);
    const gyms = await Gym.find({
      'location.coordinates': {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: radius || 10000 // Default 10km
        }
      }
    }).select('_id');

    gymIds = gyms.map(g => g._id);
    query.gymId = { $in: gymIds };
  }

  const plans = await Plan.find(query)
    .populate('gymId', 'name location status');

  res.status(200).json({ success: true, count: plans.length, plans });
});

export const updatePlanFactor = catchAsyncErrors(async (req, res, next) => {
  const { factor, planIds } = req.body;

  if (!factor || factor < 1) {
    return next(new ErrorHandler("Invalid factor value", 400));
  }

  if (!Array.isArray(planIds) || planIds.length === 0) {
    return next(new ErrorHandler("No plan IDs provided", 400));
  }

  // await Plan.updateMany({}, { maxExpiryFactor: factor });

  const result = await Plan.updateMany(
    { _id: { $in: planIds } },
    { $set: { maxExpiryFactor: factor } }
  );

  res.status(200).json({
    success: true,
    message: `${result.modifiedCount} plans updated with factor ${factor}`,
    updatedPlanIds: planIds
  });
});

// {
//   "factor": 1.5,
//   "planIds": [
//     "665e1f02f1b1c5b1e4a1a999",
//     "665e1f02f1b1c5b1e4a1aabc",
//     "665e1f02f1b1c5b1e4a1adef"
//   ]
// }
export const getAdminDashboardStats = catchAsyncErrors(async (req, res, next) => {
  const totalGyms = await Gym.countDocuments({ isDeleted: false });
  const totalUsers = await User.countDocuments({ role: 'User' });
  const pendingGyms = await Gym.countDocuments({ isVerified: false, isDeleted: false });

  const revenueAggregation = await GymPlanRevenue.aggregate([
    { $group: { _id: null, total: { $sum: "$revenue" } } }
  ]);
  const totalRevenue = revenueAggregation.length > 0 ? revenueAggregation[0].total : 0;

  // Monthly revenue for the last 12 months
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
  twelveMonthsAgo.setDate(1);
  twelveMonthsAgo.setHours(0, 0, 0, 0);

  const monthlyRevenue = await GymPlanRevenue.aggregate([
    { $match: { date: { $gte: twelveMonthsAgo } } },
    {
      $group: {
        _id: {
          year: { $year: "$date" },
          month: { $month: "$date" }
        },
        revenue: { $sum: "$revenue" }
      }
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } }
  ]);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formattedRevenueData = monthlyRevenue.map(item => ({
    month: monthNames[item._id.month - 1],
    revenue: item.revenue
  }));

  // Gym type revenue distribution
  const gymTypeData = await Gym.aggregate([
    { $match: { isDeleted: false } },
    {
      $lookup: {
        from: "gymplanrevenues",
        localField: "_id",
        foreignField: "gymId",
        as: "revenueRecords"
      }
    },
    {
      $addFields: {
        totalRevenue: { $sum: "$revenueRecords.revenue" }
      }
    },
    {
      $group: {
        _id: "$gymType",
        revenue: { $sum: "$totalRevenue" }
      }
    }
  ]);

  const colors = ['#8b5cf6', '#f43f5e', '#f59e0b', '#10b981', '#6366f1'];
  const formattedGymTypeData = gymTypeData.map((item, index) => ({
    name: item._id ? item._id.charAt(0).toUpperCase() + item._id.slice(1) : 'Others',
    value: item.revenue,
    color: colors[index % colors.length]
  }));

  // Top Performing Gyms (Including all gyms)
  const topGyms = await Gym.aggregate([
    { $match: { isDeleted: false } },
    {
      $lookup: {
        from: "gymplanrevenues",
        localField: "_id",
        foreignField: "gymId",
        as: "revenueRecords"
      }
    },
    {
      $addFields: {
        totalRevenue: { $sum: "$revenueRecords.revenue" }
      }
    },
    { $sort: { totalRevenue: -1 } },
    {
      $project: {
        name: 1,
        revenue: "$totalRevenue",
        growth: { $concat: ["+", { $toString: 15 }, "%"] }, // Default growth for now
        trend: "up"
      }
    }
  ]);

  res.status(200).json({
    success: true,
    stats: {
      totalGyms,
      totalUsers,
      totalRevenue,
      pendingGyms,
      revenueData: formattedRevenueData,
      gymTypeData: formattedGymTypeData,
      topGyms: topGyms.map(g => ({
        ...g,
        revenue: g.revenue
      }))
    }
  });
});

