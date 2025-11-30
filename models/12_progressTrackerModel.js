import mongoose from 'mongoose';
const { Schema } = mongoose;

const projectTrackerSchema = new Schema({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  date: { type: Date, required: true },
  phyMetrics: {
    weight: { type: Number },
    bodyFatPercent: { type: Number },
    bmi: { type: Number },
    bodyMeasurement: { type: String }
  },
  perfMetrics: {
    benchPressMax: { type: Number },
    squatMax: { type: Number },
    deadliftMax: { type: Number },
    runDistance: { type: Number },
    runTime: { type: Number },
    pushUpsCount: { type: Number },
    pullUpsCount: { type: Number }
  },
  // consistency: {
  //   workoutCompleted: { type: Boolean },
  //   workoutType: { type: String },
  //   durationMins: { type: Number },
  //   moodLevel: { type: Number, min: 1, max: 5 },
  //   energyLevel: { type: Number, min: 1, max: 5 }
  // },
  notes: { type: String } //limited_Notes
}, { timestamps: true }); //createdAt and updatedAt fields will be added automatically


export default mongoose.model('ProjectTracker', projectTrackerSchema);