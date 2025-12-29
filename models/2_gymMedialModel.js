import mongoose from 'mongoose';
const { Schema } = mongoose;

const gymMediaSchema = new Schema({
  gymId: { type: Schema.Types.ObjectId, ref: 'Gym', required: true },
  // mediaType: { type: String, enum: ['photo', 'video'], required: true },
  // mediaUrl: { type: String, required: true },
  mediaUrls: [{ type: String }],   // List of uploaded photo/video URLs
  logoUrl: { type: String },        // Optional logo
  frontPhotoUrl: { type: String },
  receptionPhotoUrl: { type: String },
  workoutFloorPhotoUrl: { type: String },
  lockerRoomPhotoUrl: { type: String },
  trainerTeamPhotoUrl: { type: String },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('GymMedia', gymMediaSchema);
