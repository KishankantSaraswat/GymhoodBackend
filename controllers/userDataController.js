import { UserData } from "../models/UserData.js";

// Create or Update user data by userId (upsert)
export const createUserData = async (req, res) => {
  try {
    const {
      userId,
      gender,
      dob,
      weight,
      height,
      location,
      workoutExperience,
      jobProfile,
      bodyType,
      sleepHoursPerDay,
      smokingStatus,
      alcoholConsumption,
      dailyWaterIntake,
      foodAllergies,
      foodType
    } = req.body;

    // Use findOneAndUpdate with upsert to create or update
    const userData = await UserData.findOneAndUpdate(
      { userId },
      {
        userId,
        gender,
        dob,
        weight,
        height,
        location,
        workoutExperience,
        jobProfile,
        bodyType,
        sleepHoursPerDay,
        smokingStatus,
        alcoholConsumption,
        dailyWaterIntake,
        foodAllergies,
        foodType,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

    res.status(201).json({ message: "User data created/updated", userData });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update user data by userId
export const updateUserData = async (req, res) => {
  try {
    const userId = req.params.userId;
    const updatedData = req.body;

    const userData = await UserData.findOneAndUpdate({ userId }, updatedData, {
      new: true,
    });

    if (!userData)
      return res.status(404).json({ message: "User data not found" });

    res.json({ message: "User data updated", userData });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete user data by userId
export const deleteUserData = async (req, res) => {
  try {
    const userId = req.params.userId;
    const deleted = await UserData.findOneAndDelete({ userId });

    if (!deleted)
      return res.status(404).json({ message: "User data not found" });

    res.json({ message: "User data deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get user data by userId
export const getUserData = async (req, res) => {
  try {
    const userId = req.params.userId;

    const userData = await UserData.findOne({ userId });
    if (!userData)
      return res.status(404).json({ message: "User data not found" });

    res.json(userData);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
