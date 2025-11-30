import mongoose from 'mongoose';
const { Schema } = mongoose;

const gymRatingSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  gymId: { type: Schema.Types.ObjectId, ref: 'Gym', required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  feedback: { type: String },
  // likes: { type: Number, default: 0 },
},{timestamps:true});

export default mongoose.model('GymRating', gymRatingSchema);
