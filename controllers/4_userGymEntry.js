import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddlewares.js";
import UserGymLog from "../models/6_userGymLogModel.js";
import UserPlan from "../models/14_userPlanModel.js";
import Plan from "../models/3_planModel.js";
import Gym from "../models/1_gymModel.js";
import GymDailyStats from "../models/7_gymDailyStatsModel.js";
import WalletTransaction from "../models/13_walletTransactionModel.js";
import User from "../models/0_unifiedUserModel.js";



//allowed multipleCheckIn..in sameDate (on userFreedom-->as multiplePlan from sameGym, but streak not improve):

//at a time, only onePlan in oneGym..(ie if in gymRegister->ActiveUser with somePlan-->not again active with same or, other plan)

export const qrCheckIn = catchAsyncErrors(async (req, res, next) => {
  const { userPlanId, testDate } = req.body;
  const userId = req.user._id;

  // Centralized date handling with test dates
  const testDates = [
    new Date('2025-06-06T18:00:00'), // June 6, 6:00 PM
    new Date('2025-06-07T18:00:00'), // June 7, 6:00 PM
    new Date('2025-06-08T18:00:00'), // June 8, 6:00 PM
    new Date('2025-06-09T18:00:00'), // June 9, 6:00 PM
    new Date('2025-06-10T18:00:00'), // June 10, 6:00 PM
    new Date('2025-06-12T18:00:00'),  // June 12, 6:00 PM
    new Date('2025-06-25T18:00:00'), //"6" index


    new Date('2025-07-07T18:00:00'), // June 7, 6:00 PM
    new Date('2025-07-08T18:00:00'), // June 8, 6:00 PM
    new Date('2025-07-09T18:00:00'), // June 9, 6:00 PM
    new Date('2025-07-10T18:00:00'), // June 10, 6:00 PM

    new Date('2025-07-18T18:00:00'), //"11"th index

    new Date('2025-07-25T18:00:00'),

  ];

  // Centralized date handling
  // Use testDate if provided (index 0-5), otherwise current time
  const currentDate = testDate !== undefined ? testDates[testDate] || new Date() : new Date();
  // const currentDate = testDate ? new Date(testDate) : new Date();
  const checkInTime = currentDate;
  const today = currentDate.toISOString().split("T")[0];


  const userPlan = await UserPlan.findOne({
    _id: userPlanId,
    userId,
    isExpired: false,
    maxExpiryDate: { $gte: checkInTime },

  });
  if (!userPlan) {
    return next(new ErrorHandler("No active plan found", 400));
  }



  const gymId = userPlan.gymId;

  // ✅ Check if user already checked in (any userPlanId)
  const alreadyCheckedIn = await GymDailyStats.findOne({
    gymId,
    date: today,
    register: {
      $elemMatch: {
        userId: userId,
        checkOutTimeReal: null,
      },
    },
  });

  if (alreadyCheckedIn) {
    return next(new ErrorHandler("User already checked in the gym (duplicate request)", 400));
  }



  await updateGymLog(userId, true, gymId, userPlanId, currentDate);

  // Update used days
  userPlan.usedDays += 1;
  if (
    userPlan.usedDays >= userPlan.totalDays ||
    currentDate > userPlan.maxExpiryDate
  ) {
    userPlan.isExpired = true; //isExpired set also, when user hit getUserPlan route..
  }
  await userPlan.save();

  // Calculate checkout time
  const checkOutTime = new Date(
    checkInTime.getTime() + userPlan.planDuration * 60 * 60 * 1000
  );

  // Update gym daily stats
  const user = await User.findById(userId).select("name email phone photo"); //select only requiredInfo..

  await GymDailyStats.findOneAndUpdate(
    { gymId, date: today },
    {
      $push: {
        register: {
          userId,
          userName: user.name,
          photo: user.photo,
          contactNo: user.phone,
          userPlanId: userPlan._id,
          perDayCost: userPlan.perDayCost,
          checkInTime,
          checkOutTimeCalc: checkOutTime,
        },
      },
      $inc: {
        totalUsersToday: 1,
        activeUsers: 1,
      },
    },
    { upsert: true, new: true }
  );

  res.status(200).json({
    success: true,
    message: "Check-in successful",
    checkOutTime,
    remainingDays: userPlan.totalDays - userPlan.usedDays,
  });
});

//at a time, only onePlan in oneGym..(ie if in gymRegister->ActiveUser with somePlan-->not again active with same or, other plan)
export const qrCheckOut = catchAsyncErrors(async (req, res, next) => {
  const { gymId } = req.body;
  const userId = req.user._id;
  const checkOutTime = new Date();

  // Update gym log with actual checkout time
  const today = new Date().toISOString().split("T")[0];


  // Update gym daily stats
  const stats = await GymDailyStats.findOneAndUpdate(
    // { gymId, date: today, "register.userId": userId },
    {
      gymId,
      date: today,
      register: {
        $elemMatch: {
          userId: userId,
          checkOutTimeReal: null,
        },
      },
    },
    {
      $set: { "register.$.checkOutTimeReal": checkOutTime },
      $inc: { activeUsers: -1 },
    }
  );

  // const stats = await GymDailyStats.findOne({ gymId, date: targetDate });

  if (!stats || !stats.register || stats.register.length === 0) {
    throw new Error("No active check-ins found for this gym on the given date.");
    //or, errorHandler.. && try-catch to handel..serverNotCrash when error
  }


  res.status(200).json({
    success: true,
    message: "Check-out successful",
  });
});

const updateGymLog = async (userId, didWorkoutToday, gymId, userPlanId, currentDate = new Date()) => {
  // 1. Find the latest log
  let currentLog = await UserGymLog.findOne({ userId }).sort({
    startingDate: -1,
  });
  // console.log("currentLog:exitingLog",currentLog); //when updated or, created==>function not properly saving the Document

  // 2. If no log exists, create one
  if (!currentLog) {
    currentLog = new UserGymLog({
      userId,
      //  gymId,
      // userPlanId,
      startingDate: currentDate,
      dateArray: Array(300).fill(-1),
    });
  }
  await currentLog.save(); // Save the new log immediately


  // 3. Calculate today's index (0-99)
  const daysSinceStart = Math.floor(
    (currentDate - currentLog.startingDate) / (1000 * 60 * 60 * 24)
  );
  let currentIndex = daysSinceStart;


  currentIndex = daysSinceStart % 300; //no transfer problem (start overwrite, once 1000 day crossed)


  currentLog.dateArray[currentIndex] = didWorkoutToday ? 1 : 0;


  console.log("Updated dateArray at index", currentIndex, ":", currentLog.dateArray[currentIndex]);



  // 6. Backfill gaps (critical fix)
  for (let i = currentIndex - 1; i >= 0; i--) {
    if (currentLog.dateArray[i] === -1) {
      currentLog.dateArray[i] = 0;
    } else {
      break; // Stop when we hit a recorded day
    }
  }


  try {
    await currentLog.save();
    console.log(`Successfully updated log for ${currentDate.toISOString()}:`, {
      index: currentIndex,
      value: currentLog.dateArray[currentIndex],
      // array: currentLog.dateArray
    });
    return currentLog;
  } catch (err) {
    console.error("Save error:", err);
    throw err;
  }
};

export const streak = catchAsyncErrors(async (req, res, next) => {
  try {
    //need userPlan as input
    const { testDate } = req.body;
    // const { userPlanId, testDate } = req.body;
    const userId = req.user._id;

    // Centralized date handling with test dates
    const testDates = [
      new Date('2025-06-06T18:00:00'), // June 6, 6:00 PM
      new Date('2025-06-07T18:00:00'), // June 7, 6:00 PM
      new Date('2025-06-08T18:00:00'), // June 8, 6:00 PM
      new Date('2025-06-09T18:00:00'), // June 9, 6:00 PM
      new Date('2025-06-10T18:00:00'), // June 10, 6:00 PM
      new Date('2025-06-12T18:00:00'),  // June 12, 6:00 PM
      new Date('2025-06-25T18:00:00'), //"6" index


      new Date('2025-07-07T18:00:00'), // June 7, 6:00 PM
      new Date('2025-07-08T18:00:00'), // June 8, 6:00 PM
      new Date('2025-07-09T18:00:00'), // June 9, 6:00 PM
      new Date('2025-07-10T18:00:00'), // June 10, 6:00 PM

      new Date('2025-07-18T18:00:00'), //"11"th index

      new Date('2025-07-25T18:00:00'),

    ];

    // Centralized date handling
    // Use testDate if provided (index 0-5), otherwise current time
    const currentDate = testDate !== undefined ? testDates[testDate] || new Date() : new Date();











    // const currentDate = testDate ? new Date(testDate) : new Date();
    // const userId = req.user._id;
    // console.log("userId",userId);


    // Update gym log streak without needing didWorkoutToday from check-in
    const currentLog = await updateGymLogForStreak(userId, currentDate);

    if (!currentLog) {
      return res.status(404).json({
        success: false,
        message: "No gym history found to calculate streak."
      });
    }

    res.status(200).json({
      success: true,
      // currentLog,
      currentStreak: currentLog.currentStreak,
      // maxStreak:currentLog.maxStreak,
      currentWeekStreak: currentLog.currentWeekStreak,
      thisWeekStreak: currentLog.thisWeekStreak,
    });
  } catch (error) {
    return next(error);
  }
});

const updateGymLogForStreak = async (userId, currentDate = new Date()) => {
  let currentLog = await UserGymLog.findOne({ userId }).sort({
    startingDate: -1,
  }); //atMax one currentLog../user..as work for 3years..

  const today = currentDate;

  if (!currentLog) {
    return null; // No log found
  }

  const daysSinceStart = Math.floor(
    (today - currentLog.startingDate) / (1000 * 60 * 60 * 24)
  );

  const currentIndex = daysSinceStart % 300;
  console.log("currentIndex", currentIndex);

  for (let i = currentIndex - 1; i >= 0; i--) {
    if (currentLog.dateArray[i] === -1) {
      currentLog.dateArray[i] = 0;
    } else {
      break; // Stop when we hit a recorded day
    }
  }


  await calculateStreak(currentLog, currentDate);
  await currentLog.save();

  return currentLog;
};

const calculateStreak = (userGym, currentDate = new Date()) => {
  const arr = userGym.dateArray;
  const startingDate = new Date(userGym.startingDate);
  const msInDay = 1000 * 60 * 60 * 24;

  // Normalize start time to midnight
  const start = new Date(startingDate.setHours(0, 0, 0, 0));
  let lastWorkoutIndex;

  if (currentDate) {
    // If currentDate is passed, use it as last workout date
    const curr = new Date(currentDate.setHours(0, 0, 0, 0));
    const diffInDays = Math.floor((curr - start) / msInDay);
    lastWorkoutIndex = diffInDays;
  } else {
    // Otherwise, use the last recorded index (ignoring -1)
    lastWorkoutIndex = arr.length - 1;
    while (lastWorkoutIndex >= 0 && arr[lastWorkoutIndex] === -1) {
      lastWorkoutIndex--;
    }
  }

  console.log("lastWorkoutIndex:", lastWorkoutIndex);

  // Exit if invalid
  if (lastWorkoutIndex < 0) {
    userGym.currentStreak = 0;
    return;
  }


  // 3. Get day of the week (0=Sun, 1=Mon, etc.)
  const workoutDate = new Date(userGym.startingDate);
  workoutDate.setDate(workoutDate.getDate() + lastWorkoutIndex);
  const dayOfWeek = workoutDate.getDay(); //day of week (for lastWorkoutIndex)


  //   startingDate = "2025-06-01" (Sunday)
  // lastWorkoutIndex = 3 → June 4 → Wednesday → dayOfWeek = 3

  // 4. Count workouts in the current week
  const daysSinceSunday = (dayOfWeek + 6) % 7;
  const weekStartIndex = Math.max(0, lastWorkoutIndex - daysSinceSunday);
  // daysSinceSunday gives how far into the week we are.
  // weekStartIndex = where this week began in arr.

  console.log("weekStartIndex", weekStartIndex);

  let thisWeekStreak = 0;
  for (let i = weekStartIndex; i <= lastWorkoutIndex; i++) { //streak update only, if different days go to gym, not same day 4hr**
    if (arr[i] === 1) thisWeekStreak++;
  }

  console.log("thisWeekStreak", thisWeekStreak);

  // If dayOfWeek = 3 (Wed), daysSinceSunday = 2
  // From lastWorkoutIndex - 2 to lastWorkoutIndex, check 1s

  // 5. Update streak
  if (thisWeekStreak >= 4) {
    if (dayOfWeek === 0) {
      userGym.currentWeekStreak += 1; // Full week completed
      userGym.thisWeekStreak = 0;
    } else {
      userGym.thisWeekStreak = thisWeekStreak; // Partial week
    }
    userGym.currentStreak =
      userGym.currentWeekStreak * 7 + userGym.thisWeekStreak; //for how long maingting streak of going to gym... (not no. of days go to gym)
  } else if (thisWeekStreak < 4) {
    if (dayOfWeek === 0) {
      userGym.currentStreak = 0; // Streak broken
      userGym.currentWeekStreak = 0;
      userGym.thisWeekStreak = 0;
    }
    else {
      userGym.thisWeekStreak = thisWeekStreak; // Partial week
    }
    userGym.currentStreak =
      userGym.currentWeekStreak * 7 + userGym.thisWeekStreak;
  }

  // 6. Update max streak
  // userGym.maxStreak = Math.max(userGym.maxStreak, userGym.currentStreak);
};

//One user multipleGym go (In a singleYear)-->but userGymLog (unique for a giveUser..irr of gym or, plan):
//below handel all multipleGym streak-->in one place..for codeforces like chart..

export const getYearlyGymHeatmap = catchAsyncErrors(async (req, res) => {
  const userId = req.user._id;

  const userLog = await UserGymLog.findOne({ userId });
  if (!userLog) {
    return res.status(200).json({
      success: true,
      data: null,
      message: "No gym log found for the user",
    });
  }

  res.status(200).json({
    success: true,
    data: {
      startingDate: userLog.startingDate,
      dateArray: userLog.dateArray,
    },
  });
});


// {
//   "date": "2024-06-28",
//   "day": 28,
//   "month": "June",
//   "weekday": "Friday",
//   "status": 1
// }


// dotColor = status === 1 ? "green" : "white";
// tooltip = `Date: ${date} | Attended: ${status === 1 ? "Yes" : "No"} | Streak: ${streak}`



export const getGymRegisterByDate = catchAsyncErrors(async (req, res, next) => {
  const { gymId } = req.params;
  const { date } = req.body; // ✅ Read date from request body

  // Default to today if no date provided
  const targetDate = date
    ? new Date(date).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  const stats = await GymDailyStats.findOne({ gymId, date: targetDate })
    // .populate("register.userId", "name email phone")
    .sort({ createdAt: -1 });

  if (!stats) {
    return next(
      new ErrorHandler(`No gym register found for date ${targetDate}`, 404)
    );
  }

  res.status(200).json({
    success: true,
    register: stats.register || [],
    date: targetDate,
  });
});


export const getActiveUsers = catchAsyncErrors(async (req, res) => {
  const { gymId } = req.params;
  const today = new Date().toISOString().split("T")[0];

  const stats = await GymDailyStats.findOne({ gymId, date: today })
  // .populate({
  //   path: "register.userId",
  //   select: "name email phone",
  // });

  const activeUsers =
    stats?.register.filter(
      (user) =>
        !user.checkOutTimeReal && new Date(user.checkOutTimeCalc) > new Date()
    ) || [];

  //also createExpiredUsers function, to provide list of users checkOutReal not exist && now>checkoutTimeCalc
  const now = new Date(); // <--- Define it before use
  const expiredUsers = stats?.register.filter(
    (user) => !user.checkOutTimeReal && new Date(user.checkOutTimeCalc) <= now
  ) || [];


  res.status(200).json({
    success: true,
    activeUsers,
    expiredUsers,
    activeCount: activeUsers.length,
    expiredCount: expiredUsers.length
  });
});


export const cleanExpiredUsers = catchAsyncErrors(async (req, res) => {
  const { gymId } = req.params;
  const today = new Date().toISOString().split("T")[0];
  const now = new Date();

  const stat = await GymDailyStats.findOne({ gymId, date: today });

  if (!stat) {
    return res.status(404).json({
      success: false,
      message: "No active check-in found for this gym today.",
    });
  }

  const expiredUsers = stat.register.filter(
    (user) => !user.checkOutTimeReal && new Date(user.checkOutTimeCalc) <= now
  );

  if (expiredUsers.length === 0) {
    return res.status(200).json({
      success: true,
      message: "No expired users to clean.",
    });
  }

  await GymDailyStats.updateOne(
    { _id: stat._id },
    {
      $set: {
        "register.$[elem].checkOutTimeReal": now,
      },
      $inc: { activeUsers: -expiredUsers.length },
    },
    {
      arrayFilters: [
        {
          "elem.userId": { $in: expiredUsers.map((u) => u.userId) },
          "elem.checkOutTimeReal": null,
        },
      ],
    }
  );

  res.status(200).json({
    success: true,
    cleanedUsers: expiredUsers.map((u) => u.userId),
    count: expiredUsers.length,
  });
});


export const getActiveCapacity = catchAsyncErrors(async (req, res, next) => {
  const { gymId } = req.params;
  const today = new Date().toISOString().split("T")[0];
  const now = new Date();

  // Use Intl.DateTimeFormat to get the current day and time in Asia/Kolkata timezone
  const options = { timeZone: 'Asia/Kolkata' };
  const currentDay = now.toLocaleDateString('en-US', { ...options, weekday: 'long' }).toLowerCase();

  // Get current time in HH:MM format in IST
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const [istHour, istMinute] = timeFormatter.format(now).split(':').map(Number);
  const currentTime = istHour * 60 + istMinute;

  // Get gym details to find active shift
  const gym = await Gym.findById(gymId);

  if (!gym) {
    return next(new ErrorHandler("Gym not found", 404));
  }

  // Find the active shift
  let activeShift = null;
  if (gym.shifts && gym.shifts.length > 0) {
    activeShift = gym.shifts.find((shift) => {
      if (!shift.day || shift.day.toLowerCase() !== currentDay) return false;
      const [startH, startM] = shift.startTime.split(":").map(Number);
      const [endH, endM] = shift.endTime.split(":").map(Number);
      const startTotal = startH * 60 + startM;
      const endTotal = endH * 60 + endM;

      if (endTotal > startTotal) {
        return currentTime >= startTotal && currentTime < endTotal;
      } else {
        return currentTime >= startTotal || currentTime < endTotal;
      }
    });
  }

  // If no active shift, return closed status
  if (!activeShift) {
    return res.status(200).json({
      success: true,
      isOpen: false,
      activeCount: 0,
      capacity: 0,
      message: "Gym is currently closed",
    });
  }

  // Get today's stats to count active users
  const stats = await GymDailyStats.findOne({ gymId, date: today });

  const activeUsers = stats?.register.filter(
    (user) =>
      !user.checkOutTimeReal && new Date(user.checkOutTimeCalc) > now
  ) || [];

  res.status(200).json({
    success: true,
    isOpen: true,
    activeCount: activeUsers.length,
    capacity: activeShift.capacity,
    shiftInfo: {
      name: activeShift.name,
      startTime: activeShift.startTime,
      endTime: activeShift.endTime,
      gender: activeShift.gender,
    },
  });
});


export const calculateGymDailyEarnings = async () => {
  const { testDate } = req.body;
  const yesterday = testDate;
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const tomorrow = new Date(yesterday);
  tomorrow.setDate(tomorrow.getDate() + 1);

  try {
    const gyms = await Gym.find({});

    for (const gym of gyms) {
      const gymId = gym._id;
      const gymOwnerId = gym.owner;

      const stats = await GymDailyStats.findOne({
        gymId,
        date: { $gte: yesterday, $lt: tomorrow },
      });

      if (!stats || !Array.isArray(stats.totalUsers)) continue;

      let totalAmount = 0;

      // for (const { userPlanId } of stats.totalUsers) {
      //   const userPlan = await UserPlan.findById(userPlanId);
      //   if (userPlan && userPlan.perDayCost) {
      //     totalAmount += userPlan.perDayCost;
      //   }
      // }

      for (const { perDayCost } of stats.register) {
        if (typeof perDayCost === "number") {
          totalAmount += perDayCost;
        }
      }

      if (totalAmount > 0) {
        // Step 1: Create wallet transaction if not exists
        await WalletTransaction.findOneAndUpdate(
          {
            userId: gymOwnerId,
            reason: "gymDailyEarning",
            transactionDate: { $gte: yesterday, $lt: tomorrow },
            gymId,
          },
          {
            $inc: { amount: totalAmount },
            $setOnInsert: {
              type: "Credit",
              status: "Pending",
              // transactionDate: new Date(),
              transactionDate: yesterday, // Use yesterday's date for the transaction
              reason: "gymDailyEarning",
              gymId,
            },
          },
          { upsert: true, new: true }
        );

        // Step 2: Update wallet balance
        await User.findByIdAndUpdate(gymOwnerId, {
          $inc: { walletBalance: totalAmount },
        });
      }
    }
  } catch (err) {
    console.error("Error calculating daily gym earnings:", err);
  }
};




