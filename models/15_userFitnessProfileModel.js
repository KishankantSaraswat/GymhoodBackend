import mongoose from 'mongoose';
const { Schema } = mongoose;

const fitnessProfileSchema = new Schema({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    unique: true 
  },
  age: { type: Number },
  gender: { type: String },
  height: { type: Number }, // in cm
  weight: { type: Number }, // in kg
  bmi: { type: Number },
  bodyFatPercent: { type: Number },
  bodyMeasurement: {
    waist: { type: Number },
    chest: { type: Number },
    hip: { type: Number }
  },
  goal: { 
    type: String,
    enum: ['Weight Loss', 'Muscle Gain', 'Maintenance', 'Endurance', 'Other']
  },
  targetWeight: { type: Number },
  goalTimeFrame: { type: String },
  activityLevel: { 
    type: String,
    enum: ['Sedentary', 'Lightly Active', 'Moderately Active', 'Very Active', 'Extremely Active']
  },
  fitnessLevel: { 
    type: String,
    enum: ['Beginner', 'Intermediate', 'Advanced']
  },
  trainingHistory: { type: String },
  preferredWorkoutTime: { type: String },
  injuriesOrConstraints: { type: String },
  preferredWorkoutType: { type: [String] },
  availability: {
    daysPerWeek: { type: Number },
    minutesPerDay: { type: Number }
  },
  preTrainingLocation: { 
    type: String,
    enum: ['Gym', 'Home', 'Outdoor', 'Studio']
  },
  dietType: { 
    type: String,
    enum: ['Vegetarian', 'Vegan', 'Keto', 'Paleo', 'Mediterranean', 'Flexitarian', 'Other']
  },
  caloricIntakeGoal: { type: Number }
}, { timestamps: true }); // The timestamps option automatically creates createdAt and updatedAt fields in the schema

export default mongoose.model('FitnessProfile', fitnessProfileSchema);