import mongoose from 'mongoose';
const { Schema } = mongoose;


const userGymLogSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  // userPlanId: { type: Schema.Types.ObjectId, ref: 'UserPlan', required: true }, //not planSpecific
  // gymId: { type: Schema.Types.ObjectId, ref: 'Gym', required: true }, //not gymSpecific..only userBehaviour trakcing..

  startingDate: { type: Date, required: true }, // Day 0 of the 1000-day array
  dateArray: { 
    type: [Number], 
    default: Array(300).fill(-1), // -1=unrecorded, 0=absent, 1=present
    validate: [arrayLimit, "Array must be 300 elements"]
  },
  currentStreak: { type: Number, default: 0 },  // Total active streak (e.g., 19 days)
  // maxStreak: { type: Number, default: 0 },      // Best streak ever
  currentWeekStreak: { type: Number, default: 0 }, // Full weeks in streak (e.g., 4 weeks)
  thisWeekStreak: { type: Number, default: 0 },    // Partial week count (e.g., 3 days)
  previousLog: { type: mongoose.Schema.Types.ObjectId, ref: "UserGymLog" } // Older logs
});

function arrayLimit(val) {
  return val.length === 300;
}

 export default mongoose.model('UserGymLog', userGymLogSchema);
