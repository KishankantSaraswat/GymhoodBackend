import UserPlan from "../models/14_userPlanModel.js";
import GymDailyStats from "../models/7_gymDailyStatsModel.js";
import { GymPlanRevenue, AnalyticsCache } from "../models/4_gymPlanRevenueModel.js";
import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddlewares.js";
import Gym from "../models/1_gymModel.js";
import User from "../models/0_unifiedUserModel.js";
import geolib from 'geolib'; //geoLib for distance calculations..
// import { getDistance, getPreciseDistance } from 'geolib';
import mongoose from "mongoose";


export const getGymDashboardStats = catchAsyncErrors(async (req, res) => {
  const { gymId } = req.params;
  const gym = await Gym.findById(gymId);

  if (!gym) {
    return next(new ErrorHandler("Gym not found", 404));
  }

  // Get users within 15km radius
  const allUsers = await User.find({
    role: 'User',
    location: { $exists: true } //who provided their location, getLocation also when qrCheckIn**
  }).select('name email location profile_picture');

  const nearbyUsers = allUsers.filter(user => {
    if (!user.location?.coordinates || !gym.location?.coordinates) return false;
    return geolib.getDistance(
      { latitude: user.location.coordinates[1], longitude: user.location.coordinates[0] },
      { latitude: gym.location.coordinates[1], longitude: gym.location.coordinates[0] }
    ) <= 15000; // 15km in meters
  });

  res.status(200).json({
    success: true,
    stats: {
      totalNearbyUsers: nearbyUsers.length,
      potentialCustomers: nearbyUsers.slice(0, 50), // Return first 50 for display
      gymLocation: gym.location
    }
  });
});

//no caching..full calculation from scratch...Easily till database get tooMuch older..
export const getRevenueAnalytics = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user._id;
  const currentDate = new Date();

  // 1. Get the gym
  const gym = await Gym.findOne({ owner: userId });
  if (!gym) return next(new ErrorHandler("Gym not found", 404));

  // 2. Check for cached data
  const cachedData = await AnalyticsCache.findOne({
    gymId: gym._id,
    type: 'revenue'
  });

  // 3. Determine the cutoff date (24 hours ago) ////24*60*60*1000
  // after each 30sec..get updatedData..as use cached && current(small)-->quick merge && send && update cahce...(as old not need to compute)
  const cutoffDate = new Date(currentDate.getTime() - 30 * 1000);
  // Multiple requests within 30s will keep seeing the same cached data

  // 4. If fresh cache exists, use it completely
  if (cachedData?.updatedAt >= cutoffDate) {
    return res.status(200).json({
      success: true,
      data: cachedData.data
    });
  }

  // 5. Get new revenue records since last cache update (or all if no cache)
  const query = { gymId: gym._id };
  // if (cachedData?.updatedAt) {
  //   query.date = { $gte: cachedData.updatedAt };
  // }
  if (cachedData?.updatedAt) { //as date-->will missTheData..
    query.createdAt = { $gte: cachedData.updatedAt }; // Use createdAt instead of date
  }

  const newRevenueRecords = await GymPlanRevenue.find(query);

  // Multiple requests within 30s will keep seeing the same cached data
  // But MongoDB timestamps can have millisecond differences that cause misses

  // console.log("Below unable to fetch-->newRecords..")
  //   console.log('Cache exists:', !!cachedData);
  // console.log('New records found:', newRevenueRecords.length);
  // console.log('Last cache update:', cachedData?.updatedAt);

  // 6. If no cached data exists, process everything fresh
  if (!cachedData) {
    const result = processRevenueAnalytics(newRevenueRecords);
    await updateAnalyticsCache(gym._id, 'revenue', result);
    return res.status(200).json({ success: true, data: result });
  }

  // 7. Merge cached data with new records
  // const mergedData = mergeRevenueData(cachedData.data, newRevenueRecords);

  // 5. SIMPLIFIED APPROACH - Get ALL records and reprocess completely
  const allRecords = await GymPlanRevenue.find({ gymId: gym._id });
  const result = processRevenueAnalytics(allRecords);


  await updateAnalyticsCache(gym._id, 'revenue', result);

  res.status(200).json({ success: true, data: result });
});

// Helper function to process raw revenue records
function processRevenueAnalytics(records) {

  const groupByTimePeriod = (records, period) => {
    const grouped = {};

    records.forEach(record => {
      const date = new Date(record.date);
      let key;

      if (period === 'daily') {
        key = date.toISOString().split('T')[0]; // YYYY-MM-DD
      } else if (period === 'weekly') {
        const week = getWeekNumber(date);
        key = `${date.getFullYear()}-W${week}`;
      } else if (period === 'monthly') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else if (period === 'yearly') {
        key = date.getFullYear();
      }

      if (!grouped[key]) {
        grouped[key] = {
          total: 0,
          plans: {}
        };
      }

      grouped[key].total += record.revenue;

      if (!grouped[key].plans[record.planId]) {
        grouped[key].plans[record.planId] = 0;
      }
      grouped[key].plans[record.planId] += record.revenue;
    });

    return grouped;
  };

  return {
    daily: formatData(groupByTimePeriod(records, 'daily')),
    weekly: formatData(groupByTimePeriod(records, 'weekly')),
    monthly: formatData(groupByTimePeriod(records, 'monthly')),
    yearly: formatData(groupByTimePeriod(records, 'yearly'))
  };
}

const getWeekNumber = (date) => {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
};

// Format data into arrays for charts
function formatData(groupedData) {
  const dates = Object.keys(groupedData).sort();
  const totals = dates.map(date => groupedData[date].total);

  // Get all unique plan IDs across all dates
  const allPlanIds = new Set();
  dates.forEach(date => {
    Object.keys(groupedData[date].plans).forEach(planId => {
      allPlanIds.add(planId);
    });
  });

  // Create series for each plan
  const planSeries = {};
  Array.from(allPlanIds).forEach(planId => {
    planSeries[planId] = dates.map(date =>
      groupedData[date].plans[planId] || 0
    );
  });

  return {
    dates,
    totals,
    planSeries
  };
}

// Helper function to merge cached and new data

function mergeRevenueData(cachedData, newRecords) {
  // First process just the new records
  const newData = processRevenueAnalytics(newRecords);

  // If no cached data exists, just return the new data
  if (!cachedData) return newData;

  // Merge each time period (daily, weekly, monthly, yearly)
  const result = {};
  const periods = ['daily', 'weekly', 'monthly', 'yearly'];

  periods.forEach(period => {
    const cachedPeriod = cachedData[period];
    const newPeriod = newData[period];

    // Create a map of dates to their indexes for quick lookup
    const dateIndexMap = new Map();
    cachedPeriod.dates.forEach((date, index) => {
      dateIndexMap.set(date, index);
    });

    // Initialize merged arrays with cached data
    const mergedDates = [...cachedPeriod.dates];
    const mergedTotals = [...cachedPeriod.totals];
    const mergedPlanSeries = {};

    // Copy all existing plan series from cache
    Object.keys(cachedPeriod.planSeries).forEach(planId => {
      mergedPlanSeries[planId] = [...cachedPeriod.planSeries[planId]];
    });

    // Process new data
    newPeriod.dates.forEach((newDate, newIndex) => {
      if (dateIndexMap.has(newDate)) {
        // Existing date - update values
        const existingIndex = dateIndexMap.get(newDate);
        mergedTotals[existingIndex] += newPeriod.totals[newIndex];

        // Update plan series
        Object.entries(newPeriod.planSeries).forEach(([planId, amounts]) => {
          if (!mergedPlanSeries[planId]) {
            // Initialize array with zeros if plan didn't exist in cache
            mergedPlanSeries[planId] = Array(mergedDates.length).fill(0);
          }
          mergedPlanSeries[planId][existingIndex] += amounts[newIndex];
        });
      } else {
        // New date - append to arrays
        dateIndexMap.set(newDate, mergedDates.length);
        mergedDates.push(newDate);
        mergedTotals.push(newPeriod.totals[newIndex]);

        // Update all plan series
        Object.keys(mergedPlanSeries).forEach(planId => {
          // Existing plans - add 0 for the new date
          mergedPlanSeries[planId].push(0);
        });

        Object.entries(newPeriod.planSeries).forEach(([planId, amounts]) => {
          if (!mergedPlanSeries[planId]) {
            // New plan - initialize array with zeros for all previous dates
            mergedPlanSeries[planId] = Array(mergedDates.length - 1).fill(0);
            mergedPlanSeries[planId].push(amounts[newIndex]);
          } else {
            // Existing plan - add its amount for the new date
            mergedPlanSeries[planId][mergedDates.length - 1] = amounts[newIndex];
          }
        });
      }
    });

    result[period] = {
      dates: mergedDates,
      totals: mergedTotals,
      planSeries: mergedPlanSeries
    };
  });

  return result;
}

// Helper function to update cache
async function updateAnalyticsCache(gymId, type, data) {
  return AnalyticsCache.findOneAndUpdate(
    { gymId, type },
    { data, updatedAt: new Date() },
    { upsert: true, new: true }
  );
}





/**
 * @description Get member analytics (distribution and growth)
 * @route GET /api/analytics/members
 * @access Private (Gym Owner)
 */

export const getMemberAnalytics = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user._id;
  const currentDate = new Date();

  // 1. Get the gym
  const gym = await Gym.findOne({ owner: userId });
  if (!gym) return next(new ErrorHandler("Gym not found", 404));

  // 2. Check for cached data
  const cachedData = await AnalyticsCache.findOne({
    gymId: gym._id,
    type: 'members'
  });

  // 3. Determine the cutoff date (24 hours ago) //for instant response..
  const cutoffDate = new Date(currentDate.getTime() - 30 * 1000); //1*60*60*1000 (for 1hour atleast)-->quick response in wallet**

  // 4. Always calculate active members fresh (they change frequently)
  const activeUserPlans = await UserPlan.find({
    gymId: gym._id,
    // endDate: { $gte: currentDate },
    // startDate: { $lte: currentDate }
    isExpired: false
  }).populate("planId", "name planType"); // ✅ populate only planName from Plan;

  //   {
  //   "byPlan": {
  //     "plan123": {
  //       "count": 5,
  //       "planName": "Monthly Premium",
  //       "planType": "Monthly"
  //     }
  //   }
  // }


  // 5. Process plan distribution (always fresh)
  const planDistribution = calculatePlanDistribution(activeUserPlans);

  // 6. Handle member growth data
  let memberGrowth;

  if (cachedData?.updatedAt >= cutoffDate) {
    // Use cached growth data if fresh
    memberGrowth = cachedData.data.memberGrowth;
  } else {
    // Calculate growth data
    const query = { gymId: gym._id };
    if (cachedData?.updatedAt) {
      query.purchaseDate = { $gte: cachedData.updatedAt };
    }

    const newUserPlans = await UserPlan.find(query);
    const allUserPlans = cachedData
      ? [...cachedData.data.allUserPlans, ...newUserPlans]
      : newUserPlans;

    memberGrowth = calculateMemberGrowth(allUserPlans);

    // Update cache with all historical data
    await AnalyticsCache.findOneAndUpdate(
      { gymId: gym._id, type: 'members' },
      {
        data: {
          planDistribution, // Note: This will be stale until next cache update
          memberGrowth,
          allUserPlans      // Store for future merging
        },
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );
  }

  res.status(200).json({
    success: true,
    data: {
      planDistribution,
      memberGrowth
    }
  });
});

/**
 * @description Calculates active member distribution across plans
 * @param {Array} activeUserPlans - Array of active UserPlan documents
 * @returns {Object} Plan distribution data
 */
function calculatePlanDistribution(activeUserPlans) {
  const distribution = {
    totalActiveUsers: 0,
    byPlan: {}
  };

  activeUserPlans.forEach(plan => {
    // const planId = plan.planId.toString();
    const planId = plan.planId._id.toString();

    if (!distribution.byPlan[planId]) {
      distribution.byPlan[planId] = {
        count: 0,
        planName: plan.planId?.name || 'Unnamed Plan',
        planType: plan.planId?.planType // Adding plan type if available
      };
    }

    distribution.byPlan[planId].count++;
    distribution.totalActiveUsers++;
  });

  return distribution;
}

/**
 * @description Calculates member growth over time periods
 * @param {Array} userPlans - All UserPlan documents
 * @returns {Object} Growth data by time period
 */
function calculateMemberGrowth(userPlans) {
  // Helper function to group by time period
  const groupByTimePeriod = (records, period) => {
    const grouped = {};

    records.forEach(record => {
      const date = new Date(record.purchaseDate);
      let key;

      if (period === 'daily') {
        key = date.toISOString().split('T')[0]; // YYYY-MM-DD
      } else if (period === 'weekly') {
        key = `${date.getFullYear()}-W${getWeekNumber(date)}`;
      } else if (period === 'monthly') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else if (period === 'yearly') {
        key = date.getFullYear();
      }

      if (!grouped[key]) grouped[key] = 0;
      grouped[key]++;
    });

    return grouped;
  };

  // Helper to get ISO week number
  const getWeekNumber = (date) => {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  };

  // Format grouped data for response
  const formatGrowthData = (groupedData) => {
    const sortedDates = Object.keys(groupedData).sort();
    const counts = sortedDates.map(date => groupedData[date]);

    // Calculate cumulative growth
    const cumulative = counts.reduce((acc, curr, i) => {
      acc.push(i === 0 ? curr : acc[i - 1] + curr);
      return acc;
    }, []);

    return {
      dates: sortedDates,
      counts,
      cumulative
    };
  };

  return {
    daily: formatGrowthData(groupByTimePeriod(userPlans, 'daily')),
    weekly: formatGrowthData(groupByTimePeriod(userPlans, 'weekly')),
    monthly: formatGrowthData(groupByTimePeriod(userPlans, 'monthly')),
    yearly: formatGrowthData(groupByTimePeriod(userPlans, 'yearly'))
  };
}

/**
 * @description Get detailed list of members (Active/Expired)
 * @route GET /api/dashboard/members/list/:gymId?type=active|expired
 * @access Private (Gym Owner)
 */
export const getActiveMemberDetails = catchAsyncErrors(async (req, res, next) => {
  const { gymId } = req.params;
  const { type = 'active' } = req.query; // 'active' or 'expired'

  const query = { gymId };

  if (type === 'expired') {
    query.isExpired = true;
  } else {
    // Default to active
    query.isExpired = false;
  }

  // 1. Find user plans based on status
  const userPlans = await UserPlan.find(query)
    .populate({
      path: 'userId',
      select: 'name email phone photo gender' // valid fields from User model
    })
    .populate({
      path: 'planId',
      select: 'name planType duration'
    })
    .sort({ purchaseDate: -1 });

  // 2. Format the response
  const members = userPlans.map(plan => {
    // If user deleted account or null
    if (!plan.userId) return null;

    const remainingDays = Math.max(0, Math.ceil((new Date(plan.maxExpiryDate) - new Date()) / (1000 * 60 * 60 * 24)));

    return {
      _id: plan.userId._id, // User ID
      planId: plan._id, // User Plan ID
      name: plan.userId.name,
      email: plan.userId.email,
      phone: plan.userId.phone,
      photo: plan.userId.photo,
      gender: plan.userId.gender,

      planName: plan.planId?.name || 'Unknown Plan',
      planType: plan.planId?.planType,

      joinDate: plan.purchaseDate,
      expiryDate: plan.maxExpiryDate,
      remainingDays: type === 'expired' ? 0 : remainingDays,

      totalDays: plan.totalDays,
      usedDays: plan.usedDays,
      status: type === 'expired' ? 'Expired' : 'Active'
    };
  }).filter(member => member !== null);

  res.status(200).json({
    success: true,
    count: members.length,
    members
  });
});

/**
 * @description Get single member full details
 * @route GET /api/dashboard/member/details/:planId
 * @access Private (Gym Owner)
 */
export const getSingleMemberDetails = catchAsyncErrors(async (req, res, next) => {
  const { planId } = req.params;

  // 1. Get UserPlan details
  const userPlan = await UserPlan.findById(planId)
    .populate({
      path: 'userId',
      select: 'name email phone photo gender'
    })
    .populate({
      path: 'planId',
      select: 'name planType duration'
    });

  if (!userPlan) {
    return next(new ErrorHandler("Member plan not found", 404));
  }

  const userId = userPlan.userId._id;
  const gymId = userPlan.gymId;

  // 2. Calculate workout duration from GymDailyStats
  const stats = await GymDailyStats.find({
    gymId: gymId,
    'register.userId': userId
  }).select('register');

  let totalDurationMinutes = 0;

  stats.forEach(dayStat => {
    const userEntries = dayStat.register.filter(r => r.userId?.toString() === userId.toString());

    userEntries.forEach(userEntry => {
      if (userEntry.checkInTime) {
        const endTime = userEntry.checkOutTimeReal || userEntry.checkOutTimeCalc;
        if (endTime) {
          const durationMs = new Date(endTime) - new Date(userEntry.checkInTime);
          if (durationMs > 0) {
            totalDurationMinutes += Math.floor(durationMs / (1000 * 60));
          }
        }
      }
    });
  });

  const durationHours = (totalDurationMinutes / 60).toFixed(1);

  const remainingDays = Math.max(0, Math.ceil((new Date(userPlan.maxExpiryDate) - new Date()) / (1000 * 60 * 60 * 24)));

  const memberDetails = {
    _id: userPlan.userId._id,
    planId: userPlan._id,
    name: userPlan.userId.name,
    email: userPlan.userId.email,
    phone: userPlan.userId.phone,
    photo: userPlan.userId.photo,
    gender: userPlan.userId.gender,

    planName: userPlan.planId?.name || 'Unknown Plan',
    planType: userPlan.planId?.planType,
    planDuration: userPlan.planDuration,

    amountDeducted: userPlan.amountDeducted,
    purchaseDate: userPlan.purchaseDate,
    usedDays: userPlan.usedDays,
    expiryDate: userPlan.maxExpiryDate,
    isExpired: userPlan.isExpired,
    remainingDays,

    workoutDurationHours: durationHours,
    refundHistory: userPlan.metadata?.refundHistory || []
  };

  res.status(200).json({
    success: true,
    member: memberDetails
  });
});
