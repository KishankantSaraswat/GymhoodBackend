import mongoose from 'mongoose';
const { Schema } = mongoose;

//It likeGymRegister (use indexing for faster query):

const gymDailyStatsSchema = new Schema({
    gymId: { type: Schema.Types.ObjectId, ref: 'Gym', required: true },
    date: { type: Date, required: true },
    totalUsersToday: { type: Number, default: 0 },
    activeUsers: { type: Number, default: 0 },
    register: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: String,
    photo: String,
    contactNo: String,
    userPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserPlan' },
    perDayCost: Number,
    checkInTime: Date,
    checkOutTimeCalc: Date,
    checkOutTimeReal: { type: Date, default: null }
  }],
    capacity: { type: Number, default: 0 }, 
  },{timestamps: true});
  
  export default mongoose.model('GymDailyStats', gymDailyStatsSchema);
  

 

  

