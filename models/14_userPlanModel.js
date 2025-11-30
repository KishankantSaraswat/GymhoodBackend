import mongoose from 'mongoose';
const { Schema } = mongoose;

const userPlanSchema = new Schema({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  gymId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Gym', 
    required: true 
  },
  planId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Plan', 
    required: true 
  },
  perDayCost: { type: Number, required: true }, // amountDeducted / totalDays
  planDuration: { type: Number, required: true }, // from Plan.duration, for check-in/out limits
  amountDeducted: { type: Number, required: true },
  purchaseDate: { type: Date, default: Date.now },
  usedDays: { type: Number, default: 0 },
  totalDays: { type: Number, required: true },
  maxExpiryDate:{type:Date}, 
  isExpired: { type: Boolean, default: false }, //add max: 5*purchaseDate (careful, as user buy plan in past, to save future cost..as gymPlanPrice is inc with time)
  metadata: {
    originalPrice: Number,
    discountApplied: Number,
    gymShare: Number,
    platformShare: Number,
    refundHistory: [{
      amount: Number,
      date: Date,
      reason: String
    }]
  }
}, { timestamps: true });

// Middleware to auto-calculate maxExpiryDate when new plan is created
userPlanSchema.pre('save', function (next) {
  if (this.isNew && !this.maxExpiryDate) {
    const expiry = new Date(this.purchaseDate);
    expiry.setDate(expiry.getDate() + this.totalDays * 5);
    this.maxExpiryDate = expiry;

     // Auto-calculate perDayCost if not set
    if (!this.perDayCost && this.amountDeducted && this.totalDays) {
      this.perDayCost = this.amountDeducted / this.totalDays;
    }
  }
  next();
});

export default mongoose.model('UserPlan', userPlanSchema);


