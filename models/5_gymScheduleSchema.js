import mongoose from 'mongoose';
const { Schema } = mongoose;


const gymScheduleSchema = new Schema({
  className: { type: String, required: true }, // e.g., Yoga, Crossfit
  // trainer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // linked to trainer user
  dayOfWeek: { type: String, enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], required: true },
  startTime: { type: String, required: true }, // e.g., '08:00'
  endTime: { type: String, required: true },   // e.g., '09:00'
  capacity: { type: Number, default: 20 },
  location: { type: String }, // e.g., "Room A" or "Main Hall"
  enrolledMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });


export default mongoose.model('GymSchedule', gymScheduleSchema);