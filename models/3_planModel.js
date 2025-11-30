import mongoose from 'mongoose';
const { Schema } = mongoose;

const planSchema = new Schema({
  gymId: { type: Schema.Types.ObjectId, ref: 'Gym', required: true },
  name: { type: String, required: true },
  validity: { type: Number, required: true }, // in days && a/c to planType
  price: { type: Number, required: true },
  discountPercent: { type: Number, default: 0, min:0, max:99 }, //keep it 0-100% (not fractin)
  duration:{ type: Number, required: true }, // in hours: workoutDuration
  features: { type: String },
  planType: { type: String }, //for now flexibility, , enum: ['day', 'monthly', 'yearly'], required: true
  isTrainerIncluded: { type: Boolean, default: false },
  maxExpiryFactor:{type:Number, default:1, min: 1},
  isActive: { type: Boolean, default: true }, //no deletion, gymOwner: can toggle the planStatus==>inActive plan (user can't see && buy)
  lastUpdatedAt: { type: Date, default: Date.now }
},{timestamps:true});

export default mongoose.model('Plan', planSchema);
