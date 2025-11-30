import cron from "node-cron"
import { calculateGymDailyEarnings } from "../controllers/4_userGymEntry.js";
import UserPlan from "../models/14_userPlanModel.js";

// Cron job runs every 12 hours (00:00 and 12:00)
cron.schedule('0 0,12 * * *', async () => {
  console.log('[CRON] Running streak updater...');

  try {
    const activePlans = await UserPlan.find({ isExpired: false });

    // Unique planIds if needed
    const userIds = activePlans.map(plan => plan.userId.toString());
    const uniqueUserIds = [...new Set(userIds)];

    for (const userId of uniqueUserIds) {
      const userGyms = await UserGym.find({ userId });

      for (const userGym of userGyms) {
        streak(userGym); // Updated logic inside
        await userGym.save();
      }
    }

    console.log('[CRON] Streaks updated successfully');
  } catch (error) {
    console.error('[CRON] Error while updating streaks:', error);
  }
});
