import mongoose from 'mongoose';
const { Schema } = mongoose;

// interface IGymPlanRevenue extends Document {
//   planId: mongoose.Types.ObjectId;
//   gymId: mongoose.Types.ObjectId;
//   date: Date;
//   revenue: number;
//   revenueType: 'daily' | 'monthly';
//   createdAt: Date;
// }

//get TimeWise PlanWise revenue of a gym (with planPurchase) //two plans sold on that day, revenue=2*planPrice
const gymPlanRevenueSchema = new Schema({
  planId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },
  gymId: { type: Schema.Types.ObjectId, ref: 'Gym', required: true },
  date: { type: Date, required: true }, 
  revenue: { type: Number, required: true,min:0 },
  createdAt: { type: Date, default: Date.now }
});


const analyticsCacheSchema = new mongoose.Schema({
  gymId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Gym'
  },
  type: {
    type: String,
    required: true,
    enum: ['revenue', 'members']
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for faster lookups
analyticsCacheSchema.index({ gymId: 1, type: 1 }, { unique: true });



//not need: as no more revenue decide with checkIns

// const gymFinanceSchema = new Schema({
//   gymId: { type: Schema.Types.ObjectId, ref: 'Gym', required: true },
//   monthYear: { type: String, required: true }, // Format: "YYYY-MM"
//   totalRevenue: { type: Number, default: 0 },
//   totalCheckins: { type: Number, default: 0 },
//   plans: { 
//     type: Map, 
//     of: new Schema({
//       count: { type: Number, default: 0 },
//       revenue: { type: Number, default: 0 }
//     })
//   }
// }, { timestamps: true });

// gymFinanceSchema.index({ gymId: 1, monthYear: 1 });


//M1: Use Named exports
export const GymPlanRevenue = mongoose.model('GymPlanRevenue', gymPlanRevenueSchema);
export const AnalyticsCache= mongoose.model('AnalyticsCache', analyticsCacheSchema);
// export const GymFinance = mongoose.model('GymFinance', gymFinanceSchema);
// import { GymPlanRevenue, GymFinance } from '../models/yourModelFile';

//M2: Export as an object
// const GymPlanRevenue = mongoose.model('GymPlanRevenue', gymPlanRevenueSchema);
// const GymFinance = mongoose.model('GymFinance', gymFinanceSchema);

// export default {
//   GymPlanRevenue,
//   GymFinance
// };
// import models from '../models/yourModelFile';

// models.GymPlanRevenue
// models.GymFinance