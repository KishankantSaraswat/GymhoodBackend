
import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddlewares.js";
import Gym from '../models/1_gymModel.js';
import VerificationDocument from '../models/1_verificationDoc.js';
import { Announcement } from '../models/23_announcemenetModel.js';
import Plan from '../models/3_planModel.js';
import User from '../models/0_unifiedUserModel.js'

//if verified (then not deleted), if deleted (then not verified), (not verified==>(deleted, not deleted))
// catchAsyncError User (VVI) while writing controllers

//check if isDeleted?? (if changes to isVerified:true, then isDeleted:false (set))
export const toggleGymVerification = catchAsyncErrors(async (req, res, next) => {
  const gym = await Gym.findById(req.params.gymId);
  if (!gym) return next(new ErrorHandler("Gym not found", 404));
  gym.isVerified = !gym.isVerified;
  if (gym.isVerified) gym.isDeleted = false;
  await gym.save();
  res.json({ success: true, isVerified: gym.isVerified, isDeleted: gym.isDeleted, });
});
//if changes to (isDeleted: true==>isVerified:false set)
export const toggleGymDeletion = catchAsyncErrors(async (req, res, next) => {
  const gym = await Gym.findById(req.params.gymId);

  if (!gym) return next(new ErrorHandler("Gym not found", 404));
  gym.isDeleted = !gym.isDeleted;
  if (gym.isDeleted) gym.isVerified = false;
  await gym.save();
  res.json({ success: true, isDeleted: gym.isDeleted, isVerified: gym.isVerified, });
});

//if once deleted, admin can't see gym to make it toogle (so avoid deleteGym, as nonReversible like realDelete)
//if once deleted, admin can't see gym to make it toogle (so avoid deleteGym, as nonReversible like realDelete)
//if once deleted, admin can't see gym to make it toogle (so avoid deleteGym, as nonReversible like realDelete)
export const getUnverifiedGyms = catchAsyncErrors(async (req, res, next) => {
  const gyms = await Gym.find({ isVerified: false, isDeleted: false })
    .populate('media')
    .populate('verificationDocuments')
    .populate('owner', 'name email phone');

  res.json({ success: true, gyms });
});

export const getAllGymsForAdmin = catchAsyncErrors(async (req, res, next) => {
  const gyms = await Gym.find({ isDeleted: false })
    .sort({ createdAt: -1 })
    .populate('media')
    .populate('verificationDocuments')
    .populate('owner', 'name email phone');

  res.json({ success: true, gyms });
});

//createAnnouncementByGymOwner also need..
//find list of users belong to gym (userPlans ie notExpired->gymId) && send announcement to them only: targetType (specificUser) always

//if announcement common to allUsers && allGyms-->create two announcement with sameMessage with thisTargetType
export const createAnnouncement = catchAsyncErrors(async (req, res, next) => {
  const { title, message, targetType, targetGyms = [], targetUsers = [] } = req.body;

  if (!title || !message) return next(new ErrorHandler("Title and message required", 400));

  const announcement = await Announcement.create({
    title,
    message,
    createdBy: req.user._id,
    targetType,
    targetGyms,
    targetUsers,
  });

  res.status(201).json({ success: true, message: "Announcement created", announcement });
});



// controllers/announcementController.js
export const deleteAnnouncement = catchAsyncErrors(async (req, res, next) => {
  const announcementId = req.params.id;
  //   const userId = req.user._id;

  const announcement = await Announcement.findById(announcementId);

  if (!announcement) {
    return next(new ErrorHandler("Announcement not found", 404));
  }

  //No need of below: as isAdmin (middleware) is sufficient.. (as any admin can delete)

  //   // Only creator can delete
  //   if (!announcement.createdBy.equals(userId)) {
  //     return next(new ErrorHandler("Not authorized to delete this announcement", 403));
  //   }

  await announcement.deleteOne();

  res.status(200).json({
    success: true,
    message: "Announcement deleted successfully",
  });
});


//routeCreate
//condition: if userGymIds exist (gym: isVerified), then only ALL_GYMS announcement show
//update userGymIds to gymId (belongs to owner) && then find in list of targetGyms (ie find gym by userId-->take gymId of the finded gym)

// Get announcements based on user role
export const getUserAnnouncements = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user._id;
  const user = await User.findById(userId);

  let query;
  if (user.role === 'Admin') {
    query = {};
  }
  else if (user.role === 'GymOwner') {
    const gyms = await Gym.find({ owner: userId }).select('_id');
    query = {
      $or: [
        { targetType: "ALL_GYMS" },
        { targetType: "SPECIFIC_GYMS", targetGyms: { $in: gyms } }
      ]
    };
  }
  else { // Regular User
    query = {
      $or: [
        { targetType: "ALL_USERS" },
        { targetType: "SPECIFIC_USERS", targetUsers: { $in: [userId] } }
      ]
    };
  }

  const announcements = await Announcement.find(query).select('title message createdAt updatedAt').sort({ createdAt: -1 });
  res.status(200).json({ success: true, announcements });
});

// {
//   "message": "Gym will be closed tomorrow for maintenance."
// }

//byAdmin only (not for gyms, gyms->only use query with UserPlan->gymId->isExpired:false)
export const getUsersByQuery = catchAsyncErrors(async (req, res, next) => {
  const { search, role, email, phone, near } = req.query;
  const query = {};

  if (search) query.name = { $regex: search, $options: 'i' };
  if (role) query.role = role;
  if (email) query.email = email;
  if (phone) query.phone = phone;
  if (near) {
    const [lat, lng, radius] = near.split(',').map(Number);
    query['location.coordinates'] = {
      $near: {
        $geometry: { type: "Point", coordinates: [lng, lat] },
        $maxDistance: radius || 5000
      }
    };
  }

  const users = await User.find(query).select('_id name email role');
  res.status(200).json({ success: true, users });
});

export const getGymsByQuery = catchAsyncErrors(async (req, res, next) => {
  const { status, search, near } = req.query;
  const query = { isDeleted: false };

  if (status) query.status = status;
  if (search) query.name = { $regex: search, $options: 'i' };

  if (near) {
    const [lat, lng, radius] = near.split(',').map(Number);
    query['location.coordinates'] = {
      $near: {
        $geometry: { type: "Point", coordinates: [lng, lat] },
        $maxDistance: radius || 5000
      }
    };
  }

  const gyms = await Gym.find(query).select('_id name status');
  res.status(200).json({ success: true, gyms });
});


export const getPlansByQuery = catchAsyncErrors(async (req, res, next) => {
  const { minValidity, maxValidity, minPrice, maxPrice, minDiscount, maxDiscount, near } = req.query;
  const query = { isActive: true };

  // Price/Discount filters
  if (minValidity) query.validity = { $gte: Number(minValidity) };
  if (maxValidity) query.validity = { ...query.validity, $lte: Number(maxValidity) };
  if (minPrice) query.price = { $gte: Number(minPrice) };
  if (maxPrice) query.price = { ...query.price, $lte: Number(maxPrice) };
  if (minDiscount) query.discountPercent = { $gte: Number(minDiscount) };
  if (maxDiscount) query.discountPercent = { ...query.discountPercent, $lte: Number(maxDiscount) };

  // Handle geospatial query
  let gymIds = [];
  if (near) {
    const [lat, lng, radius] = near.split(',').map(Number);
    const gyms = await Gym.find({
      'location.coordinates': {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: radius || 10000 // Default 10km
        }
      }
    }).select('_id');

    gymIds = gyms.map(g => g._id);
    query.gymId = { $in: gymIds };
  }

  const plans = await Plan.find(query)
    .populate('gymId', 'name location status');

  res.status(200).json({ success: true, count: plans.length, plans });
});

export const updatePlanFactor = catchAsyncErrors(async (req, res, next) => {
  const { factor, planIds } = req.body;

  if (!factor || factor < 1) {
    return next(new ErrorHandler("Invalid factor value", 400));
  }

  if (!Array.isArray(planIds) || planIds.length === 0) {
    return next(new ErrorHandler("No plan IDs provided", 400));
  }

  // await Plan.updateMany({}, { maxExpiryFactor: factor });

  const result = await Plan.updateMany(
    { _id: { $in: planIds } },
    { $set: { maxExpiryFactor: factor } }
  );

  res.status(200).json({
    success: true,
    message: `${result.modifiedCount} plans updated with factor ${factor}`,
    updatedPlanIds: planIds
  });
});

// {
//   "factor": 1.5,
//   "planIds": [
//     "665e1f02f1b1c5b1e4a1a999",
//     "665e1f02f1b1c5b1e4a1aabc",
//     "665e1f02f1b1c5b1e4a1adef"
//   ]
// }





