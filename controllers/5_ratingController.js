import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddlewares.js";
import GymRating from "../models/8_gymRatingModel.js";
import UserPlan from "../models/14_userPlanModel.js";
import User from "../models/0_unifiedUserModel.js";
import mongoose from "mongoose";
import Gym from "../models/1_gymModel.js";

// Add Rating
export const addRating = catchAsyncErrors(async (req, res, next) => {
  const { gymId, rating, feedback } = req.body;
  const userId = req.user._id;

  // Check if user has purchased a plan from this gym
  const hasPurchased = await UserPlan.findOne({
    userId,
    gymId,
    isExpired: false
  });

  if (!hasPurchased) {
    return next(new ErrorHandler("You need an active plan to rate this gym", 403));
  }

  // Check if already rated (then updateRating)
  const existingRating = await GymRating.findOne({ userId, gymId });
  if (existingRating) {
    return next(new ErrorHandler("You have already rated this gym", 400));
  }

  const newRating = await GymRating.create({
    userId,
    gymId,
    rating,
    feedback,
    verifiedBuyer: true
  });

  // Update gym's average rating
  await updateGymAvgRating(gymId);

  res.status(201).json({
    success: true,
    message: "Rating submitted successfully",
    rating: newRating
  });
});

// Helper function to update gym's average rating
async function updateGymAvgRating(gymId) {
  const ratings = await GymRating.find({ gymId });

  if (ratings.length > 0) {
    const total = ratings.reduce((sum, rating) => sum + rating.rating, 0);
    const avg = total / ratings.length;

    await Gym.findByIdAndUpdate(gymId, { avgRating: avg });
  }
}

// Like/Dislike Rating
export const handleRatingAction = catchAsyncErrors(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const userId = req.user._id;
    const isLike = req.path.includes('like');
    const action = isLike ? 1 : -1;

    // Validate rating exists
    const rating = await GymRating.findById(id).session(session);
    if (!rating) {
      throw new ErrorHandler("Rating not found", 404);
    }

    // Check if user already interacted
    const user = await User.findById(userId).session(session);
    const existingInteraction = user.ratingInteractions?.find(
      i => i.ratingId.toString() === id
    );

    if (existingInteraction) {
      // Prevent duplicate actions
      if (existingInteraction.action === action) {
        throw new ErrorHandler(`Already ${isLike ? 'liked' : 'disliked'} this rating`, 400);
      }

      // Update existing interaction
      existingInteraction.action = action;
    } else {
      // Add new interaction
      user.ratingInteractions = user.ratingInteractions || [];
      user.ratingInteractions.push({
        ratingId: rating._id,
        action
      });
    }

    // Update rating count
    if (isLike) {
      rating.likes += action;
    } else {
      rating.dislikes += action;
    }

    // Save changes
    await Promise.all([
      rating.save({ session }),
      user.save({ session })
    ]);

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: `Rating ${isLike ? 'liked' : 'disliked'} successfully`,
      rating
    });

  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
});

export const getGymRatings = catchAsyncErrors(async (req, res, next) => {
  const { gymId } = req.params;
  // const gymObjectId = new mongoose.Types.ObjectId(gymId);
  // Validate gymId format
  if (!mongoose.Types.ObjectId.isValid(gymId)) {
    return next(new ErrorHandler('Invalid Gym ID format', 400));
  }

  // Convert to ObjectId
  // const gymObjectId = new mongoose.Types.ObjectId(gymId);
  // Find gym
  const gym = await Gym.findById(gymId);
  if (!gym) {
    return next(new ErrorHandler('Gym not found', 404));
  }

  const ratings = await GymRating.find({ gymId })
    .populate('userId', 'name profile_picture')
    .sort({ createdAt: -1 });


  // Return early if no ratings
  if (!ratings || ratings.length === 0) {
    return res.status(200).json({
      success: true,
      average: 0,
      ratings: []
    });
  }

  // Calculate average rating
  const avgRating = await GymRating.aggregate([
    // { $match: { gymId: mongoose.Types.ObjectId(gymId) } },
    { $match: { gymId } },
    { $group: { _id: null, average: { $avg: "$rating" } } }
  ]);

  res.status(200).json({
    success: true,
    average: avgRating[0]?.average || 0,
    ratings: ratings.map(r => ({
      id: r._id,
      rating: r.rating,
      feedback: r.feedback,
      user: {
        name: r.userId.name,
        profile_picture: r.userId.profile_picture || null
      },
      createdAt: r.createdAt
    }))
  });
});

// Update rating
export const updateRating = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { stars, comment } = req.body;
  const userId = req.user._id;
  const rating = await GymRating.findOneAndUpdate(
    { _id: id, userId },
    { rating: stars, feedback: comment },
    { new: true }
  );
  

  if (!rating) {
    return next(new ErrorHandler("Rating not found", 404));
  }

  res.status(200).json({
    success: true,
    rating
  });
});

// Delete rating
export const deleteRating = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { userId } = req.user;

  const rating = await GymRating.findOneAndDelete({ _id: id, userId });

  if (!rating) {
    return next(new ErrorHandler("Rating not found", 404));
  }

  res.status(200).json({
    success: true,
    message: "Rating deleted successfully"
  });
});