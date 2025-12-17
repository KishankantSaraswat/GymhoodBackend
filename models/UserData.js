import mongoose from "mongoose";

const userDataSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // adjust based on your actual User model
    required: true,
    unique: true
  },
  gender: {
    type: String,
    enum: ["Male", "Female", "Other"],
  },
  dob: {
    type: Date,
  },
  weight: {
    type: Number, // in kilograms
  },
  height: {
    type: Number, // in centimeters
  },
  location: {
    type: String,
  },
  workoutExperience: {
    type: String,
    enum: ["Beginner", "Intermediate", "Advanced"],
  },
  jobProfile: {
    type: String,
    enum: ["Student", "Employee", "Self-employed", "Business person"],
  },
  bodyType: {
    type: String,
    enum: ["Ectomorph", "Mesomorph", "Endomorph"],
  },
  sleepHoursPerDay: {
    type: Number,
  },
  smokingStatus: {
    type: String,
    enum: ["Non-smoker", "Occasional", "Regular", "Heavy"],
  },
  alcoholConsumption: {
    type: String,
    enum: ["None", "Social", "Moderate", "Regular"],
  },
  dailyWaterIntake: {
    type: Number,
  },
  foodAllergies: {
    type: String,
  },
  foodType: {
    type: String,
    enum: ["Vegetarian", "Non-Vegetarian", "Vegan", "Eggetarian"],
  },
  income: {
    type: String,
    enum: ["Less than 4 LPA", "4-9 LPA", "9+ LPA"],
  },
  pastInjury: {
    type: String,
  },
  preferredGymTime: {
    type: String,
    enum: ["Early Morning (5-8 AM)", "Morning (8-11 AM)", "Afternoon (12-4 PM)", "Evening (5-8 PM)", "Night (8-11 PM)"],
  },
}, {
  timestamps: true
});

export const UserData = mongoose.model("UserData", userDataSchema);
